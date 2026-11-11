import { z } from 'zod';
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '@/lib/config';
import { SEVERITY } from '@/lib/enums';
import { AppError } from '@/lib/errors';
import { requireCompany, requirePerm, type Ctx } from '../ctx';
import { withCtx, type Rec, type Tx } from '../db';
import { addWorkEvidence, updateTaskProgress } from './projects';
import { reportIncident } from './quality';

/** Work visible to the signed-in field user: only their assigned tasks and the projects they are on. */
export async function getMyWork(ctx: Ctx) {
  requirePerm(ctx, 'task.perform');
  requireCompany(ctx);
  return withCtx(ctx, async (tx) => {
    const tasks = await tx.query<Rec>(
      `select t.id, t.title, t.description, t.status, t.safety_critical, t.due_date, t.progress_note, t.review_note, t.project_id,
              p.project_number, p.status as project_status, l.project_name, l.address
         from project_tasks t join projects p on p.id = t.project_id join leads l on l.id = p.lead_id
        where t.assigned_to = $1 and p.status not in ('CLOSED','CANCELLED') order by (t.status = 'APPROVED'), t.due_date nulls last, t.created_at`, [ctx.userId]);
    const projects = await tx.query<Rec>(
      `select p.id, p.project_number, p.status, l.project_name, l.address from projects p join leads l on l.id = p.lead_id
        where p.status not in ('CLOSED','CANCELLED') and exists (select 1 from project_team_assignments a where a.project_id = p.id and a.user_id = $1)
        order by p.created_at desc`, [ctx.userId]);
    return { tasks, projects };
  });
}

const base = { clientEventId: z.string().uuid(), capturedAt: z.string().datetime({ offset: true }) };
const coords = { latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional(), accuracyM: z.number().min(0).nullable().optional() };
export const syncEventSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('ATTENDANCE'), projectId: z.string().uuid(), kind: z.enum(['CHECK_IN', 'CHECK_OUT']), ...coords }),
  z.object({ ...base, type: z.literal('TASK_STATUS'), taskId: z.string().uuid(), to: z.enum(['IN_PROGRESS', 'DONE_PENDING_REVIEW']), note: z.string().max(1000).nullable().optional() }),
  z.object({
    ...base, type: z.literal('CHECKLIST'), projectId: z.string().uuid(), ppeOk: z.boolean(), barricadeOk: z.boolean(), powerIsolatedOk: z.boolean(),
    toolsOk: z.boolean(), pitShaftSafeOk: z.boolean(), notes: z.string().max(1000).nullable().optional(),
  }),
  z.object({ ...base, type: z.literal('MATERIAL_USAGE'), projectId: z.string().uuid(), taskId: z.string().uuid().nullable().optional(), description: z.string().min(1).max(300), quantity: z.number().positive(), unit: z.string().min(1).max(20) }),
  z.object({
    ...base, type: z.literal('EVIDENCE'), projectId: z.string().uuid(), taskId: z.string().uuid().nullable().optional(), caption: z.string().max(300).nullable().optional(),
    fileName: z.string().min(1).max(150), mimeType: z.string(), dataBase64: z.string().min(1),
  }),
  z.object({ ...base, type: z.literal('HAZARD'), projectId: z.string().uuid().nullable().optional(), severity: z.enum(SEVERITY), description: z.string().min(1).max(2000), immediateAction: z.string().max(1000).nullable().optional() }),
]);
export type SyncEvent = z.infer<typeof syncEventSchema>;
export type SyncAck = { clientEventId: string; status: 'SYNCED' | 'DUPLICATE' | 'FAILED'; error?: string; receivedAt?: string };

async function projectCompany(tx: Tx, ctx: Ctx, projectId: string): Promise<string> {
  const p = await tx.one<{ company_id: string }>('select company_id from projects where id = $1', [projectId]); // RLS: technicians only see assigned projects
  if (p.company_id !== ctx.companyId) throw new AppError('FORBIDDEN');
  return p.company_id;
}

async function apply(tx: Tx, ctx: Ctx, e: SyncEvent): Promise<void> {
  const at = new Date(e.capturedAt);
  switch (e.type) {
    case 'ATTENDANCE':
      await tx.exec(
        `insert into technician_attendance (project_id, company_id, user_id, kind, latitude, longitude, accuracy_m, captured_at_device, client_event_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [e.projectId, await projectCompany(tx, ctx, e.projectId), ctx.userId, e.kind, e.latitude ?? null, e.longitude ?? null, e.accuracyM ?? null, at, e.clientEventId]);
      return;
    case 'TASK_STATUS':
      await updateTaskProgress(tx, ctx, { taskId: e.taskId, to: e.to, note: e.note ?? null, capturedAt: at });
      return;
    case 'CHECKLIST':
      await tx.exec(
        `insert into safety_checklists (project_id, company_id, user_id, ppe_ok, barricade_ok, power_isolated_ok, tools_ok, pit_shaft_safe_ok, notes, captured_at_device, client_event_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [e.projectId, await projectCompany(tx, ctx, e.projectId), ctx.userId, e.ppeOk, e.barricadeOk, e.powerIsolatedOk, e.toolsOk, e.pitShaftSafeOk, e.notes ?? null, at, e.clientEventId]);
      return;
    case 'MATERIAL_USAGE':
      await tx.exec(
        `insert into material_usage (project_id, company_id, task_id, description, quantity, unit, user_id, captured_at_device, client_event_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [e.projectId, await projectCompany(tx, ctx, e.projectId), e.taskId ?? null, e.description, e.quantity, e.unit, ctx.userId, at, e.clientEventId]);
      return;
    case 'EVIDENCE': {
      if (!ALLOWED_UPLOAD_TYPES.includes(e.mimeType)) throw new AppError('FILE_TYPE');
      const bytes = Buffer.from(e.dataBase64, 'base64');
      if (bytes.length > MAX_UPLOAD_BYTES) throw new AppError('FILE_TOO_LARGE');
      await addWorkEvidence(tx, ctx, { projectId: e.projectId, taskId: e.taskId ?? null, caption: e.caption ?? null, capturedAt: at, clientEventId: e.clientEventId },
        { name: e.fileName, type: e.mimeType, bytes });
      return;
    }
    case 'HAZARD':
      await reportIncident(tx, ctx, {
        projectId: e.projectId ?? undefined, occurredAt: e.capturedAt, occurredAtDate: at, severity: e.severity, description: e.description,
        immediateAction: e.immediateAction ?? undefined, clientEventId: e.clientEventId,
      });
      return;
  }
}

/**
 * Applies queued field events. Each event runs in its own transaction and is keyed by the
 * client-generated id, so retries after a lost connection can never create duplicates.
 * Device capture time and server receipt time are stored separately.
 */
export async function syncEvents(ctx: Ctx, events: unknown[]): Promise<SyncAck[]> {
  requirePerm(ctx, 'task.perform');
  requireCompany(ctx);
  const acks: SyncAck[] = [];
  for (const raw of events.slice(0, 50)) {
    const parsed = syncEventSchema.safeParse(raw);
    const clientEventId = typeof (raw as { clientEventId?: unknown })?.clientEventId === 'string' ? (raw as { clientEventId: string }).clientEventId : '';
    if (!parsed.success) { acks.push({ clientEventId, status: 'FAILED', error: 'VALIDATION' }); continue; }
    const event = parsed.data;
    try {
      const ack = await withCtx(ctx, async (tx): Promise<SyncAck> => {
        const fresh = await tx.exec(
          'insert into client_events (client_event_id, user_id, event_type, captured_at_device) values ($1,$2,$3,$4) on conflict do nothing',
          [event.clientEventId, ctx.userId, event.type, new Date(event.capturedAt)]);
        if (!fresh) return { clientEventId: event.clientEventId, status: 'DUPLICATE' };
        await apply(tx, ctx, event);
        return { clientEventId: event.clientEventId, status: 'SYNCED', receivedAt: new Date().toISOString() };
      });
      acks.push(ack);
    } catch (error) {
      acks.push({ clientEventId: event.clientEventId, status: 'FAILED', error: error instanceof AppError ? error.code : 'UNKNOWN' });
    }
  }
  return acks;
}
