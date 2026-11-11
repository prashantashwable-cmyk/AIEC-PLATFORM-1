import { z } from 'zod';
import { PAGE_SIZE } from '@/lib/config';
import { COMPLIANCE_DOC_TYPE, MATERIAL_STATUS, MILESTONE_STATUS, type ProjectStatus, type TaskStatus } from '@/lib/enums';
import { AppError } from '@/lib/errors';
import { isoDateIST } from '@/lib/format';
import { PROJECT_MACHINE, TASK_MACHINE, assertTransition } from '@/lib/state';
import { zBool, zEnum, zNumber, zOptDate, zOptText, zText, zUuid } from '@/lib/validation';
import { audit, notifyCompany, notifyCustomer, notifyPermission, notifyUsers } from '../audit';
import { can, canAny, requirePerm, type Ctx } from '../ctx';
import { withCtx, type Rec, type Tx } from '../db';
import { saveFile } from './files';
import { assertPartnerFitForWork } from './partners';

type Upload = { name: string; type: string; bytes: Buffer };

export async function listProjects(ctx: Ctx, filter: { status?: string; page?: number }) {
  const params: unknown[] = [];
  const where = ['true']; // tenant scope (staff / own company / own customer / assigned technician) is enforced by RLS
  if (ctx.isInternal) requirePerm(ctx, 'project.view.all');
  if (filter.status) { params.push(filter.status); where.push(`p.status = $${params.length}`); }
  const page = Math.max(1, filter.page ?? 1);
  return withCtx(ctx, async (tx) => {
    const from = `from projects p join companies co on co.id = p.company_id join customers c on c.id = p.customer_id join leads l on l.id = p.lead_id
                  join orders o on o.id = p.order_id where ${where.join(' and ')}`;
    const total = (await tx.one<{ n: number }>(`select count(*) as n ${from}`, params)).n;
    const rows = await tx.query<Rec>(
      `select p.id, p.project_number, p.status, p.planned_start, p.planned_end, p.created_at, co.legal_name, c.name as customer_name, l.project_name,
              o.gross_order_value,
              (select count(*) from project_milestones m where m.project_id = p.id and m.status = 'COMPLETED') as milestones_done,
              (select count(*) from project_milestones m where m.project_id = p.id) as milestones_total
         ${from} order by p.created_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, params);
    return { rows, total, page };
  });
}

async function loadProject(tx: Tx, id: string, lock = false): Promise<Rec> {
  return tx.one<Rec>(`select p.* from projects p where p.id = $1 ${lock ? 'for update' : ''}`, [id]);
}

/** Required documents for a gate that are not yet uploaded and VERIFIED (configuration-driven, spec 9.2/9.3). */
export async function missingGateDocs(tx: Tx, projectId: string, gate: 'PROJECT_START' | 'HANDOVER'): Promise<string[]> {
  const rows = await tx.query<{ doc_type: string }>(
    `select r.doc_type from compliance_requirements r where r.gate = $2 and r.is_active
        and not exists (select 1 from compliance_documents d where d.project_id = $1 and d.doc_type = r.doc_type and d.verification_status = 'VERIFIED'
                         and (d.expiry_date is null or d.expiry_date >= (now() at time zone 'Asia/Kolkata')::date)) order by r.doc_type`, [projectId, gate]);
  return rows.map((r) => r.doc_type);
}

export async function getProject(ctx: Ctx, id: string) {
  return withCtx(ctx, async (tx) => {
    const project = await tx.one<Rec>(
      `select p.*, co.legal_name, c.name as customer_name, c.phone as customer_phone, l.project_name, l.address, l.lead_number, z.code as zone_code,
              o.order_number, su.full_name as supervisor_name
         from projects p join companies co on co.id = p.company_id join customers c on c.id = p.customer_id join leads l on l.id = p.lead_id
         join zones z on z.id = l.zone_id left join orders o on o.id = p.order_id left join users su on su.id = p.supervisor_user_id where p.id = $1`, [id]);
    const showMoney = !ctx.isTechnician;
    const [milestones, tasks, team, evidence, materials, documents, events, defects, attendance, checklists, warranty, members, suppliers, startMissing, handoverMissing] = await Promise.all([
      showMoney ? tx.query<Rec>('select * from project_milestones where project_id = $1 order by seq', [id]) : Promise.resolve([] as Rec[]),
      tx.query<Rec>(`select t.*, u.full_name as assignee from project_tasks t left join users u on u.id = t.assigned_to where t.project_id = $1 order by t.created_at`, [id]),
      tx.query<Rec>(`select a.user_id, u.full_name from project_team_assignments a join users u on u.id = a.user_id where a.project_id = $1 order by u.full_name`, [id]),
      tx.query<Rec>(
        `select e.id, e.file_id, e.caption, e.captured_at_device, e.received_at, e.task_id, f.mime_type, u.full_name as uploader
           from work_evidence e join file_objects f on f.id = e.file_id left join users u on u.id = e.uploaded_by where e.project_id = $1 order by e.received_at desc`, [id]),
      tx.query<Rec>(`select m.*, s.legal_name as supplier from material_orders m left join companies s on s.id = m.supplier_company_id where m.project_id = $1 order by m.created_at`, [id]),
      tx.query<Rec>('select * from compliance_documents where project_id = $1 order by created_at desc', [id]),
      tx.query<Rec>('select e.*, u.full_name as actor from project_state_events e left join users u on u.id = e.actor_id where e.project_id = $1 order by e.created_at', [id]),
      tx.query<Rec>('select * from qc_defects where project_id = $1 order by created_at desc', [id]),
      tx.query<Rec>(`select a.*, u.full_name from technician_attendance a join users u on u.id = a.user_id where a.project_id = $1 order by a.captured_at_device desc limit 30`, [id]),
      tx.query<Rec>(`select s.*, u.full_name from safety_checklists s join users u on u.id = s.user_id where s.project_id = $1 order by s.captured_at_device desc limit 30`, [id]),
      tx.maybeOne<Rec>('select * from warranties where project_id = $1', [id]),
      ctx.companyId === project.company_id && !ctx.isTechnician
        ? tx.query<Rec>(
          `select distinct u.id, u.full_name from user_roles ur join users u on u.id = ur.user_id where ur.company_id = $1 and ur.revoked_at is null order by u.full_name`, [project.company_id])
        : Promise.resolve([] as Rec[]),
      tx.query<Rec>(`select id, legal_name from companies where category in ('MANUFACTURER','SUPPLIER') and status = 'ACTIVE' order by legal_name`),
      missingGateDocs(tx, id, 'PROJECT_START'),
      missingGateDocs(tx, id, 'HANDOVER'),
    ]);
    return { project, milestones, tasks, team, evidence, materials, documents, events, defects, attendance, checklists, warranty, members, suppliers, startMissing, handoverMissing };
  });
}

/** Writes a project status change. Callers are responsible for authorisation and gates. */
export async function setProjectStatus(tx: Tx, ctx: Ctx | null, project: Rec, to: ProjectStatus, reason: string | null): Promise<void> {
  const from = project.status as ProjectStatus;
  if (from === to) return;
  assertTransition(PROJECT_MACHINE, from, to);
  const pausing = to === 'ON_HOLD' || to === 'STOP_WORK';
  await tx.exec(
    `update projects set status = $2, status_reason = $3, updated_at = now(),
            status_before_hold = case when $4 then coalesce(status_before_hold, status) else null end,
            started_at = case when $2 = 'IN_PROGRESS' then coalesce(started_at, now()) else started_at end,
            handed_over_at = case when $2 = 'HANDED_OVER' then now() else handed_over_at end where id = $1`,
    [project.id, to, reason, pausing]);
  await tx.exec('insert into project_state_events (project_id, from_status, to_status, actor_id, reason) values ($1,$2,$3,$4,$5)',
    [project.id, from, to, ctx?.userId ?? null, reason]);
  await audit(tx, ctx, 'project.status', 'project', project.id, { from, to, reason }, project.company_id);
}

export const projectStatusSchema = z.object({
  id: zUuid, to: zEnum(['IN_PROGRESS', 'QC', 'HANDOVER_PENDING', 'HANDED_OVER', 'ON_HOLD', 'STOP_WORK', 'RESUME', 'CLOSED', 'CANCELLED'] as const), reason: zOptText(500),
});

/**
 * Project status changes with their safety and compliance gates (spec 9.3):
 * work cannot start without verified documents and confirmed site conditions; anyone on the
 * project can stop unsafe work; only AIEC can lift a stop-work order or approve handover.
 */
export async function changeProjectStatus(ctx: Ctx, input: z.infer<typeof projectStatusSchema>): Promise<void> {
  await withCtx(ctx, async (tx) => {
    const project = await loadProject(tx, input.id, true); // RLS: only projects the caller belongs to
    const staff = ctx.isInternal && canAny(ctx, 'project.manage', 'qc.review', 'incident.manage');
    const partnerLead = ctx.companyId === project.company_id && can(ctx, 'project.assign');
    const onProject = staff || ctx.companyId === project.company_id;
    const needReason = ['ON_HOLD', 'STOP_WORK', 'CANCELLED'].includes(input.to);
    if (needReason && !input.reason) throw new AppError('REASON_REQUIRED');

    switch (input.to) {
      case 'STOP_WORK': {
        if (!onProject) throw new AppError('FORBIDDEN');
        await setProjectStatus(tx, ctx, project, 'STOP_WORK', input.reason ?? null);
        await notifyPermission(tx, 'incident.manage', 'STOP_WORK', { number: project.project_number }, `/admin/projects/${project.id}`);
        await notifyCompany(tx, project.company_id, 'STOP_WORK', { number: project.project_number }, `/partner/projects/${project.id}`);
        return;
      }
      case 'ON_HOLD':
        if (!staff && !partnerLead) throw new AppError('FORBIDDEN');
        await setProjectStatus(tx, ctx, project, 'ON_HOLD', input.reason ?? null);
        break;
      case 'RESUME': {
        if (!['ON_HOLD', 'STOP_WORK'].includes(project.status) || !project.status_before_hold) throw new AppError('INVALID_TRANSITION');
        // A stop-work order is a safety control: only AIEC may lift it.
        if (project.status === 'STOP_WORK' ? !(ctx.isInternal && canAny(ctx, 'incident.manage', 'project.manage')) : !staff && !partnerLead) throw new AppError('FORBIDDEN');
        await setProjectStatus(tx, ctx, project, project.status_before_hold, input.reason ?? 'Resumed');
        break;
      }
      case 'IN_PROGRESS': {
        if (!staff && !partnerLead) throw new AppError('FORBIDDEN');
        if (project.status === 'PLANNING') {
          await assertPartnerFitForWork(tx, project.company_id);
          const missing = await missingGateDocs(tx, project.id, 'PROJECT_START');
          if (missing.length) throw new AppError('COMPLIANCE_HOLD', { docs: missing.join(', ') });
          if (!project.site_ready || !project.permissions_confirmed) throw new AppError('SITE_NOT_READY');
        }
        await setProjectStatus(tx, ctx, project, 'IN_PROGRESS', input.reason ?? null);
        break;
      }
      case 'QC':
        if (!staff && !partnerLead) throw new AppError('FORBIDDEN');
        await setProjectStatus(tx, ctx, project, 'QC', input.reason ?? null);
        await notifyPermission(tx, 'qc.review', 'QC_REQUESTED', { number: project.project_number }, `/admin/projects/${project.id}`);
        break;
      case 'HANDOVER_PENDING': {
        if (!(ctx.isInternal && canAny(ctx, 'qc.review', 'project.manage'))) throw new AppError('FORBIDDEN');
        const last = await tx.maybeOne<{ result: string }>('select result from qc_inspections where project_id = $1 order by inspected_on desc, created_at desc limit 1', [project.id]);
        if (last?.result !== 'PASS') throw new AppError('QC_NOT_PASSED');
        await assertNoOpenDefects(tx, project.id);
        await setProjectStatus(tx, ctx, project, 'HANDOVER_PENDING', input.reason ?? null);
        break;
      }
      case 'HANDED_OVER': {
        if (!(ctx.isInternal && can(ctx, 'project.manage'))) throw new AppError('FORBIDDEN');
        // Internal QC is not statutory inspection: handover separately requires the verified statutory documents.
        const missing = await missingGateDocs(tx, project.id, 'HANDOVER');
        if (missing.length) throw new AppError('COMPLIANCE_HOLD', { docs: missing.join(', ') });
        await assertNoOpenDefects(tx, project.id);
        await setProjectStatus(tx, ctx, project, 'HANDED_OVER', input.reason ?? null);
        const months = (await tx.one<{ m: number | null }>(
          'select v.warranty_months as m from orders o join quotation_versions v on v.id = o.quotation_version_id where o.id = $1', [project.order_id])).m ?? 0;
        const today = isoDateIST();
        await tx.exec(
          `insert into warranties (project_id, company_id, customer_id, starts_on, ends_on, terms)
           values ($1,$2,$3,$4::date, ($4::date + ($5 || ' months')::interval)::date, 'As per selected quotation and customer–partner contract') on conflict (project_id) do nothing`,
          [project.id, project.company_id, project.customer_id, today, String(months)]);
        await tx.exec(`update orders set status = 'COMPLETED', updated_at = now() where id = $1 and status = 'CONFIRMED'`, [project.order_id]);
        await tx.exec(`insert into order_state_events (order_id, from_status, to_status, actor_id, reason) values ($1,'CONFIRMED','COMPLETED',$2,'Project handed over')`, [project.order_id, ctx.userId]);
        const late = project.planned_end && project.planned_end < today;
        await tx.exec('insert into partner_performance_events (company_id, event_type, score, note, created_by) values ($1,$2,$3,$4,$5)',
          [project.company_id, late ? 'PROJECT_DELAYED' : 'PROJECT_ON_TIME', late ? 40 : 100, `Project ${project.project_number} handed over`, ctx.userId]);
        break;
      }
      case 'CLOSED':
      case 'CANCELLED':
        if (!(ctx.isInternal && can(ctx, 'project.manage'))) throw new AppError('FORBIDDEN');
        await setProjectStatus(tx, ctx, project, input.to, input.reason ?? null);
        break;
    }
    await notifyCustomer(tx, project.customer_id, 'PROJECT_STATUS', { number: project.project_number, status: input.to }, `/customer/projects/${project.lead_id}`);
  });
}

async function assertNoOpenDefects(tx: Tx, projectId: string): Promise<void> {
  const open = (await tx.one<{ n: number }>(`select count(*) as n from qc_defects where project_id = $1 and status <> 'CLOSED'`, [projectId])).n;
  if (open) throw new AppError('OPEN_DEFECTS');
}

export const readinessSchema = z.object({ id: zUuid, siteReady: zBool, permissionsConfirmed: zBool, plannedStart: zOptDate, plannedEnd: zOptDate });
/** Partner confirms site readiness; only AIEC confirms that required permissions are in place. */
export async function updateReadiness(ctx: Ctx, input: z.infer<typeof readinessSchema>): Promise<void> {
  await withCtx(ctx, async (tx) => {
    const project = await loadProject(tx, input.id, true);
    const staff = ctx.isInternal && canAny(ctx, 'project.manage', 'compliance.document.approve');
    const partnerLead = ctx.companyId === project.company_id && can(ctx, 'project.assign');
    if (!staff && !partnerLead) throw new AppError('FORBIDDEN');
    if (input.plannedStart && input.plannedEnd && input.plannedEnd < input.plannedStart) throw new AppError('VALIDATION', undefined, { plannedEnd: 'INVALID_DATE' });
    await tx.exec(
      `update projects set site_ready = $2, permissions_confirmed = case when $6 then $3 else permissions_confirmed end, planned_start = $4, planned_end = $5, updated_at = now() where id = $1`,
      [input.id, input.siteReady, input.permissionsConfirmed, input.plannedStart ?? null, input.plannedEnd ?? null, staff]);
    await audit(tx, ctx, 'project.readiness', 'project', input.id, { ...input, byStaff: staff }, project.company_id);
  });
}

// ───────────── tasks ─────────────
async function ownProjectForLead(tx: Tx, ctx: Ctx, projectId: string): Promise<Rec> {
  requirePerm(ctx, 'project.assign');
  const project = await loadProject(tx, projectId);
  if (project.company_id !== ctx.companyId) throw new AppError('FORBIDDEN');
  return project;
}
async function assertMember(tx: Tx, companyId: string, userId: string): Promise<void> {
  await tx.one('select 1 from user_roles where user_id = $1 and company_id = $2 and revoked_at is null limit 1', [userId, companyId]);
}

export const taskSchema = z.object({ projectId: zUuid, title: zText(200), description: zOptText(2000), assignedTo: zUuid, dueDate: zOptDate, safetyCritical: zBool });
export async function createTask(ctx: Ctx, input: z.infer<typeof taskSchema>): Promise<void> {
  await withCtx(ctx, async (tx) => {
    const project = await ownProjectForLead(tx, ctx, input.projectId);
    if (['HANDED_OVER', 'CLOSED', 'CANCELLED'].includes(project.status)) throw new AppError('INVALID_TRANSITION');
    await assertMember(tx, project.company_id, input.assignedTo);
    const task = await tx.one<{ id: string }>(
      `insert into project_tasks (project_id, company_id, title, description, assigned_to, due_date, safety_critical, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [input.projectId, project.company_id, input.title, input.description ?? null, input.assignedTo, input.dueDate ?? null, input.safetyCritical, ctx.userId]);
    await tx.exec('insert into project_team_assignments (project_id, user_id, company_id, assigned_by) values ($1,$2,$3,$4) on conflict do nothing',
      [input.projectId, input.assignedTo, project.company_id, ctx.userId]);
    await audit(tx, ctx, 'task.create', 'project_task', task.id, { title: input.title, assignedTo: input.assignedTo }, project.company_id);
    await notifyUsers(tx, [input.assignedTo], 'TASK_ASSIGNED', { title: input.title, number: project.project_number }, '/tech');
  });
}

/**
 * Field progress by the assigned person (also used by offline sync). Completion only moves the task to
 * "awaiting review": it never implies a safety-critical approval. Blocked while a stop-work order is active.
 */
export async function updateTaskProgress(
  tx: Tx, ctx: Ctx, input: { taskId: string; to: 'IN_PROGRESS' | 'DONE_PENDING_REVIEW'; note?: string | null; capturedAt?: Date },
): Promise<void> {
  if (!can(ctx, 'task.perform')) throw new AppError('FORBIDDEN');
  const task = await tx.one<Rec>('select t.*, p.status as project_status from project_tasks t join projects p on p.id = t.project_id where t.id = $1 for update of t', [input.taskId]);
  if (task.assigned_to !== ctx.userId) throw new AppError('FORBIDDEN');
  if (task.project_status === 'STOP_WORK') throw new AppError('STOP_WORK_ACTIVE');
  if (task.status === input.to) return; // idempotent replays
  assertTransition(TASK_MACHINE, task.status as TaskStatus, input.to);
  const done = input.to === 'DONE_PENDING_REVIEW';
  await tx.exec(
    `update project_tasks set status = $2, progress_note = coalesce($3, progress_note),
            completed_at_device = case when $4 then $5 else completed_at_device end, completed_received_at = case when $4 then now() else completed_received_at end where id = $1`,
    [input.taskId, input.to, input.note ?? null, done, input.capturedAt ?? new Date()]);
  await audit(tx, ctx, 'task.progress', 'project_task', input.taskId, { to: input.to }, task.company_id);
}

export const taskReviewSchema = z.object({ id: zUuid, decision: zEnum(['approve', 'rework'] as const), note: zOptText(1000) });
export async function reviewTask(ctx: Ctx, input: z.infer<typeof taskReviewSchema>): Promise<void> {
  requirePerm(ctx, 'project.assign');
  const approve = input.decision === 'approve';
  if (!approve && !input.note) throw new AppError('REASON_REQUIRED');
  await withCtx(ctx, async (tx) => {
    const task = await tx.one<Rec>('select * from project_tasks where id = $1 and company_id = $2 for update', [input.id, ctx.companyId]);
    assertTransition(TASK_MACHINE, task.status as TaskStatus, approve ? 'APPROVED' : 'REWORK');
    // Work is reviewed by someone other than the person who did it.
    if (task.assigned_to === ctx.userId && task.safety_critical) throw new AppError('SELF_REVIEW');
    await tx.exec('update project_tasks set status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4 where id = $1',
      [input.id, approve ? 'APPROVED' : 'REWORK', ctx.userId, input.note ?? null]);
    await audit(tx, ctx, 'task.review', 'project_task', input.id, { approve }, task.company_id);
    await notifyUsers(tx, [task.assigned_to], approve ? 'TASK_APPROVED' : 'TASK_REWORK', { title: task.title }, '/tech');
  });
}

export const milestoneSchema = z.object({ id: zUuid, status: zEnum(MILESTONE_STATUS), dueDate: zOptDate, note: zOptText(500) });
export async function updateMilestone(ctx: Ctx, input: z.infer<typeof milestoneSchema>): Promise<void> {
  requirePerm(ctx, 'milestone.update');
  await withCtx(ctx, async (tx) => {
    const m = await tx.one<Rec>(
      `select m.*, p.customer_id, p.lead_id, p.project_number, p.status as project_status from project_milestones m join projects p on p.id = m.project_id
        where m.id = $1 and m.company_id = $2 for update of m`, [input.id, ctx.companyId]);
    if (m.project_status === 'STOP_WORK') throw new AppError('STOP_WORK_ACTIVE');
    await tx.exec(
      `update project_milestones set status = $2, due_date = $3, note = $4, completed_at = case when $2 = 'COMPLETED' then coalesce(completed_at, now()) else null end where id = $1`,
      [input.id, input.status, input.dueDate ?? null, input.note ?? null]);
    await audit(tx, ctx, 'milestone.update', 'project_milestone', input.id, { from: m.status, to: input.status }, m.company_id);
    if (input.status !== m.status) {
      await notifyCustomer(tx, m.customer_id, 'MILESTONE_UPDATE', { number: m.project_number, name: m.name, status: input.status }, `/customer/projects/${m.lead_id}`);
      await notifyPermission(tx, 'project.manage', 'MILESTONE_UPDATE', { number: m.project_number, name: m.name, status: input.status }, `/admin/projects/${m.project_id}`);
    }
  });
}

export async function assignTeamMember(ctx: Ctx, projectId: string, userId: string): Promise<void> {
  await withCtx(ctx, async (tx) => {
    const project = await ownProjectForLead(tx, ctx, projectId);
    await assertMember(tx, project.company_id, userId);
    await tx.exec('insert into project_team_assignments (project_id, user_id, company_id, assigned_by) values ($1,$2,$3,$4) on conflict do nothing',
      [projectId, userId, project.company_id, ctx.userId]);
    await audit(tx, ctx, 'project.team_assign', 'project', projectId, { userId }, project.company_id);
  });
}

/** Work evidence with separate device-capture and server-receipt times. `clientEventId` makes offline retries safe. */
export async function addWorkEvidence(
  tx: Tx, ctx: Ctx, input: { projectId: string; taskId?: string | null; caption?: string | null; capturedAt?: Date | null; clientEventId?: string | null }, file: Upload,
): Promise<void> {
  if (!can(ctx, 'evidence.submit')) throw new AppError('FORBIDDEN');
  const project = await loadProject(tx, input.projectId);
  if (project.company_id !== ctx.companyId) throw new AppError('FORBIDDEN');
  if (input.taskId) await tx.one('select 1 from project_tasks where id = $1 and project_id = $2', [input.taskId, input.projectId]);
  const fileId = await saveFile(tx, ctx, file, 'WORK_EVIDENCE', { companyId: project.company_id, customerId: project.customer_id });
  await tx.exec(
    `insert into work_evidence (project_id, company_id, task_id, file_id, caption, uploaded_by, captured_at_device, client_event_id) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [input.projectId, project.company_id, input.taskId ?? null, fileId, input.caption ?? null, ctx.userId, input.capturedAt ?? null, input.clientEventId ?? null]);
}

export const materialSchema = z.object({
  projectId: zUuid, description: zText(300), quantity: zNumber(0.01, 1000000), unit: zText(20).default('nos'), supplierCompanyId: zUuid.optional(), expectedDate: zOptDate,
});
export async function addMaterialOrder(ctx: Ctx, input: z.infer<typeof materialSchema>): Promise<void> {
  await withCtx(ctx, async (tx) => {
    const project = await ownProjectForLead(tx, ctx, input.projectId);
    const row = await tx.one<{ id: string }>(
      `insert into material_orders (project_id, company_id, supplier_company_id, description, quantity, unit, expected_date, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [input.projectId, project.company_id, input.supplierCompanyId ?? null, input.description, input.quantity, input.unit, input.expectedDate ?? null, ctx.userId]);
    await audit(tx, ctx, 'material.create', 'material_order', row.id, { description: input.description }, project.company_id);
    if (input.supplierCompanyId) await notifyCompany(tx, input.supplierCompanyId, 'MATERIAL_ORDER', { number: project.project_number }, '/partner/catalogue');
  });
}

export const materialStatusSchema = z.object({ id: zUuid, status: zEnum(MATERIAL_STATUS) });
/** The ordering partner or the named supplier can move a material order forward. */
export async function updateMaterialStatus(ctx: Ctx, input: z.infer<typeof materialStatusSchema>): Promise<void> {
  requirePerm(ctx, 'project.assign', 'catalogue.manage');
  await withCtx(ctx, async (tx) => {
    const m = await tx.one<Rec>('select * from material_orders where id = $1 and (company_id = $2 or supplier_company_id = $2) for update', [input.id, ctx.companyId]);
    await tx.exec(`update material_orders set status = $2, delivered_at = case when $2 = 'DELIVERED' then now() else null end where id = $1`, [input.id, input.status]);
    await audit(tx, ctx, 'material.status', 'material_order', input.id, { from: m.status, to: input.status }, m.company_id);
  });
}

export const complianceDocSchema = z.object({
  projectId: zUuid, docType: zEnum(COMPLIANCE_DOC_TYPE), authority: zOptText(200), referenceNumber: zOptText(100), issueDate: zOptDate, expiryDate: zOptDate,
});
/** Statutory / project documents are uploaded by the responsible partner and verified by AIEC. AIEC never issues them. */
export async function addComplianceDocument(ctx: Ctx, input: z.infer<typeof complianceDocSchema>, file: Upload | null): Promise<void> {
  if (!file) throw new AppError('VALIDATION', undefined, { file: 'FILE_REQUIRED' });
  await withCtx(ctx, async (tx) => {
    const project = await loadProject(tx, input.projectId);
    const partnerLead = ctx.companyId === project.company_id && can(ctx, 'project.assign');
    const staff = ctx.isInternal && canAny(ctx, 'compliance.manage', 'project.manage');
    if (!partnerLead && !staff) throw new AppError('FORBIDDEN');
    const fileId = await saveFile(tx, ctx, file, 'COMPLIANCE', { companyId: project.company_id, customerId: project.customer_id });
    const row = await tx.one<{ id: string }>(
      `insert into compliance_documents (doc_type, authority, reference_number, issue_date, expiry_date, company_id, project_id, customer_id, file_id, uploaded_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [input.docType, input.authority ?? null, input.referenceNumber ?? null, input.issueDate ?? null, input.expiryDate ?? null, project.company_id,
        input.projectId, project.customer_id, fileId, ctx.userId]);
    await audit(tx, ctx, 'compliance.document_add', 'compliance_document', row.id, { docType: input.docType }, project.company_id);
    await notifyPermission(tx, 'compliance.document.approve', 'COMPLIANCE_DOC_SUBMITTED', { number: project.project_number, type: input.docType }, `/admin/projects/${project.id}`);
  });
}
