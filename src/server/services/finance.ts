import { z } from 'zod';
import { FINANCE_CONSENT_VERSION, isSandbox } from '@/lib/config';
import { AGREEMENT_STATUS, CONTACT_PREFERENCE, INTEGRATION_STATUS, LENDER_TYPE, REFERRAL_STATUS, STATUS_SOURCE, type ReferralStatus } from '@/lib/enums';
import { AppError } from '@/lib/errors';
import { isoDateIST } from '@/lib/format';
import { REFERRAL_MACHINE, REFERRAL_NEEDS_SOURCE, assertTransition } from '@/lib/state';
import { zBool, zEnum, zOptDate, zOptMoney, zOptText, zText, zUuid } from '@/lib/validation';
import { audit, notifyCustomer, notifyPermission } from '../audit';
import { requireCustomer, requirePerm, type Ctx } from '../ctx';
import { withCtx, type Rec, type Tx } from '../db';

/** The only data fields that may ever be handed to a lender in the referral MVP (spec 8.3). */
export const REFERRAL_FIELDS = [
  'customer_name', 'customer_phone', 'customer_type', 'project_reference', 'approx_amount', 'contact_preference', 'consent_timestamp', 'consent_version',
] as const;

async function setReferralStatus(tx: Tx, ctx: Ctx, r: Rec, to: ReferralStatus, source: string | null, note: string | null): Promise<void> {
  assertTransition(REFERRAL_MACHINE, r.status as ReferralStatus, to);
  await tx.exec(`update finance_referrals set status = $2, updated_at = now(), referred_at = case when $2 = 'REFERRED' then now() else referred_at end where id = $1`, [r.id, to]);
  await tx.exec('insert into finance_referral_events (referral_id, from_status, to_status, status_source, actor_id, note) values ($1,$2,$3,$4,$5,$6)',
    [r.id, r.status, to, source, ctx.userId, note]);
  await audit(tx, ctx, 'finance.referral_status', 'finance_referral', r.id, { from: r.status, to, source });
}

// ───────────── customer ─────────────
export const consentSchema = z.object({ leadId: zUuid, approxAmount: zOptMoney, contactPreference: zEnum(CONTACT_PREFERENCE), consent: zBool });

/** Explicit, purpose-specific consent creates the referral. Without it nothing is recorded or shared. */
export async function giveFinanceConsent(ctx: Ctx, input: z.infer<typeof consentSchema>): Promise<string> {
  const customerId = requireCustomer(ctx);
  if (!input.consent) throw new AppError('VALIDATION', undefined, { consent: 'CONSENT_REQUIRED' });
  return withCtx(ctx, async (tx) => {
    await tx.one('select 1 from leads where id = $1 and customer_id = $2', [input.leadId, customerId]);
    const open = await tx.maybeOne(`select 1 from finance_referrals where lead_id = $1 and status not in ('WITHDRAWN','EXPIRED','REJECTED','APPROVED')`, [input.leadId]);
    if (open) throw new AppError('DUPLICATE');
    const consent = await tx.one<{ id: string }>(
      `insert into customer_consents (customer_id, purpose, notice_version, lead_id, source) values ($1, 'FINANCE_REFERRAL', $2, $3, 'CUSTOMER_APP') returning id`,
      [customerId, FINANCE_CONSENT_VERSION, input.leadId]);
    const referral = await tx.one<{ id: string; referral_number: string }>(
      `insert into finance_referrals (customer_id, lead_id, consent_id, approx_amount, contact_preference, status, created_by)
       values ($1,$2,$3,$4,$5,'CONSENTED',$6) returning id, referral_number`,
      [customerId, input.leadId, consent.id, input.approxAmount ?? null, input.contactPreference, ctx.userId]);
    await tx.exec(`insert into finance_referral_events (referral_id, to_status, status_source, actor_id, note) values ($1, 'CONSENTED', 'CUSTOMER', $2, $3)`,
      [referral.id, ctx.userId, `Consent version ${FINANCE_CONSENT_VERSION}`]);
    await audit(tx, ctx, 'finance.consent', 'finance_referral', referral.id, { consentVersion: FINANCE_CONSENT_VERSION });
    await notifyPermission(tx, 'finance.referral.manage', 'REFERRAL_CONSENTED', { number: referral.referral_number }, '/admin/finance');
    return referral.id;
  });
}

/** Consent can be withdrawn at any time; the withdrawal is recorded and the referral stops. */
export async function withdrawFinanceConsent(ctx: Ctx, referralId: string): Promise<void> {
  const customerId = requireCustomer(ctx);
  await withCtx(ctx, async (tx) => {
    const r = await tx.one<Rec>('select * from finance_referrals where id = $1 and customer_id = $2 for update', [referralId, customerId]);
    await setReferralStatus(tx, ctx, r, 'WITHDRAWN', 'CUSTOMER', 'Consent withdrawn by customer');
    await tx.exec('update customer_consents set withdrawn_at = now() where id = $1 and withdrawn_at is null', [r.consent_id]);
    await notifyPermission(tx, 'finance.referral.manage', 'REFERRAL_WITHDRAWN', { number: r.referral_number }, '/admin/finance');
  });
}

export async function listMyReferrals(ctx: Ctx) {
  const customerId = requireCustomer(ctx);
  return withCtx(ctx, async (tx) => {
    const referrals = await tx.query<Rec>(
      `select r.*, l.lead_number, l.project_name, lp.legal_name as lender_name, lp.grievance_route
         from finance_referrals r join leads l on l.id = r.lead_id left join lender_partners lp on lp.id = r.lender_id
        where r.customer_id = $1 order by r.created_at desc`, [customerId]);
    const leads = await tx.query<Rec>(
      `select l.id, l.lead_number, l.project_name from leads l where l.customer_id = $1 and l.status not in ('LOST','CANCELLED','DUPLICATE','DISQUALIFIED')
          and not exists (select 1 from finance_referrals r where r.lead_id = l.id and r.status not in ('WITHDRAWN','EXPIRED','REJECTED','APPROVED')) order by l.created_at desc`, [customerId]);
    return { referrals, leads };
  });
}

// ───────────── finance referral coordinator ─────────────
export async function listReferrals(ctx: Ctx, filter: { status?: string }) {
  requirePerm(ctx, 'finance.referral.view');
  return withCtx(ctx, async (tx) => {
    const referrals = await tx.query<Rec>(
      `select r.*, c.name as customer_name, c.phone as customer_phone, c.customer_type, l.lead_number, l.project_name, lp.legal_name as lender_name,
              cc.granted_at as consent_at, cc.notice_version, cc.withdrawn_at
         from finance_referrals r join customers c on c.id = r.customer_id join leads l on l.id = r.lead_id
         left join lender_partners lp on lp.id = r.lender_id left join customer_consents cc on cc.id = r.consent_id
        where $1::text is null or r.status = $1 order by r.created_at desc limit 200`, [filter.status ?? null]);
    const events = await tx.query<Rec>(
      `select e.*, u.full_name as actor from finance_referral_events e left join users u on u.id = e.actor_id
        where e.referral_id = any($1::uuid[]) order by e.created_at`, [referrals.map((r) => r.id)]);
    const lenders = await tx.query<Rec>('select * from lender_partners order by legal_name');
    return { referrals, events, lenders };
  });
}

function lenderReady(lender: Rec): boolean {
  const today = isoDateIST();
  return lender.is_active && lender.agreement_status === 'SIGNED' && (!lender.agreement_end || lender.agreement_end >= today)
    && lender.approved_fields.length > 0 && Boolean(lender.referral_channel)
    // A sandbox lender can only ever be used in sandbox mode; it is never treated as a real integration.
    && (lender.integration_status !== 'SANDBOX' || isSandbox());
}

export const referralUpdateSchema = z.object({
  id: zUuid, to: zEnum(REFERRAL_STATUS), lenderId: zUuid.optional(), statusSource: zEnum(STATUS_SOURCE).optional(), note: zOptText(1000),
});

/**
 * Moves a referral forward. Handoff sends only the fields the lender agreement approves; lender-process
 * statuses must name who supplied them (lender or customer) - approval is never inferred (spec 8.5).
 */
export async function updateReferral(ctx: Ctx, input: z.infer<typeof referralUpdateSchema>): Promise<void> {
  requirePerm(ctx, 'finance.referral.manage');
  await withCtx(ctx, async (tx) => {
    const r = await tx.one<Rec>(
      `select r.*, c.name as customer_name, c.phone as customer_phone, c.customer_type, l.lead_number, cc.granted_at, cc.notice_version, cc.withdrawn_at
         from finance_referrals r join customers c on c.id = r.customer_id join leads l on l.id = r.lead_id
         left join customer_consents cc on cc.id = r.consent_id where r.id = $1 for update of r`, [input.id]);
    if (input.to === 'WITHDRAWN' || input.to === 'CONSENTED' || input.to === 'CONSENT_PENDING') throw new AppError('FORBIDDEN'); // customer-only decisions
    if (REFERRAL_NEEDS_SOURCE.includes(input.to) && !input.statusSource) throw new AppError('STATUS_SOURCE_REQUIRED', undefined, { statusSource: 'REQUIRED' });
    if (['READY_TO_REFER', 'REFERRED'].includes(input.to) && (!r.consent_id || r.withdrawn_at)) throw new AppError('CONSENT_MISSING');

    if (input.to === 'REFERRED') {
      if (!input.lenderId) throw new AppError('VALIDATION', undefined, { lenderId: 'REQUIRED' });
      const lender = await tx.one<Rec>('select * from lender_partners where id = $1', [input.lenderId]);
      if (!lenderReady(lender)) throw new AppError('LENDER_NOT_APPROVED');
      const all: Record<string, unknown> = {
        customer_name: r.customer_name, customer_phone: r.customer_phone, customer_type: r.customer_type, project_reference: r.lead_number,
        approx_amount: r.approx_amount, contact_preference: r.contact_preference, consent_timestamp: r.granted_at, consent_version: r.notice_version,
      };
      const fields = (lender.approved_fields as string[]).filter((f) => (REFERRAL_FIELDS as readonly string[]).includes(f));
      const payload = Object.fromEntries(fields.map((f) => [f, all[f]]));
      await tx.exec('update finance_referrals set lender_id = $2 where id = $1', [r.id, lender.id]);
      await tx.exec('insert into finance_handoffs (referral_id, lender_id, mode, channel, fields_sent, payload, created_by) values ($1,$2,$3,$4,$5,$6,$7)',
        [r.id, lender.id, lender.integration_status, lender.referral_channel, fields, JSON.stringify(payload), ctx.userId]);
      await audit(tx, ctx, 'finance.handoff', 'finance_referral', r.id, { lenderId: lender.id, mode: lender.integration_status, fields });
    }
    await setReferralStatus(tx, ctx, r, input.to, input.statusSource ?? null, input.note ?? null);
    await notifyCustomer(tx, r.customer_id, 'REFERRAL_STATUS', { number: r.referral_number, status: input.to }, '/customer/finance');
  });
}

export const lenderSchema = z.object({
  id: zUuid.optional(), legalName: zText(200), lenderType: zEnum(LENDER_TYPE), regulatoryReference: zOptText(200), contactName: zOptText(120),
  contactPhone: zOptText(20), contactEmail: zOptText(200), productCategory: zOptText(200), agreementStatus: zEnum(AGREEMENT_STATUS),
  agreementStart: zOptDate, agreementEnd: zOptDate, approvedFields: z.array(z.enum(REFERRAL_FIELDS)).default([]), referralChannel: zOptText(300),
  feeModel: zOptText(500), grievanceRoute: zOptText(500), integrationStatus: zEnum(INTEGRATION_STATUS), complianceReviewDate: zOptDate, isActive: zBool,
});
export async function saveLender(ctx: Ctx, input: z.infer<typeof lenderSchema>): Promise<void> {
  requirePerm(ctx, 'lender.manage');
  // A real integration cannot be declared without a signed agreement on record.
  if (input.integrationStatus !== 'SANDBOX' && input.agreementStatus !== 'SIGNED') throw new AppError('LENDER_NOT_APPROVED', undefined, { agreementStatus: 'INVALID' });
  const params = [
    input.legalName, input.lenderType, input.regulatoryReference ?? null, input.contactName ?? null, input.contactPhone ?? null, input.contactEmail ?? null,
    input.productCategory ?? null, input.agreementStatus, input.agreementStart ?? null, input.agreementEnd ?? null, input.approvedFields,
    input.referralChannel ?? null, input.feeModel ?? null, input.grievanceRoute ?? null, input.integrationStatus, input.complianceReviewDate ?? null, input.isActive,
  ];
  await withCtx(ctx, async (tx) => {
    const id = input.id
      ? (await tx.one<{ id: string }>(
        `update lender_partners set legal_name=$2, lender_type=$3, regulatory_reference=$4, contact_name=$5, contact_phone=$6, contact_email=$7, product_category=$8,
                agreement_status=$9, agreement_start=$10, agreement_end=$11, approved_fields=$12, referral_channel=$13, fee_model=$14, grievance_route=$15,
                integration_status=$16, compliance_review_date=$17, is_active=$18 where id = $1 returning id`, [input.id, ...params])).id
      : (await tx.one<{ id: string }>(
        `insert into lender_partners (legal_name, lender_type, regulatory_reference, contact_name, contact_phone, contact_email, product_category, agreement_status,
                agreement_start, agreement_end, approved_fields, referral_channel, fee_model, grievance_route, integration_status, compliance_review_date, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`, params)).id;
    await audit(tx, ctx, 'finance.lender_save', 'lender_partner', id, { legalName: input.legalName, agreementStatus: input.agreementStatus });
  });
}
