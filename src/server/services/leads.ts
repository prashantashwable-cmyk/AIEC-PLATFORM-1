import { z } from 'zod';
import { PAGE_SIZE, PRIVACY_NOTICE_VERSION } from '@/lib/config';
import { compareLeads, isLikelyDuplicate } from '@/lib/duplicates';
import {
  BUILDING_TYPE, COMPLEX_LIFT_CATEGORIES, CUSTOMER_TYPE, LEAD_SOURCE, LIFT_CATEGORY, SITE_READINESS, TIMELINE,
  type LeadStatus, type LiftCategory,
} from '@/lib/enums';
import { AppError } from '@/lib/errors';
import { addWorkingHours } from '@/lib/sla';
import { LEAD_MACHINE, LEAD_TERMINAL, assertTransition } from '@/lib/state';
import { zBool, zEnum, zOptInt, zOptMoney, zOptText, zPhone, zText, zUuid, zInt } from '@/lib/validation';
import { audit, getHolidays, getSetting, notifyPermission, notifyUsers, queueOutboundMessage } from '../audit';
import { can, requirePerm, type Ctx } from '../ctx';
import { withCtx, withSystem, type Rec, type Tx } from '../db';

export const leadInputSchema = z.object({
  name: zText(120),
  phone: zPhone,
  customerType: zEnum(CUSTOMER_TYPE),
  projectName: zText(200),
  address: zText(500),
  zoneId: zUuid,
  buildingType: zEnum(BUILDING_TYPE),
  floors: zOptInt(1, 100),
  liftCategory: zEnum(LIFT_CATEGORY),
  liftCount: zInt(1, 20).default(1),
  budget: zOptMoney,
  timeline: zEnum(TIMELINE).default('UNDECIDED'),
  siteReadiness: zEnum(SITE_READINESS).default('UNKNOWN'),
  financeInterest: zBool,
  consentContact: zBool,
  consentPrivacy: zBool,
  source: zEnum(LEAD_SOURCE).optional(),
  referralNote: zOptText(500),
});
export type LeadInput = z.infer<typeof leadInputSchema>;

/** High-rise threshold above which additional technical review is flagged (configuration, not law). */
const HIGH_RISE_FLOORS = 10;

/** Records a lead status change with its mandatory audit trail. Validates the state machine. */
export async function transitionLead(
  tx: Tx, ctx: Ctx | null, leadId: string, to: LeadStatus, opts: { reason?: string | null; note?: string | null; source?: string } = {},
): Promise<void> {
  const lead = await tx.one<{ status: LeadStatus; status_before_hold: LeadStatus | null }>(
    'select status, status_before_hold from leads where id = $1 for update', [leadId],
  );
  if (lead.status === to) return;
  if (lead.status === 'ON_HOLD') {
    if (to !== lead.status_before_hold && !['LOST', 'CANCELLED', 'DISQUALIFIED', 'DUPLICATE'].includes(to)) throw new AppError('INVALID_TRANSITION');
  } else {
    assertTransition(LEAD_MACHINE, lead.status, to);
  }
  if (['LOST', 'ON_HOLD', 'DISQUALIFIED', 'CANCELLED', 'DUPLICATE'].includes(to) && !opts.reason?.trim()) throw new AppError('REASON_REQUIRED');
  await tx.exec(
    `update leads set status = $2, status_before_hold = case when $2 = 'ON_HOLD' then status else null end, updated_at = now() where id = $1`,
    [leadId, to],
  );
  await tx.exec(
    'insert into lead_events (lead_id, from_status, to_status, actor_id, reason, note, source) values ($1, $2, $3, $4, $5, $6, $7)',
    [leadId, lead.status, to, ctx?.userId ?? null, opts.reason ?? null, opts.note ?? null, opts.source ?? 'APP'],
  );
  await audit(tx, ctx, 'lead.status', 'lead', leadId, { from: lead.status, to, reason: opts.reason ?? null });
}

async function detectDuplicates(tx: Tx, leadId: string): Promise<number> {
  const rows = await tx.query<Rec>(
    `select l.id, c.phone, l.project_name, l.address, l.zone_id, l.lift_category, l.latitude, l.longitude
       from leads l join customers c on c.id = l.customer_id
      where l.created_at > now() - interval '180 days' and l.status not in ('DUPLICATE','CANCELLED')`,
  );
  const fp = (r: Rec) => ({
    phone: r.phone, projectName: r.project_name, address: r.address, zoneId: r.zone_id, liftCategory: r.lift_category,
    latitude: r.latitude === null ? null : Number(r.latitude), longitude: r.longitude === null ? null : Number(r.longitude),
  });
  const self = rows.find((r) => r.id === leadId);
  if (!self) return 0;
  let flagged = 0;
  for (const other of rows) {
    if (other.id === leadId) continue;
    const result = compareLeads(fp(self), fp(other));
    if (!isLikelyDuplicate(result)) continue;
    flagged += await tx.exec(
      `insert into lead_duplicate_candidates (lead_id, duplicate_of_lead_id, reasons, score) values ($1, $2, $3, $4)
       on conflict (lead_id, duplicate_of_lead_id) do nothing`,
      [leadId, other.id, result.reasons, result.score],
    );
  }
  return flagged;
}

/**
 * Lead intake for all channels. `actor` is null for the public website form, a customer for
 * the customer app, or AIEC staff. Runs as a trusted transaction because intake must look
 * across all leads for duplicates; authorisation is checked explicitly first.
 */
export async function createLead(actor: Ctx | null, input: LeadInput): Promise<{ id: string; leadNumber: string; duplicates: number }> {
  const isStaff = Boolean(actor && can(actor, 'lead.create'));
  const isCustomer = Boolean(actor && !isStaff && actor.customerId && can(actor, 'customer.self'));
  if (actor && !isStaff && !isCustomer) throw new AppError('FORBIDDEN');
  const fieldErrors: Record<string, string> = {};
  if (!input.consentContact) fieldErrors.consentContact = 'CONSENT_REQUIRED';
  if (!input.consentPrivacy) fieldErrors.consentPrivacy = 'CONSENT_REQUIRED';
  if (Object.keys(fieldErrors).length) throw new AppError('VALIDATION', undefined, fieldErrors);
  const source = isStaff ? (input.source ?? 'PHONE') : isCustomer ? 'CUSTOMER_APP' : 'WEBSITE';

  return withSystem(async (tx) => {
    const zone = await tx.maybeOne<{ id: string }>('select id from zones where id = $1', [input.zoneId]);
    if (!zone) throw new AppError('VALIDATION', undefined, { zoneId: 'INVALID' });

    let customerId: string;
    let phone: string;
    if (isCustomer) {
      customerId = actor!.customerId!;
      phone = actor!.phone;
    } else {
      phone = input.phone;
      const existing = await tx.maybeOne<{ id: string }>('select id from customers where phone = $1', [phone]);
      customerId = existing?.id
        ?? (await tx.one<{ id: string }>(
          'insert into customers (name, phone, customer_type, user_id) values ($1, $2, $3, (select id from users where phone = $2)) returning id',
          [input.name, phone, input.customerType],
        )).id;
    }

    const holidays = await getHolidays(tx);
    const responseDue = addWorkingHours(new Date(), Number(await getSetting(tx, 'sla_lead_response_hours')), holidays);
    const needsReview = COMPLEX_LIFT_CATEGORIES.includes(input.liftCategory as LiftCategory) || (input.floors ?? 0) > HIGH_RISE_FLOORS
      || input.buildingType === 'HOSPITAL';
    const lead = await tx.one<{ id: string; lead_number: string }>(
      `insert into leads (customer_id, project_name, address, zone_id, building_type, floors, lift_category, lift_count, budget_approx,
                          timeline, site_readiness, finance_interest, source, referral_note, needs_technical_review, response_due_at,
                          q_contact_consent, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17) returning id, lead_number`,
      [
        customerId, input.projectName, input.address, input.zoneId, input.buildingType, input.floors ?? null, input.liftCategory,
        input.liftCount, input.budget ?? null, input.timeline, input.siteReadiness, input.financeInterest, source,
        input.referralNote ?? null, needsReview, responseDue, actor?.userId ?? null,
      ],
    );
    await tx.exec(`insert into lead_events (lead_id, to_status, actor_id, source, note) values ($1, 'NEW', $2, $3, $4)`,
      [lead.id, actor?.userId ?? null, source, 'Lead captured']);
    for (const purpose of ['PRIVACY_NOTICE', 'CONTACT']) {
      await tx.exec('insert into customer_consents (customer_id, purpose, notice_version, lead_id, source) values ($1, $2, $3, $4, $5)',
        [customerId, purpose, PRIVACY_NOTICE_VERSION, lead.id, source]);
    }
    const duplicates = await detectDuplicates(tx, lead.id);
    await audit(tx, actor, 'lead.create', 'lead', lead.id, { source, leadNumber: lead.lead_number, duplicates });
    await notifyPermission(tx, 'lead.view.all', 'LEAD_NEW', { number: lead.lead_number, name: input.projectName }, `/admin/leads/${lead.id}`);
    await queueOutboundMessage(tx, 'WHATSAPP', phone, 'lead_acknowledgement', { number: lead.lead_number });
    return { id: lead.id, leadNumber: lead.lead_number, duplicates };
  });
}

/** SQL predicate limiting staff to the leads their role may see (all / own zones / assigned). */
export function leadScope(ctx: Ctx, alias = 'l', startAt = 1): { sql: string; params: unknown[] } {
  if (can(ctx, 'lead.view.all')) return { sql: 'true', params: [] };
  if (can(ctx, 'lead.view.city')) return { sql: `${alias}.zone_id = any($${startAt}::uuid[])`, params: [ctx.zoneIds] };
  if (can(ctx, 'lead.view.assigned')) return { sql: `${alias}.assigned_to = $${startAt}`, params: [ctx.userId] };
  throw new AppError('FORBIDDEN');
}

export async function listLeads(ctx: Ctx, filter: { status?: string; zoneId?: string; q?: string; page?: number }) {
  const scope = leadScope(ctx);
  const params = [...scope.params];
  const where = [scope.sql];
  if (filter.status) { params.push(filter.status); where.push(`l.status = $${params.length}`); }
  if (filter.zoneId) { params.push(filter.zoneId); where.push(`l.zone_id = $${params.length}`); }
  if (filter.q) {
    params.push(`%${filter.q.trim()}%`);
    where.push(`(l.project_name ilike $${params.length} or l.lead_number ilike $${params.length} or c.name ilike $${params.length} or c.phone ilike $${params.length})`);
  }
  const page = Math.max(1, filter.page ?? 1);
  return withCtx(ctx, async (tx) => {
    const total = (await tx.one<{ n: number }>(
      `select count(*) as n from leads l join customers c on c.id = l.customer_id where ${where.join(' and ')}`, params,
    )).n;
    const rows = await tx.query<Rec>(
      `select l.id, l.lead_number, l.project_name, l.status, l.lift_category, l.floors, l.source, l.created_at, l.response_due_at,
              l.first_contacted_at, l.needs_technical_review, c.name as customer_name, c.phone as customer_phone, z.code as zone_code,
              u.full_name as assignee,
              (select count(*) from lead_duplicate_candidates d where d.lead_id = l.id and d.status = 'OPEN') as open_duplicates
         from leads l join customers c on c.id = l.customer_id join zones z on z.id = l.zone_id left join users u on u.id = l.assigned_to
        where ${where.join(' and ')} order by l.created_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, params,
    );
    return { rows, total, page };
  });
}

async function loadLeadForStaff(tx: Tx, ctx: Ctx, id: string): Promise<Rec> {
  const scope = leadScope(ctx, 'l', 2);
  return tx.one<Rec>(
    `select l.*, c.name as customer_name, c.phone as customer_phone, c.customer_type, c.email as customer_email, z.code as zone_code,
            z.is_active as zone_active, u.full_name as assignee
       from leads l join customers c on c.id = l.customer_id join zones z on z.id = l.zone_id left join users u on u.id = l.assigned_to
      where l.id = $1 and ${scope.sql}`, [id, ...scope.params],
  );
}

export async function getLead(ctx: Ctx, id: string) {
  return withCtx(ctx, async (tx) => {
    const lead = await loadLeadForStaff(tx, ctx, id);
    const [events, duplicates, surveys, matches, quotations, order] = await Promise.all([
      tx.query<Rec>(`select e.*, u.full_name as actor from lead_events e left join users u on u.id = e.actor_id where e.lead_id = $1 order by e.created_at`, [id]),
      tx.query<Rec>(
        `select d.*, o.lead_number, o.project_name, o.status as other_status from lead_duplicate_candidates d join leads o on o.id = d.duplicate_of_lead_id
          where d.lead_id = $1 order by d.score desc`, [id]),
      tx.query<Rec>(`select s.*, u.full_name as surveyor from site_surveys s join users u on u.id = s.surveyor_id where s.lead_id = $1 order by s.created_at desc`, [id]),
      tx.query<Rec>(
        `select m.*, co.legal_name, co.grade from partner_matches m join companies co on co.id = m.company_id
          where m.lead_id = $1 order by m.eligible desc, m.score desc nulls last, co.legal_name`, [id]),
      tx.query<Rec>(
        `select q.id, q.quotation_number, q.status, q.released_to_customer_at, co.legal_name, v.version_no, v.total_amount, v.validity_date, v.submitted_at
           from quotations q join companies co on co.id = q.company_id left join quotation_versions v on v.id = q.current_version_id
          where q.lead_id = $1 order by q.created_at`, [id]),
      tx.maybeOne<Rec>(`select id, order_number, status from orders where lead_id = $1 order by created_at desc limit 1`, [id]),
    ]);
    return { lead, events, duplicates, surveys, matches, quotations, order };
  });
}

export async function markContacted(ctx: Ctx, id: string, note: string): Promise<void> {
  requirePerm(ctx, 'lead.update');
  await withCtx(ctx, async (tx) => {
    await loadLeadForStaff(tx, ctx, id);
    await transitionLead(tx, ctx, id, 'CONTACTED', { note });
    await tx.exec('update leads set first_contacted_at = coalesce(first_contacted_at, now()), assigned_to = coalesce(assigned_to, $2) where id = $1', [id, ctx.userId]);
  });
}

export async function addLeadNote(ctx: Ctx, id: string, note: string): Promise<void> {
  requirePerm(ctx, 'lead.update');
  await withCtx(ctx, async (tx) => {
    const lead = await loadLeadForStaff(tx, ctx, id);
    await tx.exec(`insert into lead_events (lead_id, from_status, to_status, actor_id, note, source) values ($1, $2, $2, $3, $4, 'NOTE')`,
      [id, lead.status, ctx.userId, note]);
  });
}

export const qualifySchema = z.object({
  id: zUuid, genuine: zBool, decisionMaker: zBool, scopeClear: zBool, surveyFeasible: zBool, contactConsent: zBool, note: zOptText(1000),
});
/** Qualification (spec 5.4): every check must be confirmed and the site must be in an ACTIVE zone. */
export async function qualifyLead(ctx: Ctx, input: z.infer<typeof qualifySchema>): Promise<void> {
  requirePerm(ctx, 'lead.qualify');
  await withCtx(ctx, async (tx) => {
    const lead = await loadLeadForStaff(tx, ctx, input.id);
    if (!lead.zone_active) throw new AppError('ZONE_INACTIVE');
    if (!(input.genuine && input.decisionMaker && input.scopeClear && input.surveyFeasible && input.contactConsent)) {
      throw new AppError('QUALIFICATION_INCOMPLETE');
    }
    await tx.exec(
      `update leads set q_genuine = true, q_decision_maker = true, q_in_service_area = true, q_scope_clear = true, q_survey_feasible = true,
              q_contact_consent = true, qualification_note = $2, qualified_at = now(), qualified_by = $3 where id = $1`,
      [input.id, input.note ?? null, ctx.userId],
    );
    await transitionLead(tx, ctx, input.id, 'QUALIFIED', { note: input.note });
  });
}

export async function assignLead(ctx: Ctx, id: string, userId: string): Promise<void> {
  requirePerm(ctx, 'lead.assign');
  await withCtx(ctx, async (tx) => {
    const lead = await loadLeadForStaff(tx, ctx, id);
    await tx.one(
      `select 1 from user_roles ur join role_permissions rp on rp.role_code = ur.role_code
        where ur.user_id = $1 and ur.revoked_at is null and rp.permission_code = 'lead.update' limit 1`, [userId]);
    await tx.exec('update leads set assigned_to = $2, updated_at = now() where id = $1', [id, userId]);
    await audit(tx, ctx, 'lead.assign', 'lead', id, { assignedTo: userId });
    await notifyUsers(tx, [userId], 'LEAD_ASSIGNED', { number: lead.lead_number, name: lead.project_name }, `/admin/leads/${id}`);
  });
}

export async function setLeadException(ctx: Ctx, id: string, to: 'LOST' | 'ON_HOLD' | 'DISQUALIFIED' | 'CANCELLED', reason: string): Promise<void> {
  requirePerm(ctx, 'lead.update');
  await withCtx(ctx, async (tx) => {
    await loadLeadForStaff(tx, ctx, id);
    await transitionLead(tx, ctx, id, to, { reason });
  });
}

export async function resumeLead(ctx: Ctx, id: string): Promise<void> {
  requirePerm(ctx, 'lead.update');
  await withCtx(ctx, async (tx) => {
    const lead = await loadLeadForStaff(tx, ctx, id);
    if (lead.status !== 'ON_HOLD' || !lead.status_before_hold) throw new AppError('INVALID_TRANSITION');
    await transitionLead(tx, ctx, id, lead.status_before_hold, { note: 'Resumed from hold' });
  });
}

export async function reviewDuplicate(ctx: Ctx, candidateId: string, isDuplicate: boolean): Promise<void> {
  requirePerm(ctx, 'lead.qualify');
  await withCtx(ctx, async (tx) => {
    const cand = await tx.one<Rec>('select * from lead_duplicate_candidates where id = $1 for update', [candidateId]);
    const lead = await loadLeadForStaff(tx, ctx, cand.lead_id);
    await tx.exec('update lead_duplicate_candidates set status = $2, reviewed_by = $3, reviewed_at = now() where id = $1',
      [candidateId, isDuplicate ? 'CONFIRMED_DUPLICATE' : 'NOT_DUPLICATE', ctx.userId]);
    await audit(tx, ctx, 'lead.duplicate_review', 'lead', cand.lead_id, { duplicateOf: cand.duplicate_of_lead_id, isDuplicate });
    // Both records and their source attribution are preserved; the newer lead is only marked, never merged.
    if (isDuplicate && !LEAD_TERMINAL.includes(lead.status)) {
      await transitionLead(tx, ctx, cand.lead_id, 'DUPLICATE', { reason: `Confirmed duplicate of ${cand.duplicate_of_lead_id}` });
    }
  });
}

export async function listAssignableStaff(ctx: Ctx): Promise<Rec[]> {
  return withCtx(ctx, (tx) => tx.query<Rec>(
    `select distinct u.id, u.full_name from users u join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
       join role_permissions rp on rp.role_code = ur.role_code and rp.permission_code = 'lead.update' where u.is_active order by u.full_name`));
}

export async function listZones(): Promise<Array<{ id: string; code: string; is_active: boolean }>> {
  return withSystem((tx) => tx.query('select id, code, is_active from zones order by code'));
}
