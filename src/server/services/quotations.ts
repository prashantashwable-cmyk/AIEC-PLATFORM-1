import { z } from 'zod';
import { PAGE_SIZE } from '@/lib/config';
import { toPaise } from '@/lib/commission';
import { SELECTION_ACTION, type LeadStatus } from '@/lib/enums';
import { AppError } from '@/lib/errors';
import { isoDateIST } from '@/lib/format';
import { zEnum, zInt, zMoney, zNumber, zOptDate, zOptMoney, zOptText, zUuid } from '@/lib/validation';
import { audit, notifyCompany, notifyCustomer, notifyPermission } from '../audit';
import { requireCompany, requireCustomer, requirePerm, type Ctx } from '../ctx';
import { withCtx, withSystem, type Rec, type Tx } from '../db';
import { saveFile } from './files';
import { leadScope, transitionLead } from './leads';

type Upload = { name: string; type: string; bytes: Buffer } | null;

const VERSION_FIELDS = [
  'manufacturer', 'model', 'capacity_kg', 'persons', 'speed_mps', 'floors', 'stops', 'door_type', 'controller', 'drive', 'safety_features',
  'supply_scope', 'installation_scope', 'civil_electrical_inclusions', 'exclusions', 'base_amount', 'freight_amount', 'tax_amount',
  'warranty_months', 'amc_terms', 'delivery_weeks', 'installation_weeks', 'validity_date', 'assumptions', 'approvals_dependencies',
] as const;
/** Fields that must be present before a quotation can be submitted (standard format, spec 5.7). */
const REQUIRED_FIELDS = [
  'manufacturer', 'model', 'capacity_kg', 'speed_mps', 'floors', 'stops', 'door_type', 'controller', 'drive', 'safety_features', 'supply_scope',
  'installation_scope', 'exclusions', 'base_amount', 'warranty_months', 'delivery_weeks', 'installation_weeks', 'validity_date', 'assumptions',
  'approvals_dependencies',
] as const;

export const quotationDraftSchema = z.object({
  id: zUuid,
  manufacturer: zOptText(200), model: zOptText(200), capacityKg: zInt(50, 20000).optional(), persons: zInt(1, 200).optional(),
  speedMps: zNumber(0.1, 20).optional(), floors: zInt(1, 100).optional(), stops: zInt(2, 100).optional(),
  doorType: zOptText(300), controller: zOptText(300), drive: zOptText(300), safetyFeatures: zOptText(2000),
  supplyScope: zOptText(2000), installationScope: zOptText(2000), civilElectricalInclusions: zOptText(2000), exclusions: zOptText(2000),
  baseAmount: zOptMoney, freightAmount: zMoney.default('0'), taxAmount: zMoney.default('0'),
  warrantyMonths: zInt(0, 240).optional(), amcTerms: zOptText(1000), deliveryWeeks: zInt(0, 200).optional(), installationWeeks: zInt(0, 200).optional(),
  validityDate: zOptDate, assumptions: zOptText(2000), approvalsDependencies: zOptText(2000),
  milestoneName: z.array(z.string().trim().max(200)).default([]),
  milestonePercent: z.array(z.string().trim()).default([]),
  submit: zOptText(10),
});
export type QuotationDraft = z.infer<typeof quotationDraftSchema>;

function milestonesOf(input: QuotationDraft): Array<{ name: string; percent: string }> {
  const out: Array<{ name: string; percent: string }> = [];
  input.milestoneName.forEach((name, i) => {
    const percent = input.milestonePercent[i] ?? '';
    if (!name && !percent) return;
    if (!name || !/^\d{1,3}(\.\d{1,2})?$/.test(percent) || Number(percent) <= 0) throw new AppError('VALIDATION', undefined, { milestones: 'INVALID' });
    out.push({ name, percent });
  });
  return out;
}

async function loadOwnQuotation(tx: Tx, ctx: Ctx, id: string): Promise<Rec> {
  const companyId = requireCompany(ctx);
  return tx.one<Rec>(
    `select q.*, v.submitted_at as version_submitted_at, v.version_no, l.status as lead_status, l.lead_number, l.customer_id
       from quotations q join quotation_versions v on v.id = q.current_version_id join leads l on l.id = q.lead_id
      where q.id = $1 and q.company_id = $2 for update of q`, [id, companyId]);
}

/** Saves the partner's working draft and, when requested, validates and submits it as an immutable version. */
export async function saveQuotation(ctx: Ctx, input: QuotationDraft, file: Upload): Promise<void> {
  requirePerm(ctx, 'quotation.submit');
  const milestones = milestonesOf(input);
  await withCtx(ctx, async (tx) => {
    const q = await loadOwnQuotation(tx, ctx, input.id);
    if (q.version_submitted_at) throw new AppError('QUOTATION_LOCKED');
    const fileId = file ? await saveFile(tx, ctx, file, 'QUOTATION', { companyId: q.company_id, customerId: q.customer_id }) : null;
    await tx.exec(
      `update quotation_versions set manufacturer=$2, model=$3, capacity_kg=$4, persons=$5, speed_mps=$6, floors=$7, stops=$8, door_type=$9, controller=$10,
              drive=$11, safety_features=$12, supply_scope=$13, installation_scope=$14, civil_electrical_inclusions=$15, exclusions=$16, base_amount=$17,
              freight_amount=$18, tax_amount=$19, warranty_months=$20, amc_terms=$21, delivery_weeks=$22, installation_weeks=$23, validity_date=$24,
              assumptions=$25, approvals_dependencies=$26, original_file_id = coalesce($27, original_file_id) where id = $1`,
      [
        q.current_version_id, input.manufacturer ?? null, input.model ?? null, input.capacityKg ?? null, input.persons ?? null, input.speedMps ?? null,
        input.floors ?? null, input.stops ?? null, input.doorType ?? null, input.controller ?? null, input.drive ?? null, input.safetyFeatures ?? null,
        input.supplyScope ?? null, input.installationScope ?? null, input.civilElectricalInclusions ?? null, input.exclusions ?? null,
        input.baseAmount ?? null, input.freightAmount, input.taxAmount, input.warrantyMonths ?? null, input.amcTerms ?? null,
        input.deliveryWeeks ?? null, input.installationWeeks ?? null, input.validityDate ?? null, input.assumptions ?? null,
        input.approvalsDependencies ?? null, fileId,
      ]);
    await tx.exec('delete from quotation_milestones where version_id = $1', [q.current_version_id]);
    for (const [i, m] of milestones.entries()) {
      await tx.exec('insert into quotation_milestones (version_id, seq, name, percent) values ($1,$2,$3,$4)', [q.current_version_id, i + 1, m.name, m.percent]);
    }
    await tx.exec('update quotations set updated_at = now() where id = $1', [input.id]);
    if (input.submit) await submitVersion(tx, ctx, q);
  });
}

async function submitVersion(tx: Tx, ctx: Ctx, q: Rec): Promise<void> {
  if (!['DRAFT', 'REVISION_REQUESTED', 'SUBMITTED', 'CLARIFICATION_REQUESTED'].includes(q.status)) throw new AppError('INVALID_TRANSITION');
  const v = await tx.one<Rec>('select * from quotation_versions where id = $1', [q.current_version_id]);
  const missing: Record<string, string> = {};
  for (const f of REQUIRED_FIELDS) if (v[f] === null || v[f] === '') missing[f.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = 'REQUIRED';
  if (v.base_amount !== null && toPaise(v.base_amount) <= 0n) missing.baseAmount = 'INVALID_AMOUNT';
  if (Object.keys(missing).length) throw new AppError('QUOTATION_INCOMPLETE', undefined, missing);
  if (v.validity_date < isoDateIST()) throw new AppError('VALIDATION', undefined, { validityDate: 'INVALID_DATE' });
  const sum = (await tx.one<{ s: string | null }>('select sum(percent)::text as s from quotation_milestones where version_id = $1', [v.id])).s;
  if (sum === null || Number(sum) !== 100) throw new AppError('MILESTONES_TOTAL', undefined, { milestones: 'INVALID' });

  await tx.exec('update quotation_versions set submitted_at = now() where id = $1', [v.id]);
  await tx.exec(`update quotations set status = 'SUBMITTED', customer_request_note = null, updated_at = now() where id = $1`, [q.id]);
  await audit(tx, ctx, 'quotation.submit', 'quotation', q.id, { version: v.version_no, total: v.total_amount }, q.company_id);

  const leadStatus = q.lead_status as LeadStatus;
  if (leadStatus === 'QUOTATION_PENDING') {
    await transitionLead(tx, ctx, q.lead_id, 'QUOTATION_RECEIVED', { note: `${q.quotation_number} v${v.version_no} submitted` });
  } else if (leadStatus === 'NEGOTIATION' && q.released_to_customer_at) {
    const pending = (await tx.one<{ n: number }>(`select count(*) as n from quotations where lead_id = $1 and status = 'REVISION_REQUESTED'`, [q.lead_id])).n;
    if (!pending) await transitionLead(tx, ctx, q.lead_id, 'CUSTOMER_REVIEW', { note: 'Revised quotation received' });
  }
  if (q.released_to_customer_at) {
    await notifyCustomer(tx, q.customer_id, 'QUOTATION_REVISED', { number: q.lead_number }, `/customer/projects/${q.lead_id}`);
  }
  await notifyPermission(tx, 'quotation.release', 'QUOTATION_SUBMITTED', { number: q.quotation_number, name: ctx.companyName }, `/admin/leads/${q.lead_id}`);
}

/** Starts version n+1 as a copy of the current submitted version. Earlier versions stay untouched. */
export async function startRevision(ctx: Ctx, id: string): Promise<void> {
  requirePerm(ctx, 'quotation.submit');
  await withCtx(ctx, async (tx) => {
    const q = await loadOwnQuotation(tx, ctx, id);
    if (!q.version_submitted_at) return; // already a working draft
    if (!['SUBMITTED', 'REVISION_REQUESTED', 'CLARIFICATION_REQUESTED'].includes(q.status)) throw new AppError('INVALID_TRANSITION');
    const cols = VERSION_FIELDS.join(', ');
    const next = await tx.one<{ id: string }>(
      `insert into quotation_versions (quotation_id, version_no, ${cols}, created_by)
       select quotation_id, version_no + 1, ${cols}, $2 from quotation_versions where id = $1 returning id`, [q.current_version_id, ctx.userId]);
    await tx.exec('insert into quotation_milestones (version_id, seq, name, percent) select $2, seq, name, percent from quotation_milestones where version_id = $1',
      [q.current_version_id, next.id]);
    await tx.exec('update quotations set current_version_id = $2, updated_at = now() where id = $1', [id, next.id]);
    await audit(tx, ctx, 'quotation.revision_start', 'quotation', id, { fromVersion: q.version_no }, q.company_id);
  });
}

export async function respondClarification(ctx: Ctx, id: string, note: string): Promise<void> {
  requirePerm(ctx, 'quotation.submit');
  await withCtx(ctx, async (tx) => {
    const q = await loadOwnQuotation(tx, ctx, id);
    if (q.status !== 'CLARIFICATION_REQUESTED' || !q.version_submitted_at) throw new AppError('INVALID_TRANSITION');
    await tx.exec(`update quotations set status = 'SUBMITTED', partner_response_note = $2, updated_at = now() where id = $1`, [id, note]);
    await audit(tx, ctx, 'quotation.clarify_response', 'quotation', id, {}, q.company_id);
    await notifyCustomer(tx, q.customer_id, 'QUOTATION_CLARIFIED', { number: q.lead_number }, `/customer/projects/${q.lead_id}`);
  });
}

export async function withdrawQuotation(ctx: Ctx, id: string, reason: string): Promise<void> {
  requirePerm(ctx, 'quotation.submit');
  await withCtx(ctx, async (tx) => {
    const q = await loadOwnQuotation(tx, ctx, id);
    if (['SELECTED', 'WITHDRAWN', 'NOT_SELECTED'].includes(q.status)) throw new AppError('INVALID_TRANSITION');
    await tx.exec(`update quotations set status = 'WITHDRAWN', partner_response_note = $2, updated_at = now() where id = $1`, [id, reason]);
    await audit(tx, ctx, 'quotation.withdraw', 'quotation', id, { reason }, q.company_id);
    await notifyPermission(tx, 'quotation.invite', 'QUOTATION_WITHDRAWN', { number: q.quotation_number, name: ctx.companyName }, `/admin/leads/${q.lead_id}`);
  });
}

/** One quotation with all its versions. Visibility is decided by row-level security for every role. */
export async function getQuotation(ctx: Ctx, id: string) {
  return withCtx(ctx, async (tx) => {
    const quotation = await tx.one<Rec>(
      `select q.*, co.legal_name, co.grade, l.lead_number, l.project_name, l.status as lead_status, l.address, z.code as zone_code
         from quotations q join companies co on co.id = q.company_id join leads l on l.id = q.lead_id join zones z on z.id = l.zone_id where q.id = $1`, [id]);
    const versions = await tx.query<Rec>('select * from quotation_versions where quotation_id = $1 order by version_no desc', [id]);
    const milestones = await tx.query<Rec>(
      'select m.* from quotation_milestones m join quotation_versions v on v.id = m.version_id where v.quotation_id = $1 order by m.version_id, m.seq', [id]);
    const requests = await tx.query<Rec>(
      `select s.action, s.note, s.created_at, v.version_no from customer_partner_selections s left join quotation_versions v on v.id = s.quotation_version_id
        where s.quotation_id = $1 order by s.created_at desc`, [id]);
    return { quotation, versions, milestones, requests };
  });
}

export async function listQuotations(ctx: Ctx, filter: { status?: string; page?: number }) {
  const internal = ctx.permissions.has('quotation.view.all');
  if (!internal) requirePerm(ctx, 'quotation.submit');
  const params: unknown[] = [];
  const where: string[] = [];
  if (internal) where.push('true'); else { params.push(requireCompany(ctx)); where.push(`q.company_id = $${params.length}`); }
  if (filter.status) { params.push(filter.status); where.push(`q.status = $${params.length}`); }
  const page = Math.max(1, filter.page ?? 1);
  return withCtx(ctx, async (tx) => {
    const from = `from quotations q join companies co on co.id = q.company_id join leads l on l.id = q.lead_id
                  left join quotation_versions v on v.id = q.current_version_id where ${where.join(' and ')}`;
    const total = (await tx.one<{ n: number }>(`select count(*) as n ${from}`, params)).n;
    const rows = await tx.query<Rec>(
      `select q.id, q.quotation_number, q.status, q.updated_at, q.released_to_customer_at, co.legal_name, l.id as lead_id, l.lead_number, l.project_name,
              v.version_no, v.total_amount, v.validity_date, v.submitted_at ${from} order by q.updated_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, params);
    return { rows, total, page };
  });
}

/** Opens the submitted quotations to the customer for comparison. Never fabricates a missing quote. */
export async function releaseToCustomer(ctx: Ctx, leadId: string): Promise<number> {
  requirePerm(ctx, 'quotation.release');
  return withCtx(ctx, async (tx) => {
    const scope = leadScope(ctx, 'l', 2);
    const lead = await tx.one<Rec>(`select l.id, l.status, l.lead_number, l.customer_id from leads l where l.id = $1 and ${scope.sql} for update`, [leadId, ...scope.params]);
    if (!['QUOTATION_RECEIVED', 'CUSTOMER_REVIEW', 'NEGOTIATION'].includes(lead.status)) throw new AppError('INVALID_TRANSITION');
    const n = await tx.exec(
      `update quotations q set released_to_customer_at = now() from quotation_versions v
        where v.id = q.current_version_id and v.submitted_at is not null and q.lead_id = $1 and q.status = 'SUBMITTED' and q.released_to_customer_at is null`, [leadId]);
    const available = (await tx.one<{ n: number }>(`select count(*) as n from quotations where lead_id = $1 and released_to_customer_at is not null and status = 'SUBMITTED'`, [leadId])).n;
    if (!available) throw new AppError('NOTHING_TO_RELEASE');
    if (lead.status === 'QUOTATION_RECEIVED') await transitionLead(tx, ctx, leadId, 'CUSTOMER_REVIEW', { note: `${available} quotation(s) released to customer` });
    await audit(tx, ctx, 'quotation.release', 'lead', leadId, { released: n, available });
    if (n) await notifyCustomer(tx, lead.customer_id, 'QUOTATIONS_READY', { number: lead.lead_number, count: available }, `/customer/projects/${leadId}`);
    return n;
  });
}

// ───────────── customer side ─────────────
/** Comparable quotations for the customer's own lead, with partner verification facts and the advisory AIEC score. */
export async function getComparison(ctx: Ctx, leadId: string) {
  const customerId = requireCustomer(ctx);
  const data = await withCtx(ctx, async (tx) => {
    await tx.one('select 1 from leads where id = $1 and customer_id = $2', [leadId, customerId]);
    const quotations = await tx.query<Rec>(
      `select q.id, q.quotation_number, q.status, q.company_id, q.customer_request_note, q.partner_response_note, co.legal_name, co.grade, co.status as partner_status,
              v.id as version_id, v.version_no, v.manufacturer, v.model, v.capacity_kg, v.persons, v.speed_mps, v.floors, v.stops, v.door_type, v.controller,
              v.drive, v.safety_features, v.supply_scope, v.installation_scope, v.civil_electrical_inclusions, v.exclusions, v.base_amount, v.freight_amount,
              v.tax_amount, v.total_amount, v.warranty_months, v.amc_terms, v.delivery_weeks, v.installation_weeks, v.validity_date, v.assumptions,
              v.approvals_dependencies, v.original_file_id, v.submitted_at,
              (select max(l.expiry_date) from company_licenses l where l.company_id = q.company_id and l.license_type = 'LIFT_CONTRACTOR'
                 and l.verification_status = 'VERIFIED' and l.expiry_date >= current_date) as licence_valid_until,
              (select max(i.expiry_date) from company_insurance_policies i where i.company_id = q.company_id and i.verification_status = 'VERIFIED'
                 and i.expiry_date >= current_date) as insurance_valid_until
         from quotations q join companies co on co.id = q.company_id
         join lateral (select * from quotation_versions x where x.quotation_id = q.id and x.submitted_at is not null order by x.version_no desc limit 1) v on true
        where q.lead_id = $1 order by v.total_amount`, [leadId]);
    const milestones = quotations.length ? await tx.query<Rec>(
      'select version_id, seq, name, percent from quotation_milestones where version_id = any($1::uuid[]) order by seq', [quotations.map((q) => q.version_id)]) : [];
    return { quotations, milestones };
  });
  // The advisory match score lives in partner-only records; ownership of the lead was verified above.
  const scores = data.quotations.length ? await withSystem((tx) => tx.query<{ company_id: string; score: string | null }>(
    'select company_id, score::text from partner_matches where lead_id = $1 and company_id = any($2::uuid[])', [leadId, data.quotations.map((q) => q.company_id)])) : [];
  const byCompany = new Map(scores.map((s) => [s.company_id, s.score]));
  return { ...data, quotations: data.quotations.map((q): Rec => ({ ...q, advisory_score: byCompany.get(q.company_id) ?? null })) };
}

export const customerActionSchema = z.object({ leadId: zUuid, action: zEnum(SELECTION_ACTION), quotationId: zUuid.optional(), note: zOptText(1000) });

/**
 * The customer's decision on the released quotations (spec 5.8). AIEC recommends; the customer chooses.
 * The exact quotation version is recorded. Authorised against the customer's own lead, then applied as
 * one trusted transaction because it also updates partner-owned records.
 */
export async function customerAction(ctx: Ctx, input: z.infer<typeof customerActionSchema>): Promise<{ orderId?: string }> {
  const customerId = requireCustomer(ctx);
  const needsQuotation = ['SELECT', 'NEGOTIATE', 'CLARIFY'].includes(input.action);
  if (needsQuotation && !input.quotationId) throw new AppError('VALIDATION', undefined, { quotationId: 'REQUIRED' });
  if (['NEGOTIATE', 'CLARIFY', 'REJECT_ALL', 'HOLD'].includes(input.action) && !input.note) throw new AppError('REASON_REQUIRED');

  return withSystem(async (tx) => {
    const lead = await tx.one<Rec>('select * from leads where id = $1 and customer_id = $2 for update', [input.leadId, customerId]);
    if (!['CUSTOMER_REVIEW', 'NEGOTIATION'].includes(lead.status)) throw new AppError('NOT_CUSTOMER_REVIEW');
    let q: Rec | null = null;
    if (needsQuotation) {
      q = await tx.one<Rec>(
        `select q.*, v.id as version_id, v.version_no, v.total_amount, v.validity_date
           from quotations q join lateral (select * from quotation_versions x where x.quotation_id = q.id and x.submitted_at is not null
                                           order by x.version_no desc limit 1) v on true
          where q.id = $1 and q.lead_id = $2 and q.released_to_customer_at is not null for update of q`, [input.quotationId, input.leadId]);
      if (q.status !== 'SUBMITTED') throw new AppError('INVALID_TRANSITION');
    }
    await tx.exec(
      'insert into customer_partner_selections (lead_id, customer_id, action, quotation_id, quotation_version_id, note, actor_id) values ($1,$2,$3,$4,$5,$6,$7)',
      [input.leadId, customerId, input.action, q?.id ?? null, q?.version_id ?? null, input.note ?? null, ctx.userId]);
    await audit(tx, ctx, 'quotation.customer_action', 'lead', input.leadId, { action: input.action, quotationId: q?.id ?? null, version: q?.version_no ?? null });
    const adminLink = `/admin/leads/${input.leadId}`;

    switch (input.action) {
      case 'SELECT': {
        if (q!.validity_date < isoDateIST()) throw new AppError('QUOTATION_EXPIRED');
        await tx.exec(`update quotations set status = case when id = $2 then 'SELECTED' else 'NOT_SELECTED' end, updated_at = now()
                        where lead_id = $1 and status in ('SUBMITTED','REVISION_REQUESTED','CLARIFICATION_REQUESTED','DRAFT')`, [input.leadId, q!.id]);
        await transitionLead(tx, ctx, input.leadId, 'SELECTED', { note: `Customer selected ${q!.quotation_number} v${q!.version_no}` });
        const policy = await tx.one<Rec>('select id, rate_percent from commission_policies where is_active');
        const order = await tx.one<{ id: string; order_number: string }>(
          `insert into orders (lead_id, quotation_id, quotation_version_id, company_id, customer_id, gross_order_value, commission_policy_id, commission_rate_percent)
           values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, order_number`,
          [input.leadId, q!.id, q!.version_id, q!.company_id, customerId, q!.total_amount, policy.id, policy.rate_percent]);
        await tx.exec(`insert into order_state_events (order_id, to_status, actor_id, reason) values ($1, 'PENDING_PARTNER_ACCEPTANCE', $2, 'Customer selection')`, [order.id, ctx.userId]);
        await transitionLead(tx, ctx, input.leadId, 'ORDER_PENDING', { note: `Order ${order.order_number} awaiting partner acceptance` });
        await notifyCompany(tx, q!.company_id, 'ORDER_AWAITING_ACCEPTANCE', { number: order.order_number }, `/partner/orders/${order.id}`);
        await notifyPermission(tx, 'order.manage', 'CUSTOMER_SELECTED', { number: lead.lead_number }, `/admin/orders/${order.id}`);
        return { orderId: order.id };
      }
      case 'NEGOTIATE':
        await tx.exec(`update quotations set status = 'REVISION_REQUESTED', customer_request_note = $2, updated_at = now() where id = $1`, [q!.id, input.note]);
        if (lead.status === 'CUSTOMER_REVIEW') await transitionLead(tx, ctx, input.leadId, 'NEGOTIATION', { note: input.note });
        await notifyCompany(tx, q!.company_id, 'REVISION_REQUESTED', { number: q!.quotation_number }, `/partner/quotations/${q!.id}`);
        break;
      case 'CLARIFY':
        await tx.exec(`update quotations set status = 'CLARIFICATION_REQUESTED', customer_request_note = $2, updated_at = now() where id = $1`, [q!.id, input.note]);
        await notifyCompany(tx, q!.company_id, 'CLARIFICATION_REQUESTED', { number: q!.quotation_number }, `/partner/quotations/${q!.id}`);
        break;
      case 'REQUEST_ANOTHER':
        if (lead.status !== 'CUSTOMER_REVIEW') throw new AppError('INVALID_TRANSITION');
        await transitionLead(tx, ctx, input.leadId, 'QUOTATION_PENDING', { note: input.note ?? 'Customer requested another eligible quotation' });
        await notifyPermission(tx, 'quotation.invite', 'ANOTHER_QUOTE_REQUESTED', { number: lead.lead_number }, adminLink);
        break;
      case 'REJECT_ALL':
        await tx.exec(`update quotations set status = 'NOT_SELECTED', updated_at = now() where lead_id = $1 and status not in ('WITHDRAWN','EXPIRED')`, [input.leadId]);
        await transitionLead(tx, ctx, input.leadId, 'LOST', { reason: `Customer rejected all quotations: ${input.note}` });
        await notifyPermission(tx, 'lead.view.all', 'CUSTOMER_REJECTED_ALL', { number: lead.lead_number }, adminLink);
        break;
      case 'HOLD':
        await transitionLead(tx, ctx, input.leadId, 'ON_HOLD', { reason: `Customer put on hold: ${input.note}` });
        await notifyPermission(tx, 'lead.view.all', 'CUSTOMER_HOLD', { number: lead.lead_number }, adminLink);
        break;
    }
    return {};
  });
}
