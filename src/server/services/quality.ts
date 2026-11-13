import { z } from 'zod';
import { COMPLIANCE_DOC_TYPE, COMPLIANCE_GATE, INCIDENT_STATUS, QC_RESULT, SEVERITY, type IncidentStatus } from '@/lib/enums';
import { AppError } from '@/lib/errors';
import { INCIDENT_MACHINE, assertTransition } from '@/lib/state';
import { istLocalToDate, zBool, zDate, zDateTime, zEnum, zOptDate, zOptText, zText, zUuid } from '@/lib/validation';
import { audit, notifyCompany, notifyCustomer, notifyPermission } from '../audit';
import { can, canAny, requirePerm, type Ctx } from '../ctx';
import { withCtx, type Rec, type Tx } from '../db';
import { setProjectStatus } from './projects';

// ───────────── compliance register ─────────────
export async function getComplianceOverview(ctx: Ctx) {
  requirePerm(ctx, 'compliance.view');
  return withCtx(ctx, async (tx) => {
    const [documents, requirements, sources, licences, insurance] = await Promise.all([
      tx.query<Rec>(
        `select d.*, co.legal_name, p.project_number from compliance_documents d join companies co on co.id = d.company_id
           left join projects p on p.id = d.project_id order by (d.verification_status = 'PENDING') desc, d.created_at desc limit 200`),
      tx.query<Rec>('select r.*, s.title as source_title, s.verification_status as source_status from compliance_requirements r left join regulatory_sources s on s.id = r.source_id order by r.gate, r.doc_type'),
      tx.query<Rec>('select * from regulatory_sources order by created_at, title'),
      tx.query<Rec>(
        `select l.*, co.legal_name, (l.expiry_date - (now() at time zone 'Asia/Kolkata')::date) as days_left from company_licenses l join companies co on co.id = l.company_id
          where co.status not in ('TERMINATED','DRAFT') order by l.expiry_date limit 200`),
      tx.query<Rec>(
        `select i.*, co.legal_name, (i.expiry_date - (now() at time zone 'Asia/Kolkata')::date) as days_left from company_insurance_policies i join companies co on co.id = i.company_id
          where co.status not in ('TERMINATED','DRAFT') order by i.expiry_date limit 200`),
    ]);
    return { documents, requirements, sources, licences, insurance };
  });
}

export const docDecisionSchema = z.object({ id: zUuid, decision: zEnum(['approve', 'reject'] as const), reason: zOptText(500) });
/** AIEC verifies that a document issued by the competent authority is on file. AIEC does not issue or replace it. */
export async function reviewComplianceDocument(ctx: Ctx, input: z.infer<typeof docDecisionSchema>): Promise<void> {
  requirePerm(ctx, 'compliance.document.approve');
  const approve = input.decision === 'approve';
  if (!approve && !input.reason) throw new AppError('REASON_REQUIRED');
  await withCtx(ctx, async (tx) => {
    const doc = await tx.one<Rec>(
      `update compliance_documents set verification_status = $2, reviewed_by = $3, reviewed_at = now(), rejection_reason = $4 where id = $1 returning company_id, project_id, doc_type`,
      [input.id, approve ? 'VERIFIED' : 'REJECTED', ctx.userId, approve ? null : input.reason]);
    await audit(tx, ctx, 'compliance.document_review', 'compliance_document', input.id, { approve, reason: input.reason ?? null }, doc.company_id);
    await notifyCompany(tx, doc.company_id, 'COMPLIANCE_DOC_REVIEWED', { type: doc.doc_type, result: approve ? 'VERIFIED' : 'REJECTED' },
      doc.project_id ? `/partner/projects/${doc.project_id}` : '/partner');
  });
}

export const requirementSchema = z.object({ gate: zEnum(COMPLIANCE_GATE), docType: zEnum(COMPLIANCE_DOC_TYPE), isActive: zBool, sourceId: zUuid.optional(), note: zOptText(500) });
/** Document gates are configuration tied to the regulatory register, never hard-coded legal interpretation. */
export async function saveRequirement(ctx: Ctx, input: z.infer<typeof requirementSchema>): Promise<void> {
  requirePerm(ctx, 'compliance.manage');
  await withCtx(ctx, async (tx) => {
    await tx.exec(
      `insert into compliance_requirements (gate, doc_type, is_active, source_id, note) values ($1,$2,$3,$4,$5)
       on conflict (gate, doc_type, state) do update set is_active = excluded.is_active, source_id = excluded.source_id, note = excluded.note`,
      [input.gate, input.docType, input.isActive, input.sourceId ?? null, input.note ?? null]);
    await audit(tx, ctx, 'compliance.requirement_save', 'compliance_requirement', null, input);
  });
}

export const sourceSchema = z.object({
  id: zUuid.optional(), title: zText(300), authority: zOptText(200), sectionRule: zOptText(200), publicationDate: zOptDate, effectiveDate: zOptDate,
  geography: zOptText(100), applicability: zOptText(500), legalReviewer: zOptText(200), lastVerifiedOn: zOptDate, nextReviewOn: zOptDate, verified: zBool,
});
export async function saveRegulatorySource(ctx: Ctx, input: z.infer<typeof sourceSchema>): Promise<void> {
  requirePerm(ctx, 'compliance.manage');
  // A source may only be marked verified with a named legal reviewer and verification date.
  if (input.verified && (!input.legalReviewer || !input.lastVerifiedOn)) throw new AppError('VALIDATION', undefined, { legalReviewer: 'REQUIRED', lastVerifiedOn: 'REQUIRED' });
  const params = [input.title, input.authority ?? null, input.sectionRule ?? null, input.publicationDate ?? null, input.effectiveDate ?? null, input.geography ?? null,
    input.applicability ?? null, input.legalReviewer ?? null, input.lastVerifiedOn ?? null, input.nextReviewOn ?? null, input.verified ? 'VERIFIED' : 'UNVERIFIED'];
  await withCtx(ctx, async (tx) => {
    if (input.id) {
      await tx.one(
        `update regulatory_sources set title=$2, authority=$3, section_rule=$4, publication_date=$5, effective_date=$6, geography=$7, applicability=$8,
                legal_reviewer=$9, last_verified_on=$10, next_review_on=$11, verification_status=$12 where id = $1 returning id`, [input.id, ...params]);
    } else {
      await tx.exec(
        `insert into regulatory_sources (title, authority, section_rule, publication_date, effective_date, geography, applicability, legal_reviewer,
                last_verified_on, next_review_on, verification_status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, params);
    }
    await audit(tx, ctx, 'compliance.source_save', 'regulatory_source', input.id ?? null, { title: input.title, verified: input.verified });
  });
}

// ───────────── internal QC (never a statutory inspection) ─────────────
export const inspectionSchema = z.object({
  projectId: zUuid, inspectedOn: zDate, result: zEnum(QC_RESULT), notes: zOptText(2000),
  defectDescription: z.array(z.string().trim().max(1000)).default([]), defectSeverity: z.array(z.enum(SEVERITY)).default([]),
});
export async function createInspection(ctx: Ctx, input: z.infer<typeof inspectionSchema>): Promise<void> {
  requirePerm(ctx, 'qc.review');
  const defects = input.defectDescription.map((d, i) => ({ description: d, severity: input.defectSeverity[i] ?? 'MEDIUM' })).filter((d) => d.description);
  if (input.result !== 'PASS' && !defects.length) throw new AppError('VALIDATION', undefined, { defects: 'REQUIRED' });
  await withCtx(ctx, async (tx) => {
    const project = await tx.one<Rec>('select * from projects where id = $1', [input.projectId]);
    const inspection = await tx.one<{ id: string }>(
      'insert into qc_inspections (project_id, company_id, customer_id, inspector_id, inspected_on, result, notes) values ($1,$2,$3,$4,$5,$6,$7) returning id',
      [project.id, project.company_id, project.customer_id, ctx.userId, input.inspectedOn, input.result, input.notes ?? null]);
    for (const d of defects) {
      // Every recorded defect opens a corrective action for the responsible partner.
      const defect = await tx.one<{ id: string }>(
        `insert into qc_defects (project_id, company_id, customer_id, inspection_id, description, severity, status, reported_by)
         values ($1,$2,$3,$4,$5,$6,'CORRECTIVE_ACTION',$7) returning id`,
        [project.id, project.company_id, project.customer_id, inspection.id, d.description, d.severity, ctx.userId]);
      await tx.exec('insert into corrective_actions (defect_id, company_id, description, created_by) values ($1,$2,$3,$4)',
        [defect.id, project.company_id, `Rectify: ${d.description}`, ctx.userId]);
    }
    await tx.exec('insert into partner_performance_events (company_id, event_type, score, note, created_by) values ($1,$2,$3,$4,$5)',
      [project.company_id, input.result === 'FAIL' ? 'QC_FAIL' : 'QC_PASS', input.result === 'PASS' ? 100 : input.result === 'CONDITIONAL' ? 60 : 20,
        `Internal QC on ${project.project_number}: ${input.result}`, ctx.userId]);
    await audit(tx, ctx, 'qc.inspection', 'qc_inspection', inspection.id, { result: input.result, defects: defects.length, statutory: false }, project.company_id);
    await notifyCompany(tx, project.company_id, 'QC_RESULT', { number: project.project_number, result: input.result }, `/partner/projects/${project.id}`);
  });
}

export async function listQuality(ctx: Ctx) {
  requirePerm(ctx, 'qc.review');
  return withCtx(ctx, async (tx) => {
    const [inspections, defects, actions, projects] = await Promise.all([
      tx.query<Rec>(
        `select i.*, p.project_number, co.legal_name, u.full_name as inspector from qc_inspections i join projects p on p.id = i.project_id
           join companies co on co.id = i.company_id join users u on u.id = i.inspector_id order by i.inspected_on desc, i.created_at desc limit 100`),
      tx.query<Rec>(`select d.*, p.project_number, co.legal_name from qc_defects d join projects p on p.id = d.project_id join companies co on co.id = d.company_id
                      order by (d.status = 'CLOSED'), d.created_at desc limit 200`),
      tx.query<Rec>('select * from corrective_actions order by created_at desc limit 400'),
      tx.query<Rec>(`select p.id, p.project_number, p.status, co.legal_name from projects p join companies co on co.id = p.company_id
                      where p.status in ('IN_PROGRESS','QC','HANDOVER_PENDING','STOP_WORK','ON_HOLD') order by p.project_number`),
    ]);
    return { inspections, defects, actions, projects };
  });
}

export const correctiveSchema = z.object({ id: zUuid, step: zEnum(['done', 'verify', 'reopen'] as const) });
/** Partner marks the corrective action done; AIEC QC verifies it. A defect closes only when all its actions are verified. */
export async function updateCorrectiveAction(ctx: Ctx, input: z.infer<typeof correctiveSchema>): Promise<void> {
  await withCtx(ctx, async (tx) => {
    const a = await tx.one<Rec>('select * from corrective_actions where id = $1 for update', [input.id]);
    const staff = ctx.isInternal && canAny(ctx, 'qc.review', 'incident.manage');
    if (input.step === 'done') {
      if (!(ctx.companyId === a.company_id && can(ctx, 'project.assign')) && !staff) throw new AppError('FORBIDDEN');
      if (a.status !== 'OPEN') throw new AppError('INVALID_TRANSITION');
      await tx.exec(`update corrective_actions set status = 'DONE', completed_at = now() where id = $1`, [a.id]);
      if (a.defect_id) await tx.exec(`update qc_defects set status = 'RESOLVED' where id = $1 and status <> 'CLOSED'`, [a.defect_id]);
      await notifyPermission(tx, 'qc.review', 'CORRECTIVE_DONE', { text: a.description.slice(0, 80) }, '/admin/qc');
    } else {
      if (!staff) throw new AppError('FORBIDDEN');
      if (a.status !== 'DONE') throw new AppError('INVALID_TRANSITION');
      const verify = input.step === 'verify';
      await tx.exec(`update corrective_actions set status = $2, verified_by = $3, completed_at = case when $2 = 'OPEN' then null else completed_at end where id = $1`,
        [a.id, verify ? 'VERIFIED' : 'OPEN', verify ? ctx.userId : null]);
      if (a.defect_id) {
        const open = (await tx.one<{ n: number }>(`select count(*) as n from corrective_actions where defect_id = $1 and status <> 'VERIFIED'`, [a.defect_id])).n;
        await tx.exec('update qc_defects set status = $2, closed_at = case when $2 = \'CLOSED\' then now() else null end where id = $1',
          [a.defect_id, open ? 'CORRECTIVE_ACTION' : 'CLOSED']);
      }
    }
    await audit(tx, ctx, 'qc.corrective_action', 'corrective_action', a.id, { step: input.step }, a.company_id);
  });
}

// ───────────── safety incidents ─────────────
export const incidentSchema = z.object({
  projectId: zUuid.optional(), occurredAt: zDateTime, severity: zEnum(SEVERITY), description: zText(2000), immediateAction: zOptText(1000),
  affectedPersonNote: zOptText(300),
});

/**
 * Anyone signed in can report an incident or hazard. Staff with incident authority are notified
 * immediately; HIGH / CRITICAL reports escalate at once and stop work on the project.
 */
export async function reportIncident(tx: Tx, ctx: Ctx, input: z.infer<typeof incidentSchema> & { clientEventId?: string | null; occurredAtDate?: Date }): Promise<string> {
  const project = input.projectId ? await tx.one<Rec>('select * from projects where id = $1', [input.projectId]) : null; // RLS: must be visible to the reporter
  const urgent = input.severity === 'HIGH' || input.severity === 'CRITICAL';
  const incident = await tx.one<{ id: string; incident_number: string }>(
    `insert into safety_incidents (project_id, company_id, customer_id, reported_by, occurred_at, severity, description, immediate_action, affected_person_note, client_event_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, incident_number`,
    [project?.id ?? null, project?.company_id ?? ctx.companyId, project?.customer_id ?? (project ? null : ctx.customerId), ctx.userId,
      input.occurredAtDate ?? istLocalToDate(input.occurredAt), input.severity, input.description, input.immediateAction ?? null,
      input.affectedPersonNote ?? null, input.clientEventId ?? null]);
  await tx.exec(`insert into incident_events (incident_id, kind, to_status, note, actor_id) values ($1, 'STATUS', 'REPORTED', 'Incident reported', $2)`, [incident.id, ctx.userId]);
  await audit(tx, ctx, 'incident.report', 'safety_incident', incident.id, { severity: input.severity, projectId: project?.id ?? null }, project?.company_id ?? ctx.companyId);
  if (urgent) {
    await tx.exec(`update safety_incidents set status = 'EMERGENCY_ESCALATION' where id = $1`, [incident.id]);
    await tx.exec(`insert into incident_events (incident_id, kind, from_status, to_status, note, actor_id) values ($1, 'STATUS', 'REPORTED', 'EMERGENCY_ESCALATION', $2, null)`,
      [incident.id, `Automatic escalation: severity ${input.severity}`]);
    if (project && !['STOP_WORK', 'HANDED_OVER', 'CLOSED', 'CANCELLED'].includes(project.status)) {
      await setProjectStatus(tx, ctx, project, 'STOP_WORK', `Safety incident ${incident.incident_number}`);
    }
  }
  await notifyPermission(tx, 'incident.manage', urgent ? 'INCIDENT_EMERGENCY' : 'INCIDENT_REPORTED', { number: incident.incident_number, severity: input.severity }, `/admin/incidents/${incident.id}`);
  if (project) await notifyCompany(tx, project.company_id, urgent ? 'INCIDENT_EMERGENCY' : 'INCIDENT_REPORTED', { number: incident.incident_number, severity: input.severity }, `/partner/projects/${project.id}`);
  return incident.id;
}

export async function listIncidents(ctx: Ctx) {
  return withCtx(ctx, (tx) => tx.query<Rec>(
    `select s.*, p.project_number, co.legal_name, u.full_name as reporter from safety_incidents s left join projects p on p.id = s.project_id
       left join companies co on co.id = s.company_id left join users u on u.id = s.reported_by order by (s.status = 'CLOSED'), s.occurred_at desc limit 200`));
}

export async function getIncident(ctx: Ctx, id: string) {
  return withCtx(ctx, async (tx) => {
    const incident = await tx.one<Rec>(
      `select s.*, p.project_number, co.legal_name, u.full_name as reporter from safety_incidents s left join projects p on p.id = s.project_id
         left join companies co on co.id = s.company_id left join users u on u.id = s.reported_by where s.id = $1`, [id]);
    const events = await tx.query<Rec>('select e.*, u.full_name as actor from incident_events e left join users u on u.id = e.actor_id where e.incident_id = $1 order by e.created_at', [id]);
    const actions = await tx.query<Rec>('select * from corrective_actions where incident_id = $1 order by created_at', [id]);
    return { incident, events, actions };
  });
}

export const incidentUpdateSchema = z.object({
  id: zUuid, to: zEnum(INCIDENT_STATUS).optional(), note: zText(2000), findings: zOptText(4000), authorityNotified: zBool, insurerNotified: zBool,
  correctiveAction: zOptText(1000), correctiveDue: zOptDate, kind: zEnum(['STATUS', 'CORRECTION', 'NOTE'] as const).default('NOTE'),
});
/** Incident management. The original report is immutable; every update, note and correction is appended. */
export async function updateIncident(ctx: Ctx, input: z.infer<typeof incidentUpdateSchema>): Promise<void> {
  await withCtx(ctx, async (tx) => {
    const incident = await tx.one<Rec>('select * from safety_incidents where id = $1 for update', [input.id]);
    const manager = ctx.isInternal && can(ctx, 'incident.manage');
    if (input.to && input.to !== incident.status) {
      if (!manager) throw new AppError('FORBIDDEN');
      assertTransition(INCIDENT_MACHINE, incident.status as IncidentStatus, input.to);
      if (input.to === 'CLOSED') {
        if (!(input.findings ?? incident.findings)) throw new AppError('VALIDATION', undefined, { findings: 'REQUIRED' });
        const open = (await tx.one<{ n: number }>(`select count(*) as n from corrective_actions where incident_id = $1 and status <> 'VERIFIED'`, [incident.id])).n;
        if (open) throw new AppError('OPEN_DEFECTS');
      }
      await tx.exec(
        `update safety_incidents set status = $2, findings = coalesce($3, findings), authority_notified = $4, insurer_notified = $5,
                closed_by = case when $2 = 'CLOSED' then $6::uuid end, closed_at = case when $2 = 'CLOSED' then now() end where id = $1`,
        [incident.id, input.to, input.findings ?? null, input.authorityNotified, input.insurerNotified, ctx.userId]);
      await tx.exec(`insert into incident_events (incident_id, kind, from_status, to_status, note, actor_id) values ($1, 'STATUS', $2, $3, $4, $5)`,
        [incident.id, incident.status, input.to, input.note, ctx.userId]);
      if (input.to === 'EMERGENCY_ESCALATION' && incident.project_id) {
        const project = await tx.one<Rec>('select * from projects where id = $1 for update', [incident.project_id]);
        if (!['STOP_WORK', 'HANDED_OVER', 'CLOSED', 'CANCELLED'].includes(project.status)) await setProjectStatus(tx, ctx, project, 'STOP_WORK', `Safety incident ${incident.incident_number}`);
      }
    } else {
      if (manager) {
        await tx.exec('update safety_incidents set findings = coalesce($2, findings), authority_notified = $3, insurer_notified = $4 where id = $1',
          [incident.id, input.findings ?? null, input.authorityNotified, input.insurerNotified]);
      }
      await tx.exec('insert into incident_events (incident_id, kind, note, actor_id) values ($1, $2, $3, $4)',
        [incident.id, input.kind === 'CORRECTION' ? 'CORRECTION' : 'NOTE', input.note, ctx.userId]);
    }
    if (input.correctiveAction) {
      if (!manager) throw new AppError('FORBIDDEN');
      await tx.exec('insert into corrective_actions (incident_id, company_id, description, due_date, created_by) values ($1,$2,$3,$4,$5)',
        [incident.id, incident.company_id, input.correctiveAction, input.correctiveDue ?? null, ctx.userId]);
    }
    await audit(tx, ctx, 'incident.update', 'safety_incident', incident.id, { to: input.to ?? null, kind: input.kind }, incident.company_id);
    if (incident.customer_id && input.to) await notifyCustomer(tx, incident.customer_id, 'INCIDENT_UPDATE', { number: incident.incident_number, status: input.to }, '/customer/service');
  });
}
