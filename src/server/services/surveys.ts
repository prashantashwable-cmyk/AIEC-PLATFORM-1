import { z } from 'zod';
import { PAGE_SIZE } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { istLocalToDate, zBool, zDateTime, zInt, zNumber, zOptText, zText, zUuid } from '@/lib/validation';
import { audit, notifyCustomer, notifyPermission, notifyUsers } from '../audit';
import { can, canAny, requirePerm, type Ctx } from '../ctx';
import { withCtx, type Rec, type Tx } from '../db';
import { saveFile } from './files';
import { leadScope, transitionLead } from './leads';

type Upload = { name: string; type: string; bytes: Buffer };

export const scheduleSurveySchema = z.object({ leadId: zUuid, surveyorId: zUuid, scheduledAt: zDateTime });
export async function scheduleSurvey(ctx: Ctx, input: z.infer<typeof scheduleSurveySchema>): Promise<string> {
  requirePerm(ctx, 'survey.schedule');
  return withCtx(ctx, async (tx) => {
    const scope = leadScope(ctx, 'l', 2);
    const lead = await tx.one<Rec>(`select l.id, l.status, l.lead_number, l.customer_id from leads l where l.id = $1 and ${scope.sql} for update`, [input.leadId, ...scope.params]);
    if (!['QUALIFIED', 'SURVEY_PENDING'].includes(lead.status)) throw new AppError('LEAD_NOT_QUALIFIED');
    await tx.one(
      `select 1 from user_roles ur join role_permissions rp on rp.role_code = ur.role_code
        where ur.user_id = $1 and ur.revoked_at is null and rp.permission_code = 'survey.perform' limit 1`, [input.surveyorId]);
    const when = istLocalToDate(input.scheduledAt);
    const open = await tx.maybeOne<{ id: string }>(
      `select id from site_surveys where lead_id = $1 and status in ('SCHEDULED','IN_PROGRESS','REWORK_REQUIRED') limit 1`, [input.leadId]);
    const id = open
      ? (await tx.one<{ id: string }>('update site_surveys set surveyor_id = $2, scheduled_at = $3, scheduled_by = $4 where id = $1 returning id', [open.id, input.surveyorId, when, ctx.userId])).id
      : (await tx.one<{ id: string }>('insert into site_surveys (lead_id, surveyor_id, scheduled_at, scheduled_by) values ($1,$2,$3,$4) returning id',
        [input.leadId, input.surveyorId, when, ctx.userId])).id;
    if (lead.status === 'QUALIFIED') await transitionLead(tx, ctx, input.leadId, 'SURVEY_PENDING', { note: 'Site survey scheduled' });
    await audit(tx, ctx, 'survey.schedule', 'site_survey', id, { leadId: input.leadId, surveyorId: input.surveyorId, scheduledAt: when.toISOString() });
    await notifyUsers(tx, [input.surveyorId], 'SURVEY_ASSIGNED', { number: lead.lead_number }, `/admin/surveys/${id}`);
    await notifyCustomer(tx, lead.customer_id, 'SURVEY_SCHEDULED', { number: lead.lead_number }, `/customer/projects/${input.leadId}`);
    return id;
  });
}

/** Surveyors see only their assigned surveys; schedulers/reviewers see surveys of leads in their scope. */
function surveyScope(ctx: Ctx, startAt: number): { sql: string; params: unknown[] } {
  if (canAny(ctx, 'survey.schedule', 'survey.review')) return leadScope(ctx, 'l', startAt);
  if (can(ctx, 'survey.perform')) return { sql: `s.surveyor_id = $${startAt}`, params: [ctx.userId] };
  throw new AppError('FORBIDDEN');
}

export async function listSurveys(ctx: Ctx, filter: { status?: string; page?: number }) {
  const scope = surveyScope(ctx, 1);
  const params = [...scope.params];
  const where = [scope.sql];
  if (filter.status) { params.push(filter.status); where.push(`s.status = $${params.length}`); }
  const page = Math.max(1, filter.page ?? 1);
  return withCtx(ctx, async (tx) => {
    const from = `from site_surveys s join leads l on l.id = s.lead_id join customers c on c.id = l.customer_id join zones z on z.id = l.zone_id
                  join users u on u.id = s.surveyor_id where ${where.join(' and ')}`;
    const total = (await tx.one<{ n: number }>(`select count(*) as n ${from}`, params)).n;
    const rows = await tx.query<Rec>(
      `select s.id, s.status, s.scheduled_at, s.submitted_at, l.lead_number, l.project_name, l.address, z.code as zone_code, c.name as customer_name,
              u.full_name as surveyor ${from} order by s.scheduled_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, params);
    return { rows, total, page };
  });
}

async function loadSurvey(tx: Tx, ctx: Ctx, id: string, lock = false): Promise<Rec> {
  const scope = surveyScope(ctx, 2);
  return tx.one<Rec>(
    `select s.*, l.lead_number, l.project_name, l.address, l.status as lead_status, l.floors as lead_floors, l.lift_category, l.customer_id,
            c.name as customer_name, c.phone as customer_phone, z.code as zone_code, u.full_name as surveyor
       from site_surveys s join leads l on l.id = s.lead_id join customers c on c.id = l.customer_id join zones z on z.id = l.zone_id
       join users u on u.id = s.surveyor_id where s.id = $1 and ${scope.sql} ${lock ? 'for update of s' : ''}`, [id, ...scope.params]);
}

export async function getSurvey(ctx: Ctx, id: string) {
  return withCtx(ctx, async (tx) => {
    const survey = await loadSurvey(tx, ctx, id);
    const evidence = await tx.query<Rec>(
      `select e.id, e.file_id, e.caption, e.captured_at_device, e.received_at, f.filename, f.mime_type
         from survey_evidence e join file_objects f on f.id = e.file_id where e.survey_id = $1 order by e.received_at`, [id]);
    return { survey, evidence };
  });
}

export const surveyDataSchema = z.object({
  id: zUuid,
  latitude: zNumber(-90, 90).optional(), longitude: zNumber(-180, 180).optional(), accuracyM: zNumber(0, 100000).optional(),
  floors: zInt(1, 100).optional(), stops: zInt(2, 100).optional(),
  shaftWidthMm: zInt(300, 10000).optional(), shaftDepthMm: zInt(300, 10000).optional(),
  pitDepthMm: zInt(0, 10000).optional(), overheadMm: zInt(0, 20000).optional(),
  landingDetails: zOptText(1000), machineRoom: zBool, machineRoomNotes: zOptText(1000), powerSupply: zOptText(500),
  civilReadiness: zOptText(1000), accessNotes: zOptText(1000), drawingsRef: zOptText(500), customerAckName: zOptText(120), notes: zOptText(2000),
  submit: zOptText(10),
});
const EDITABLE = ['SCHEDULED', 'IN_PROGRESS', 'REWORK_REQUIRED'];

/** Saves the survey form; with `submit` it also validates completeness and submits for review. */
export async function saveSurvey(ctx: Ctx, input: z.infer<typeof surveyDataSchema>): Promise<void> {
  requirePerm(ctx, 'survey.perform');
  await withCtx(ctx, async (tx) => {
    const survey = await loadSurvey(tx, ctx, input.id, true);
    if (survey.surveyor_id !== ctx.userId) throw new AppError('SURVEY_NOT_ASSIGNED');
    if (!EDITABLE.includes(survey.status)) throw new AppError('INVALID_TRANSITION');
    const submitting = Boolean(input.submit);
    if (submitting) {
      const required = ['floors', 'stops', 'shaftWidthMm', 'shaftDepthMm', 'pitDepthMm', 'overheadMm', 'powerSupply', 'civilReadiness', 'customerAckName'] as const;
      const missing: Record<string, string> = {};
      for (const key of required) if (input[key] === undefined || input[key] === '') missing[key] = 'REQUIRED';
      const photos = (await tx.one<{ n: number }>('select count(*) as n from survey_evidence where survey_id = $1', [input.id])).n;
      if (!photos) missing.evidence = 'REQUIRED';
      if (Object.keys(missing).length) throw new AppError('SURVEY_INCOMPLETE', undefined, missing);
    }
    await tx.exec(
      `update site_surveys set latitude = $2, longitude = $3, accuracy_m = $4, floors = $5, stops = $6, shaft_width_mm = $7, shaft_depth_mm = $8,
              pit_depth_mm = $9, overhead_mm = $10, landing_details = $11, machine_room = $12, machine_room_notes = $13, power_supply = $14,
              civil_readiness = $15, access_notes = $16, drawings_ref = $17, customer_ack_name = $18, notes = $19,
              customer_ack_at = case when $18::text is not null then coalesce(customer_ack_at, now()) end,
              visited_at = coalesce(visited_at, now()), status = $20, submitted_at = case when $20 = 'SUBMITTED' then now() else submitted_at end
        where id = $1`,
      [
        input.id, input.latitude ?? null, input.longitude ?? null, input.accuracyM ?? null, input.floors ?? null, input.stops ?? null,
        input.shaftWidthMm ?? null, input.shaftDepthMm ?? null, input.pitDepthMm ?? null, input.overheadMm ?? null, input.landingDetails ?? null,
        input.machineRoom, input.machineRoomNotes ?? null, input.powerSupply ?? null, input.civilReadiness ?? null, input.accessNotes ?? null,
        input.drawingsRef ?? null, input.customerAckName ?? null, input.notes ?? null, submitting ? 'SUBMITTED' : 'IN_PROGRESS',
      ]);
    if (submitting) {
      await audit(tx, ctx, 'survey.submit', 'site_survey', input.id, { leadId: survey.lead_id });
      await notifyPermission(tx, 'survey.review', 'SURVEY_SUBMITTED', { number: survey.lead_number }, `/admin/surveys/${input.id}`);
    }
  });
}

export async function addSurveyEvidence(ctx: Ctx, surveyId: string, file: Upload, caption: string | null, capturedAt: string | null): Promise<void> {
  requirePerm(ctx, 'survey.perform');
  await withCtx(ctx, async (tx) => {
    const survey = await loadSurvey(tx, ctx, surveyId, true);
    if (survey.surveyor_id !== ctx.userId) throw new AppError('SURVEY_NOT_ASSIGNED');
    if (!EDITABLE.includes(survey.status)) throw new AppError('INVALID_TRANSITION');
    const fileId = await saveFile(tx, ctx, file, 'SURVEY', { customerId: survey.customer_id });
    // Device capture time is recorded separately from server receipt time; neither proves authenticity on its own.
    await tx.exec('insert into survey_evidence (survey_id, file_id, caption, captured_at_device) values ($1,$2,$3,$4)',
      [surveyId, fileId, caption, capturedAt && !Number.isNaN(Date.parse(capturedAt)) ? new Date(capturedAt) : null]);
    await tx.exec(`update site_surveys set status = 'IN_PROGRESS', visited_at = coalesce(visited_at, now()) where id = $1 and status = 'SCHEDULED'`, [surveyId]);
  });
}

export const reviewSurveySchema = z.object({ id: zUuid, decision: zEnum2(['approve', 'rework']), note: zOptText(1000) });
function zEnum2<T extends [string, ...string[]]>(values: T) { return z.enum(values, { error: 'REQUIRED' }); }

/** Review confirms the survey record is complete. It is NOT a technical or statutory approval (spec 5.5). */
export async function reviewSurvey(ctx: Ctx, input: z.infer<typeof reviewSurveySchema>): Promise<void> {
  requirePerm(ctx, 'survey.review');
  await withCtx(ctx, async (tx) => {
    const survey = await loadSurvey(tx, ctx, input.id, true);
    if (survey.status !== 'SUBMITTED') throw new AppError('INVALID_TRANSITION');
    const approve = input.decision === 'approve';
    if (!approve && !input.note) throw new AppError('REASON_REQUIRED');
    await tx.exec('update site_surveys set status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4 where id = $1',
      [input.id, approve ? 'REVIEWED' : 'REWORK_REQUIRED', ctx.userId, input.note ?? null]);
    await audit(tx, ctx, 'survey.review', 'site_survey', input.id, { approve, note: input.note ?? null });
    if (approve) {
      await tx.exec('update leads set floors = coalesce($2, floors) where id = $1', [survey.lead_id, survey.floors]);
      if (survey.lead_status === 'SURVEY_PENDING') await transitionLead(tx, ctx, survey.lead_id, 'SURVEY_COMPLETED', { note: 'Survey reviewed' });
      await notifyCustomer(tx, survey.customer_id, 'SURVEY_COMPLETED', { number: survey.lead_number }, `/customer/projects/${survey.lead_id}`);
    } else {
      await notifyUsers(tx, [survey.surveyor_id], 'SURVEY_REWORK', { number: survey.lead_number }, `/admin/surveys/${input.id}`);
    }
  });
}

export async function listSurveyors(ctx: Ctx): Promise<Rec[]> {
  return withCtx(ctx, (tx) => tx.query<Rec>(
    `select distinct u.id, u.full_name from users u join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
       join role_permissions rp on rp.role_code = ur.role_code and rp.permission_code = 'survey.perform' where u.is_active order by u.full_name`));
}
