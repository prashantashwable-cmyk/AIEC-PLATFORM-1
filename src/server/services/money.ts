import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { PAGE_SIZE } from '@/lib/config';
import { commissionFor, fromPaise, percentOf, rateToE4, toPaise } from '@/lib/commission';
import { EVIDENCE_KIND, PAYMENT_MODE, type CollectionStatus } from '@/lib/enums';
import { AppError } from '@/lib/errors';
import { isoDateIST } from '@/lib/format';
import { COLLECTION_MACHINE, assertTransition } from '@/lib/state';
import { zDate, zEnum, zMoney, zNumber, zOptText, zText, zUuid } from '@/lib/validation';
import { audit, getSetting, notifyCompany, notifyCustomer, notifyPermission } from '../audit';
import { can, requireCompany, requireCustomer, requirePerm, type Ctx } from '../ctx';
import { withCtx, withSystem, type Rec, type Tx } from '../db';
import { saveFile } from './files';

type Upload = { name: string; type: string; bytes: Buffer } | null;

// ───────────────────────── partner: collection evidence ─────────────────────────
export const collectionSchema = z.object({
  projectId: zUuid, milestoneId: zUuid.optional(), amountReceived: zMoney, excludedAmount: zMoney.default('0'), exclusionNote: zOptText(500),
  collectionDate: zDate, paymentMode: zEnum(PAYMENT_MODE), bankReference: zOptText(100), partnerReceiptNo: zOptText(100),
  evidenceKind: zEnum(EVIDENCE_KIND).default('BANK_PROOF'),
});

/**
 * Partner records a payment it received directly from the customer (AIEC never holds the money).
 * The record needs evidence before review; the total can never exceed the contract value.
 */
export async function submitCollection(ctx: Ctx, input: z.infer<typeof collectionSchema>, file: Upload): Promise<string> {
  requirePerm(ctx, 'payment.evidence.submit');
  const companyId = requireCompany(ctx);
  if (toPaise(input.amountReceived) <= 0n) throw new AppError('VALIDATION', undefined, { amountReceived: 'INVALID_AMOUNT' });
  if (toPaise(input.excludedAmount) > toPaise(input.amountReceived)) throw new AppError('VALIDATION', undefined, { excludedAmount: 'INVALID_AMOUNT' });
  if (toPaise(input.excludedAmount) > 0n && !input.exclusionNote) throw new AppError('VALIDATION', undefined, { exclusionNote: 'REQUIRED' });
  if (input.collectionDate > isoDateIST()) throw new AppError('VALIDATION', undefined, { collectionDate: 'INVALID_DATE' });
  return withCtx(ctx, async (tx) => {
    const project = await tx.one<Rec>(
      `select p.id, p.order_id, p.customer_id, p.lead_id, p.project_number, o.gross_order_value from projects p join orders o on o.id = p.order_id
        where p.id = $1 and p.company_id = $2 for update of p`, [input.projectId, companyId]);
    if (input.milestoneId) await tx.one('select 1 from project_milestones where id = $1 and project_id = $2', [input.milestoneId, input.projectId]);
    const collected = (await tx.one<{ s: string }>(
      `select coalesce(sum(amount_received - refunded_amount), 0)::text as s from partner_collections where order_id = $1 and status <> 'REJECTED'`, [project.order_id])).s;
    if (toPaise(collected) + toPaise(input.amountReceived) > toPaise(project.gross_order_value)) throw new AppError('AMOUNT_EXCEEDS', undefined, { amountReceived: 'INVALID_AMOUNT' });
    if (input.bankReference) {
      const dup = await tx.maybeOne(`select 1 from partner_collections where company_id = $1 and bank_reference = $2 and status <> 'REJECTED'`, [companyId, input.bankReference]);
      if (dup) throw new AppError('COLLECTION_DUPLICATE', undefined, { bankReference: 'DUPLICATE' });
    }
    const hasEvidence = Boolean(file || input.bankReference);
    const row = await tx.one<{ id: string }>(
      `insert into partner_collections (order_id, project_id, milestone_id, company_id, customer_id, amount_received, excluded_amount, exclusion_note,
                                        collection_date, payment_mode, bank_reference, partner_receipt_no, status, submitted_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [project.order_id, input.projectId, input.milestoneId ?? null, companyId, project.customer_id, input.amountReceived, input.excludedAmount,
        input.exclusionNote ?? null, input.collectionDate, input.paymentMode, input.bankReference ?? null, input.partnerReceiptNo ?? null,
        hasEvidence ? 'SUBMITTED' : 'PENDING_EVIDENCE', ctx.userId]);
    if (file) {
      const fileId = await saveFile(tx, ctx, file, 'COLLECTION', { companyId, customerId: project.customer_id });
      await tx.exec('insert into collection_evidence (collection_id, file_id, kind) values ($1,$2,$3)', [row.id, fileId, input.evidenceKind]);
    }
    await audit(tx, ctx, 'collection.submit', 'partner_collection', row.id, { amount: input.amountReceived, excluded: input.excludedAmount }, companyId);
    if (hasEvidence) await notifyPermission(tx, 'payment.reconcile', 'COLLECTION_SUBMITTED', { number: project.project_number, amount: input.amountReceived }, '/admin/collections');
    await notifyCustomer(tx, project.customer_id, 'COLLECTION_RECORDED', { number: project.project_number, amount: input.amountReceived }, `/customer/projects/${project.lead_id}`);
    return row.id;
  });
}

export async function addCollectionEvidence(ctx: Ctx, collectionId: string, kind: (typeof EVIDENCE_KIND)[number], file: Upload): Promise<void> {
  requirePerm(ctx, 'payment.evidence.submit');
  const companyId = requireCompany(ctx);
  if (!file) throw new AppError('VALIDATION', undefined, { file: 'FILE_REQUIRED' });
  await withCtx(ctx, async (tx) => {
    const c = await tx.one<Rec>('select * from partner_collections where id = $1 and company_id = $2 for update', [collectionId, companyId]);
    if (!['PENDING_EVIDENCE', 'SUBMITTED', 'UNDER_REVIEW', 'DISPUTED'].includes(c.status)) throw new AppError('INVALID_TRANSITION');
    const fileId = await saveFile(tx, ctx, file, 'COLLECTION', { companyId, customerId: c.customer_id });
    await tx.exec('insert into collection_evidence (collection_id, file_id, kind) values ($1,$2,$3)', [collectionId, fileId, kind]);
    if (c.status === 'PENDING_EVIDENCE') {
      await tx.exec(`update partner_collections set status = 'SUBMITTED' where id = $1`, [collectionId]);
      await notifyPermission(tx, 'payment.reconcile', 'COLLECTION_SUBMITTED', { number: '', amount: c.amount_received }, '/admin/collections');
    }
    await audit(tx, ctx, 'collection.evidence_add', 'partner_collection', collectionId, { kind }, companyId);
  });
}

/** The paying customer confirms that they made this payment. */
export async function customerConfirmCollection(ctx: Ctx, collectionId: string): Promise<void> {
  const customerId = requireCustomer(ctx);
  await withCtx(ctx, async (tx) => {
    const n = await tx.exec(
      `update partner_collections set customer_confirmed_at = coalesce(customer_confirmed_at, now()) where id = $1 and customer_id = $2 and status not in ('REJECTED','REFUNDED')`,
      [collectionId, customerId]);
    if (!n) throw new AppError('NOT_FOUND');
    await audit(tx, ctx, 'collection.customer_confirm', 'partner_collection', collectionId, {});
  });
}

// ───────────────────────── AIEC: reconciliation ─────────────────────────
/**
 * Creates the commission ledger entry for a verified collection. Exactly-once: the unique index on
 * (collection_id) for COMMISSION entries makes replays and duplicate webhooks harmless.
 */
async function generateCommission(tx: Tx, ctx: Ctx | null, collectionId: string): Promise<boolean> {
  const c = await tx.one<Rec>(
    `select pc.id, pc.order_id, pc.company_id, pc.eligible_amount::text as eligible, pc.status, o.commission_rate_percent::text as rate, o.commission_policy_id
       from partner_collections pc join orders o on o.id = pc.order_id where pc.id = $1`, [collectionId]);
  // Commission exists only for VERIFIED collections - never for unpaid contract value.
  if (c.status !== 'VERIFIED') throw new AppError('INVALID_TRANSITION');
  const amount = commissionFor(c.eligible, c.rate);
  const inserted = await tx.exec(
    `insert into commission_ledger (entry_type, order_id, company_id, collection_id, eligible_amount, rate_percent, policy_id, amount, idempotency_key, created_by)
     values ('COMMISSION', $1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing`,
    [c.order_id, c.company_id, c.id, c.eligible, c.rate, c.commission_policy_id, amount, `commission:${c.id}`, ctx?.userId ?? null]);
  if (inserted) await audit(tx, ctx, 'commission.generate', 'partner_collection', c.id, { eligible: c.eligible, rate: c.rate, amount }, c.company_id);
  return inserted > 0;
}

async function setCollectionStatus(tx: Tx, ctx: Ctx | null, c: Rec, to: CollectionStatus, note: string | null, basis: string | null = null): Promise<void> {
  assertTransition(COLLECTION_MACHINE, c.status as CollectionStatus, to);
  await tx.exec(
    `update partner_collections set status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4, verification_basis = coalesce($5, verification_basis) where id = $1`,
    [c.id, to, ctx?.userId ?? null, note, basis]);
  await audit(tx, ctx, 'collection.status', 'partner_collection', c.id, { from: c.status, to, note, basis }, c.company_id);
}

export const reconcileSchema = z.object({ id: zUuid, decision: zEnum(['review', 'verify', 'reject', 'dispute'] as const), note: zOptText(1000) });

/**
 * Reconciliation decision. Verification requires a bank reference, or a partner receipt that the
 * customer has confirmed: a screenshot alone is never sufficient (spec 7.4).
 */
export async function reconcileCollection(ctx: Ctx, input: z.infer<typeof reconcileSchema>): Promise<void> {
  requirePerm(ctx, 'payment.reconcile');
  if (['reject', 'dispute'].includes(input.decision) && !input.note) throw new AppError('REASON_REQUIRED');
  await withCtx(ctx, async (tx) => {
    const c = await tx.one<Rec>('select * from partner_collections where id = $1 for update', [input.id]);
    switch (input.decision) {
      case 'review':
        await setCollectionStatus(tx, ctx, c, 'UNDER_REVIEW', input.note ?? null);
        break;
      case 'verify': {
        const basis = c.bank_reference ? 'BANK_REFERENCE' : c.partner_receipt_no && c.customer_confirmed_at ? 'RECEIPT_AND_CUSTOMER_CONFIRMATION' : null;
        if (!basis) throw new AppError('EVIDENCE_REQUIRED');
        await setCollectionStatus(tx, ctx, c, 'VERIFIED', input.note ?? null, basis);
        await generateCommission(tx, ctx, c.id);
        break;
      }
      case 'reject':
        await setCollectionStatus(tx, ctx, c, 'REJECTED', input.note ?? null);
        break;
      case 'dispute': {
        await setCollectionStatus(tx, ctx, c, 'DISPUTED', input.note ?? null);
        await tx.exec(
          `insert into disputes (kind, order_id, collection_id, company_id, customer_id, raised_by, description) values ('PAYMENT', $1, $2, $3, $4, $5, $6)`,
          [c.order_id, c.id, c.company_id, c.customer_id, ctx.userId, input.note]);
        break;
      }
    }
    await notifyCompany(tx, c.company_id, 'COLLECTION_STATUS', { amount: c.amount_received, status: input.decision }, '/partner/collections');
  });
}

export const refundSchema = z.object({ id: zUuid, amount: zMoney, reason: zText(500) });
/** Records a refund of a verified collection and appends a proportional commission reversal. Nothing is edited in place. */
export async function recordRefund(ctx: Ctx, input: z.infer<typeof refundSchema>): Promise<void> {
  requirePerm(ctx, 'payment.reconcile');
  await withCtx(ctx, async (tx) => {
    const c = await tx.one<Rec>(
      `select pc.*, pc.amount_received::text as received, pc.eligible_amount::text as eligible, pc.refunded_amount::text as refunded,
              o.commission_rate_percent::text as rate, o.commission_policy_id
         from partner_collections pc join orders o on o.id = pc.order_id where pc.id = $1 for update of pc`, [input.id]);
    if (!['VERIFIED', 'REFUNDED', 'DISPUTED'].includes(c.status)) throw new AppError('INVALID_TRANSITION');
    const refund = toPaise(input.amount);
    const newTotal = toPaise(c.refunded) + refund;
    if (refund <= 0n || newTotal > toPaise(c.received)) throw new AppError('AMOUNT_EXCEEDS', undefined, { amount: 'INVALID_AMOUNT' });
    const hadCommission = await tx.maybeOne<{ id: string }>(`select id from commission_ledger where collection_id = $1 and entry_type = 'COMMISSION'`, [c.id]);
    await tx.exec(`update partner_collections set refunded_amount = $2, status = 'REFUNDED', reviewed_by = $3, reviewed_at = now(), review_note = $4 where id = $1`,
      [c.id, fromPaise(newTotal), ctx.userId, input.reason]);
    await audit(tx, ctx, 'collection.refund', 'partner_collection', c.id, { amount: input.amount, reason: input.reason }, c.company_id);
    if (hadCommission) {
      // Eligible share of the refund, in proportion to the original collection.
      const eligibleRefund = (refund * toPaise(c.eligible)) / toPaise(c.received);
      const reversal = -percentOf(eligibleRefund, rateToE4(c.rate));
      await tx.exec(
        `insert into commission_ledger (entry_type, order_id, company_id, collection_id, related_entry_id, eligible_amount, rate_percent, policy_id, amount, reason, idempotency_key, created_by)
         values ('REFUND_REVERSAL', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [c.order_id, c.company_id, c.id, hadCommission.id, fromPaise(-eligibleRefund), c.rate, c.commission_policy_id, fromPaise(reversal),
          `Refund of ${input.amount}: ${input.reason}`, `refund:${c.id}:${newTotal}`, ctx.userId]);
    }
    await notifyCompany(tx, c.company_id, 'COLLECTION_STATUS', { amount: input.amount, status: 'refund' }, '/partner/collections');
  });
}

/**
 * Bank-reconciliation webhook (SANDBOX contract: no bank is connected). Verifies the HMAC signature,
 * records the event id exactly once and verifies the matching collection. Replays change nothing.
 */
export async function handleReconciliationWebhook(rawBody: string, signature: string | null): Promise<{ status: 'processed' | 'duplicate' | 'no_match' }> {
  const secret = process.env.RECONCILIATION_WEBHOOK_SECRET;
  if (!secret) throw new AppError('FORBIDDEN');
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(signature ?? '');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new AppError('FORBIDDEN');
  const parsed = z.object({ eventId: zText(200), companyId: zUuid, bankReference: zText(100), amount: zMoney }).safeParse(JSON.parse(rawBody));
  if (!parsed.success) throw new AppError('VALIDATION');
  const event = parsed.data;
  return withSystem(async (tx) => {
    const fresh = await tx.exec(`insert into webhook_events (provider, event_id, payload) values ('bank-sandbox', $1, $2) on conflict do nothing`, [event.eventId, rawBody]);
    if (!fresh) return { status: 'duplicate' as const };
    const c = await tx.maybeOne<Rec>(
      `select * from partner_collections where company_id = $1 and bank_reference = $2 and amount_received = $3::numeric
          and status in ('SUBMITTED','UNDER_REVIEW') for update`, [event.companyId, event.bankReference, event.amount]);
    const status = c ? 'processed' as const : 'no_match' as const;
    if (c) {
      await setCollectionStatus(tx, null, c, 'VERIFIED', `Bank webhook ${event.eventId}`, 'BANK_WEBHOOK');
      await generateCommission(tx, null, c.id);
    }
    await tx.exec(`update webhook_events set result = $2 where provider = 'bank-sandbox' and event_id = $1`, [event.eventId, status]);
    return { status };
  });
}

export async function listCollections(ctx: Ctx, filter: { status?: string; projectId?: string; page?: number }) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (can(ctx, 'payment.reconcile') || can(ctx, 'commission.view')) where.push('true');
  else if (can(ctx, 'payment.evidence.submit')) { params.push(requireCompany(ctx)); where.push(`pc.company_id = $${params.length}`); }
  else if (ctx.customerId) { params.push(ctx.customerId); where.push(`pc.customer_id = $${params.length}`); }
  else throw new AppError('FORBIDDEN');
  if (filter.status) { params.push(filter.status); where.push(`pc.status = $${params.length}`); }
  if (filter.projectId) { params.push(filter.projectId); where.push(`pc.project_id = $${params.length}`); }
  const page = Math.max(1, filter.page ?? 1);
  return withCtx(ctx, async (tx) => {
    const from = `from partner_collections pc join projects p on p.id = pc.project_id join companies co on co.id = pc.company_id
                  join customers c on c.id = pc.customer_id left join project_milestones m on m.id = pc.milestone_id where ${where.join(' and ')}`;
    const total = (await tx.one<{ n: number }>(`select count(*) as n ${from}`, params)).n;
    const rows = await tx.query<Rec>(
      `select pc.*, p.project_number, p.lead_id, co.legal_name, c.name as customer_name, m.name as milestone_name,
              (select coalesce(json_agg(json_build_object('file_id', e.file_id, 'kind', e.kind)), '[]'::json) from collection_evidence e where e.collection_id = pc.id) as evidence
         ${from} order by pc.created_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, params);
    return { rows, total, page };
  });
}

// ───────────────────────── commission ledger, invoices, payments ─────────────────────────
export async function listLedger(ctx: Ctx, filter: { companyId?: string; status?: string; page?: number }) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (can(ctx, 'commission.view')) where.push('true');
  else if (can(ctx, 'commission.view.own')) { params.push(requireCompany(ctx)); where.push(`cl.company_id = $${params.length}`); }
  else throw new AppError('FORBIDDEN');
  if (filter.companyId) { params.push(filter.companyId); where.push(`cl.company_id = $${params.length}`); }
  if (filter.status === 'DUE') where.push(`cl.status = 'INVOICED' and ci.due_date < (now() at time zone 'Asia/Kolkata')::date`);
  else if (filter.status) { params.push(filter.status); where.push(`cl.status = $${params.length}`); }
  const page = Math.max(1, filter.page ?? 1);
  return withCtx(ctx, async (tx) => {
    const from = `from commission_ledger cl join companies co on co.id = cl.company_id join orders o on o.id = cl.order_id
                  left join commission_invoices ci on ci.id = cl.invoice_id where ${where.join(' and ')}`;
    const total = (await tx.one<{ n: number }>(`select count(*) as n ${from}`, params)).n;
    const rows = await tx.query<Rec>(
      `select cl.*, co.legal_name, o.order_number, ci.invoice_number, ci.due_date,
              case when cl.status = 'INVOICED' and ci.due_date < (now() at time zone 'Asia/Kolkata')::date then 'DUE' else cl.status end as display_status
         ${from} order by cl.created_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, params);
    const totals = await tx.one<Rec>(
      `select coalesce(sum(cl.amount), 0)::text as earned,
              coalesce(sum(cl.amount) filter (where cl.status = 'VERIFIED'), 0)::text as uninvoiced,
              coalesce(sum(cl.amount) filter (where cl.status = 'INVOICED'), 0)::text as invoiced,
              coalesce(sum(cl.amount) filter (where cl.status = 'PAID'), 0)::text as paid ${from}`, params);
    return { rows, total, page, totals };
  });
}

export async function listInvoices(ctx: Ctx) {
  if (!can(ctx, 'commission.view')) requirePerm(ctx, 'commission.view.own');
  return withCtx(ctx, async (tx) => {
    const invoices = await tx.query<Rec>(
      `select ci.*, co.legal_name, cp.reference as payment_reference, cp.paid_on,
              case when ci.status = 'ISSUED' and ci.due_date < (now() at time zone 'Asia/Kolkata')::date then 'DUE' else ci.status end as display_status
         from commission_invoices ci join companies co on co.id = ci.company_id left join commission_payments cp on cp.invoice_id = ci.id
        where $1::uuid is null or ci.company_id = $1 order by ci.issued_at desc limit 200`, [can(ctx, 'commission.view') ? null : ctx.companyId]);
    const invoiceable = can(ctx, 'commission.calculate') ? await tx.query<Rec>(
      `select cl.company_id, co.legal_name, sum(cl.amount)::text as amount, count(*) as entries from commission_ledger cl join companies co on co.id = cl.company_id
        where cl.status = 'VERIFIED' and cl.invoice_id is null group by cl.company_id, co.legal_name having sum(cl.amount) > 0 order by co.legal_name`) : [];
    const policies = await tx.query<Rec>('select * from commission_policies order by version desc');
    return { invoices, invoiceable, policies };
  });
}

/** Invoices every verified, un-invoiced ledger entry of one partner. GST treatment is configuration pending CA review. */
export async function createInvoice(ctx: Ctx, companyId: string): Promise<string> {
  requirePerm(ctx, 'commission.calculate');
  return withCtx(ctx, async (tx) => {
    const entries = await tx.query<{ id: string; amount: string }>(
      `select id, amount::text from commission_ledger where company_id = $1 and status = 'VERIFIED' and invoice_id is null order by created_at for update`, [companyId]);
    const subtotal = entries.reduce((sum, e) => sum + toPaise(e.amount), 0n);
    if (!entries.length || subtotal <= 0n) throw new AppError('NOTHING_TO_INVOICE');
    const gstRate = await getSetting(tx, 'commission_invoice_gst_percent');
    const gst = percentOf(subtotal, rateToE4(gstRate));
    const dueDays = Number(await getSetting(tx, 'commission_invoice_due_days'));
    const invoice = await tx.one<{ id: string; invoice_number: string }>(
      `insert into commission_invoices (company_id, subtotal, gst_rate_percent, gst_amount, total, due_date, issued_by)
       values ($1,$2,$3,$4,$5, ((now() at time zone 'Asia/Kolkata')::date + $6::int), $7) returning id, invoice_number`,
      [companyId, fromPaise(subtotal), gstRate, fromPaise(gst), fromPaise(subtotal + gst), dueDays, ctx.userId]);
    await tx.exec(`update commission_ledger set status = 'INVOICED', invoice_id = $2 where id = any($1::uuid[])`, [entries.map((e) => e.id), invoice.id]);
    await audit(tx, ctx, 'commission.invoice', 'commission_invoice', invoice.id, { entries: entries.length, subtotal: fromPaise(subtotal), total: fromPaise(subtotal + gst) }, companyId);
    await notifyCompany(tx, companyId, 'COMMISSION_INVOICED', { number: invoice.invoice_number, amount: fromPaise(subtotal + gst) }, '/partner/commissions');
    return invoice.id;
  });
}

export const invoicePaymentSchema = z.object({ invoiceId: zUuid, amount: zMoney, paidOn: zDate, reference: zText(100) });
export async function recordInvoicePayment(ctx: Ctx, input: z.infer<typeof invoicePaymentSchema>): Promise<void> {
  requirePerm(ctx, 'commission.calculate');
  await withCtx(ctx, async (tx) => {
    const invoice = await tx.one<Rec>('select *, total::text as total_text from commission_invoices where id = $1 for update', [input.invoiceId]);
    if (invoice.status !== 'ISSUED') throw new AppError('INVOICE_NOT_OPEN');
    if (toPaise(input.amount) !== toPaise(invoice.total_text)) throw new AppError('PAYMENT_MISMATCH', undefined, { amount: 'INVALID_AMOUNT' });
    const dup = await tx.maybeOne('select 1 from commission_payments where reference = $1', [input.reference]);
    if (dup) throw new AppError('DUPLICATE', undefined, { reference: 'DUPLICATE' });
    await tx.exec('insert into commission_payments (invoice_id, amount, paid_on, reference, recorded_by) values ($1,$2,$3,$4,$5)',
      [input.invoiceId, input.amount, input.paidOn, input.reference, ctx.userId]);
    await tx.exec(`update commission_invoices set status = 'PAID', paid_at = now() where id = $1`, [input.invoiceId]);
    await tx.exec(`update commission_ledger set status = 'PAID' where invoice_id = $1 and status = 'INVOICED'`, [input.invoiceId]);
    await audit(tx, ctx, 'commission.payment', 'commission_invoice', input.invoiceId, { amount: input.amount, reference: input.reference }, invoice.company_id);
  });
}

export const adjustmentSchema = z.object({ entryId: zUuid, amount: z.string().trim().regex(/^-?\d{1,11}(\.\d{1,2})?$/, 'INVALID_AMOUNT'), reason: zText(500) });
/** Adjustments are new signed ledger rows with actor and reason. Existing rows are never edited. */
export async function adjustCommission(ctx: Ctx, input: z.infer<typeof adjustmentSchema>): Promise<void> {
  requirePerm(ctx, 'commission.adjust');
  if (toPaise(input.amount) === 0n) throw new AppError('VALIDATION', undefined, { amount: 'INVALID_AMOUNT' });
  await withCtx(ctx, async (tx) => {
    const entry = await tx.one<Rec>('select *, rate_percent::text as rate from commission_ledger where id = $1', [input.entryId]);
    const row = await tx.one<{ id: string }>(
      `insert into commission_ledger (entry_type, order_id, company_id, collection_id, related_entry_id, eligible_amount, rate_percent, policy_id, amount, reason, created_by)
       values ('ADJUSTMENT', $1, $2, $3, $4, 0, $5, $6, $7, $8, $9) returning id`,
      [entry.order_id, entry.company_id, entry.collection_id, entry.id, entry.rate, entry.policy_id, input.amount, input.reason, ctx.userId]);
    await audit(tx, ctx, 'commission.adjust', 'commission_ledger', row.id, { relatedEntry: entry.entry_number, amount: input.amount, reason: input.reason }, entry.company_id);
    await notifyCompany(tx, entry.company_id, 'COMMISSION_ADJUSTED', { number: entry.entry_number, amount: input.amount }, '/partner/commissions');
  });
}

export const policySchema = z.object({ ratePercent: zNumber(0, 100), description: zText(500), effectiveFrom: zDate });
/** New commission policy version. Prospective only: existing orders keep the rate frozen when they were created. */
export async function publishCommissionPolicy(ctx: Ctx, input: z.infer<typeof policySchema>): Promise<void> {
  requirePerm(ctx, 'commission.policy');
  await withCtx(ctx, async (tx) => {
    const next = (await tx.one<{ v: number }>('select coalesce(max(version), 0) + 1 as v from commission_policies')).v;
    await tx.exec('update commission_policies set is_active = false where is_active');
    await tx.exec('insert into commission_policies (version, rate_percent, description, effective_from, is_active, created_by) values ($1,$2,$3,$4,true,$5)',
      [next, input.ratePercent.toFixed(4), input.description, input.effectiveFrom, ctx.userId]);
    await audit(tx, ctx, 'commission.policy_publish', 'commission_policy', null, { version: next, rate: input.ratePercent });
  });
}
