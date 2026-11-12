// Integration tests against a real PostgreSQL database (TEST_DATABASE_URL - wiped on every run).
// They call the same services the screens and the API call, under the same row-level security,
// and cover the minimum list in specification section 18.
import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv, migrate } from '../scripts/migrate';
import { DEMO_PDF, DEMO_PNG, leadInput, quotationDraft, quoteLead, seedPartner, seedStaff, surveyLead, type Staff } from '../scripts/seed';
import { ensureUserForPhone } from '@/server/authcore';
import { loadCtx, type Ctx } from '@/server/ctx';
import { closePool, withCtx, withSystem } from '@/server/db';
import { getCustomerLead } from '@/server/services/customer';
import { giveFinanceConsent, saveLender, updateReferral, withdrawFinanceConsent } from '@/server/services/finance';
import { createLead, getLead, markContacted, setLeadException } from '@/server/services/leads';
import { scheduleSurvey } from '@/server/services/surveys';
import { invitePartners, listInvitations, runMatching } from '@/server/services/matching';
import { adjustCommission, createInvoice, handleReconciliationWebhook, listCollections, reconcileCollection, recordRefund, submitCollection } from '@/server/services/money';
import { confirmOrder, getOrder, respondOrder, updateOrderTerms } from '@/server/services/orders';
import { addTeamMember, runExpirySweep } from '@/server/services/partners';
import { addComplianceDocument, assignTeamMember, changeProjectStatus, createTask, updateReadiness } from '@/server/services/projects';
import { reviewComplianceDocument } from '@/server/services/quality';
import { customerAction, getComparison, getQuotation, releaseToCustomer, saveQuotation, startRevision } from '@/server/services/quotations';
import { syncEvents } from '@/server/services/tech';

loadEnv();
const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://aiec:aiec@localhost:5432/aiec_test';
process.env.DATABASE_URL = TEST_DB;

type Partner = { companyId: string; ctx: Ctx };
let s: Staff;
let A: Partner; let B: Partner; let C: Partner; let D: Partner; let E: Partner;
let wakad: string;
let phoneSeq = 100;
const nextPhone = () => `+9191000${String(++phoneSeq).padStart(5, '0')}`;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const code = (p: Promise<unknown>) => p.then(() => 'NO_ERROR', (e: { code?: string; message?: string }) => e.code ?? `UNEXPECTED: ${e.message}`);
const sql = <T = Record<string, unknown>>(text: string, params: unknown[] = []) => withSystem((tx) => tx.query<T & Record<string, unknown>>(text, params));
const ctxByPhone = (phone: string) => withSystem(async (tx) => (await loadCtx(tx, (await tx.one<{ id: string }>('select id from users where phone = $1', [phone])).id))!);

async function customerLead(projectName: string, over: Record<string, unknown> = {}) {
  const phone = nextPhone();
  const lead = await createLead(null, leadInput({ name: `Test Customer ${phoneSeq}`, phone, projectName, zoneId: wakad, ...over }));
  const customer = await withSystem(async (tx) => (await loadCtx(tx, await ensureUserForPhone(tx, phone, null)))!);
  return { lead, customer, phone };
}
/** Lead → survey → two quotations → released → customer selects `partner` → order waiting for partner acceptance. */
async function orderFor(partner: Partner, other: Partner, projectName: string, base = '600000') {
  const { lead, customer } = await customerLead(projectName);
  await surveyLead(s, lead.id);
  const quotes = await quoteLead(s, lead.id, [{ ...partner, base }, { ...other, base: '650000' }]);
  await releaseToCustomer(s.ops, lead.id);
  const { orderId } = await customerAction(customer, { leadId: lead.id, action: 'SELECT', quotationId: quotes.get(partner.companyId)! });
  return { leadId: lead.id, customer, orderId: orderId!, quotes };
}
async function supervisorOf(partner: Partner): Promise<string> {
  const existing = await sql<{ user_id: string }>(`select user_id from user_roles where company_id = $1 and role_code = 'PARTNER_SUPERVISOR' and revoked_at is null`, [partner.companyId]);
  if (existing.length) return existing[0].user_id;
  const phone = nextPhone();
  await addTeamMember(partner.ctx, { name: 'Test Supervisor', phone, role: 'PARTNER_SUPERVISOR' });
  return (await ctxByPhone(phone)).userId;
}
async function acceptAndPrepare(partner: Partner, orderId: string, eligibleValue = '600000') {
  await respondOrder(partner.ctx, { id: orderId, decision: 'accept', supervisorUserId: await supervisorOf(partner) });
  await updateOrderTerms(s.ops, { id: orderId, eligibleValue, contractReference: 'TEST-CONTRACT', contractAcceptedOn: day(-1), approvalPathNote: 'Partner applies for erection permission.' }, DEMO_PDF);
}
async function projectFor(partner: Partner, other: Partner, projectName: string) {
  const o = await orderFor(partner, other, projectName);
  await acceptAndPrepare(partner, o.orderId);
  const projectId = await confirmOrder(s.ops, o.orderId);
  const milestones = await sql<{ id: string; amount_due: string }>('select id, amount_due::text from project_milestones where project_id = $1 order by seq', [projectId]);
  return { ...o, projectId, milestones };
}
async function startWork(partner: Partner, projectId: string) {
  for (const docType of ['ERECTION_PERMISSION', 'APPROVED_DRAWINGS'] as const) {
    await addComplianceDocument(partner.ctx, { projectId, docType, authority: 'Test authority', referenceNumber: `T-${docType}`, issueDate: day(-1) }, DEMO_PDF);
  }
  for (const d of await sql<{ id: string }>('select id from compliance_documents where project_id = $1', [projectId])) await reviewComplianceDocument(s.qc, { id: d.id, decision: 'approve' });
  await updateReadiness(s.ops, { id: projectId, siteReady: true, permissionsConfirmed: true, plannedStart: day(0), plannedEnd: day(90) });
  await changeProjectStatus(partner.ctx, { id: projectId, to: 'IN_PROGRESS' });
}
const collect = (partner: Partner, projectId: string, milestoneId: string, amount: string, over: Record<string, unknown> = {}) =>
  submitCollection(partner.ctx, { projectId, milestoneId, amountReceived: amount, excludedAmount: '0', collectionDate: day(-1), paymentMode: 'BANK_TRANSFER',
    bankReference: `UTR-${randomUUID().slice(0, 8)}`, partnerReceiptNo: `R-${randomUUID().slice(0, 6)}`, evidenceKind: 'BANK_PROOF', ...over } as Parameters<typeof submitCollection>[1], DEMO_PDF);
const ledger = (collectionId: string) => sql<{ entry_type: string; amount: string; status: string }>(
  `select entry_type, amount::text, status from commission_ledger where collection_id = $1 and entry_type <> 'ADJUSTMENT' order by created_at`, [collectionId]);

beforeAll(async () => {
  await migrate(TEST_DB, { reset: true, quiet: true });
  s = await seedStaff();
  await withSystem((tx) => tx.exec(`update zones set is_active = true, activated_at = now() where code in ('PUNE','PCMC','WAKAD','BANER','HINJAWADI')`));
  wakad = (await sql<{ id: string }>(`select id from zones where code = 'WAKAD'`))[0].id;
  const zones = ['PUNE', 'PCMC', 'WAKAD', 'BANER'];
  A = await seedPartner(s.admin, { legalName: 'Test Lifts A', adminName: 'Admin A', adminPhone: '+919100000011', pan: 'AAACA1111A', zones, maxProjects: 3 });
  B = await seedPartner(s.admin, { legalName: 'Test Lifts B', adminName: 'Admin B', adminPhone: '+919100000012', pan: 'AAACB2222B', zones, maxProjects: 2 });
  C = await seedPartner(s.admin, { legalName: 'Test Lifts C (not verified)', adminName: 'Admin C', adminPhone: '+919100000013', pan: 'AAACC3333C', zones, maxProjects: 2, activate: false });
  D = await seedPartner(s.admin, { legalName: 'Test Lifts D', adminName: 'Admin D', adminPhone: '+919100000014', pan: 'AAACD4444D', zones, maxProjects: 10 });
  E = await seedPartner(s.admin, { legalName: 'Test Lifts E (licence will expire)', adminName: 'Admin E', adminPhone: '+919100000015', pan: 'AAACE5555E', zones: ['HINJAWADI'], maxProjects: 2 });
});
afterAll(async () => { await closePool(); });

describe('full lifecycle and commission (spec 5, 7)', () => {
  let p: Awaited<ReturnType<typeof projectFor>>;
  let collectionId: string;

  it('takes a public enquiry to a confirmed project with frozen payment milestones', async () => {
    p = await projectFor(A, B, 'Lifecycle Towers');
    expect((await getLead(s.ops, p.leadId)).lead.status).toBe('CONFIRMED');
    expect(p.milestones.map((m) => m.amount_due)).toEqual(['60000.00', '180000.00', '180000.00', '150000.00', '30000.00']);
    const quotes = await sql<{ status: string }>('select status from quotations where lead_id = $1 order by status', [p.leadId]);
    expect(quotes.map((q) => q.status)).toEqual(['NOT_SELECTED', 'SELECTED']);
  });
  it('creates no commission until the collection is verified, then exactly 2% once', async () => {
    collectionId = await collect(A, p.projectId, p.milestones[0].id, '60000');
    expect(await ledger(collectionId)).toEqual([]);
    await reconcileCollection(s.ops, { id: collectionId, decision: 'verify', note: 'Matched' });
    expect(await ledger(collectionId)).toEqual([{ entry_type: 'COMMISSION', amount: '1200.00', status: 'VERIFIED' }]);
    expect(await code(reconcileCollection(s.ops, { id: collectionId, decision: 'verify', note: 'Again' }))).not.toBe('NO_ERROR');
    expect(await ledger(collectionId)).toHaveLength(1);
  });
  it('charges commission only on the eligible part of a collection', async () => {
    const id = await collect(A, p.projectId, p.milestones[1].id, '180000', { excludedAmount: '30000', exclusionNote: 'Civil work billed with this milestone' });
    await reconcileCollection(s.ops, { id, decision: 'verify', note: 'Civil work of 30,000 excluded' });
    expect((await ledger(id))[0].amount).toBe('3000.00');
  });
  it('gives no commission for a rejected collection', async () => {
    const id = await collect(A, p.projectId, p.milestones[2].id, '180000');
    await reconcileCollection(s.ops, { id, decision: 'reject', note: 'No matching bank credit' });
    expect(await ledger(id)).toEqual([]);
  });
  it('invoices verified commission with GST and keeps the ledger append-only', async () => {
    const invoiceId = await createInvoice(s.admin, A.companyId);
    const [invoice] = await sql<{ subtotal: string; total: string }>('select subtotal::text, total::text from commission_invoices where id = $1', [invoiceId]);
    expect(invoice).toEqual({ subtotal: '4200.00', total: '4956.00' }); // (1,200 + 3,000) + 18% GST
    expect(await code(createInvoice(s.admin, A.companyId))).toBe('NOTHING_TO_INVOICE');
    await expect(sql(`update commission_ledger set amount = 1 where collection_id = $1`, [collectionId])).rejects.toThrow();
    await expect(sql(`delete from commission_ledger where collection_id = $1`, [collectionId])).rejects.toThrow();
  });
  it('records adjustments as new entries with a reason', async () => {
    const [entry] = await sql<{ id: string }>(`select id from commission_ledger where collection_id = $1`, [collectionId]);
    await adjustCommission(s.admin, { entryId: entry.id, amount: '-200.00', reason: 'Agreed goodwill adjustment' });
    const rows = await sql<{ entry_type: string; amount: string }>(`select entry_type, amount::text from commission_ledger where related_entry_id = $1`, [entry.id]);
    expect(rows).toEqual([{ entry_type: 'ADJUSTMENT', amount: '-200.00' }]);
    expect(await code(adjustCommission(s.ops, { entryId: entry.id, amount: '-1.00', reason: 'Not allowed' }))).toBe('FORBIDDEN');
  });
  it('reverses commission in proportion when a verified collection is refunded', async () => {
    await recordRefund(s.ops, { id: collectionId, amount: '15000', reason: 'Customer refund for scope reduction' });
    const rows = await ledger(collectionId);
    expect(rows.map((r) => [r.entry_type, r.amount])).toEqual([['COMMISSION', '1200.00'], ['REFUND_REVERSAL', '-300.00']]);
    expect((await sql<{ refunded: string; status: string }>('select refunded_amount::text as refunded, status from partner_collections where id = $1', [collectionId]))[0]).toEqual({ refunded: '15000.00', status: 'REFUNDED' });
    expect(await code(recordRefund(s.ops, { id: collectionId, amount: '50000', reason: 'More than received' }))).toBe('AMOUNT_EXCEEDS');
  });
  it('verifies a collection from a signed bank webhook exactly once', async () => {
    const id = await collect(A, p.projectId, p.milestones[3].id, '150000', { bankReference: 'UTR-WEBHOOK-1' });
    const body = JSON.stringify({ eventId: 'evt-1', companyId: A.companyId, bankReference: 'UTR-WEBHOOK-1', amount: '150000' });
    const signature = createHmac('sha256', process.env.RECONCILIATION_WEBHOOK_SECRET!).update(body).digest('hex');
    expect(await code(handleReconciliationWebhook(body, 'bad-signature'))).toBe('FORBIDDEN');
    expect(await handleReconciliationWebhook(body, signature)).toEqual({ status: 'processed' });
    expect(await handleReconciliationWebhook(body, signature)).toEqual({ status: 'duplicate' });
    expect(await ledger(id)).toEqual([{ entry_type: 'COMMISSION', amount: '3000.00', status: 'VERIFIED' }]);
  });
});

describe('roles and tenant isolation (spec 4, 12)', () => {
  let p: Awaited<ReturnType<typeof projectFor>>;
  let collectionId: string;
  beforeAll(async () => {
    p = await projectFor(A, B, 'Isolation Heights');
    collectionId = await collect(A, p.projectId, p.milestones[0].id, '60000');
  });

  it('enforces role boundaries in the services', async () => {
    expect(await code(reconcileCollection(s.sales, { id: collectionId, decision: 'verify', note: 'x' }))).toBe('FORBIDDEN');
    expect(await code(reconcileCollection(A.ctx, { id: collectionId, decision: 'verify', note: 'self-verify' }))).toBe('FORBIDDEN');
    expect(await code(confirmOrder(A.ctx, p.orderId))).toBe('FORBIDDEN');
    expect(await code(runMatching(p.customer, p.leadId))).toBe('FORBIDDEN');
    expect(await code(createInvoice(s.ops, A.companyId))).toBe('FORBIDDEN');
    expect(await code(runMatching(s.surveyor, p.leadId))).toBe('FORBIDDEN');
  });
  it('hides one partner’s orders, projects, collections and ledger from another partner', async () => {
    expect(await code(getOrder(D.ctx, p.orderId))).toBe('NOT_FOUND');
    expect((await listCollections(D.ctx, {})).rows).toHaveLength(0);
    const seen = await withCtx(D.ctx, async (tx) => ({
      orders: (await tx.query('select id from orders')).length, projects: (await tx.query('select id from projects')).length,
      collections: (await tx.query('select id from partner_collections')).length, ledger: (await tx.query('select id from commission_ledger')).length,
      otherCompanies: (await tx.query('select id from company_licenses where company_id <> $1', [D.companyId])).length,
    }));
    expect(seen).toEqual({ orders: 0, projects: 0, collections: 0, ledger: 0, otherCompanies: 0 });
  });
  it('blocks cross-tenant writes at the database even when a query is hand-written', async () => {
    const changed = await withCtx(D.ctx, (tx) => tx.exec(`update partner_collections set amount_received = 1 where id = $1`, [collectionId]));
    expect(changed).toBe(0);
    await expect(withCtx(D.ctx, (tx) => tx.exec(
      `insert into project_tasks (project_id, company_id, title, assigned_to, created_by) values ($1, $2, 'x', $3, $3)`, [p.projectId, A.companyId, D.ctx.userId]))).rejects.toThrow();
  });
  it('shows a customer only their own enquiries', async () => {
    const other = await customerLead('Someone Else Residency');
    expect(await code(getCustomerLead(other.customer, p.leadId))).toBe('NOT_FOUND');
    expect(await code(customerAction(other.customer, { leadId: p.leadId, action: 'HOLD', note: 'not mine' }))).not.toBe('NO_ERROR');
    const leads = await withCtx(other.customer, (tx) => tx.query('select id from leads'));
    expect(leads).toHaveLength(1);
  });
  it('shows a partner only the leads it was invited to, and no customer records otherwise', async () => {
    const fresh = await customerLead('Uninvited Plaza');
    const visible = await withCtx(B.ctx, (tx) => tx.query('select id from leads where id = $1', [fresh.lead.id]));
    expect(visible).toHaveLength(0);
    const customers = await withCtx(D.ctx, (tx) => tx.query('select id from customers'));
    expect(customers).toHaveLength(0);
  });
  it('keeps finance referrals away from partners and non-finance staff', async () => {
    const referralId = await giveFinanceConsent(p.customer, { leadId: p.leadId, approxAmount: '300000', contactPreference: 'PHONE', consent: true });
    for (const ctx of [A.ctx, s.sales, s.surveyor]) {
      expect(await withCtx(ctx, (tx) => tx.query('select id from finance_referrals where id = $1', [referralId]))).toHaveLength(0);
    }
    expect(await withCtx(s.finance, (tx) => tx.query('select id from finance_referrals where id = $1', [referralId]))).toHaveLength(1);
    await withdrawFinanceConsent(p.customer, referralId);
  });
});

describe('leads, matching and quotations (spec 5.3 – 5.8)', () => {
  it('flags a likely duplicate for review without merging anything', async () => {
    const first = await customerLead('Sunrise Enclave C-Wing');
    const second = await createLead(null, leadInput({ name: 'Same Person', phone: first.phone, projectName: 'Sunrise Enclave C Wing', zoneId: wakad, address: 'Sunrise Enclave C-Wing, Pune' }));
    expect(second.duplicates).toBeGreaterThan(0);
    expect(second.id).not.toBe(first.lead.id);
    const candidates = await sql<{ status: string; score: number }>('select status, score from lead_duplicate_candidates where lead_id = $1', [second.id]);
    expect(candidates[0].status).toBe('OPEN');
    expect(Number(candidates[0].score)).toBeGreaterThanOrEqual(50);
    expect((await sql('select id from leads where id = any($1::uuid[])', [[first.lead.id, second.id]]))).toHaveLength(2);
  });
  it('rejects an enquiry without contact and privacy consent', async () => {
    expect(await code(createLead(null, leadInput({ name: 'No Consent', phone: nextPhone(), projectName: 'X', zoneId: wakad, consentPrivacy: false })))).toBe('VALIDATION');
  });
  it('only moves a lead along the defined state machine', async () => {
    const { lead } = await customerLead('State Machine Villa');
    expect(await code(runMatching(s.ops, lead.id))).toBe('INVALID_TRANSITION');
    await markContacted(s.ops, lead.id, 'Called');
    await markContacted(s.ops, lead.id, 'Called again'); // repeating the same step is a no-op, not a second event
    expect(await sql(`select 1 from lead_events where lead_id = $1 and to_status = 'CONTACTED'`, [lead.id])).toHaveLength(1);
    expect(await code(scheduleSurvey(s.ops, { leadId: lead.id, surveyorId: s.surveyor.userId, scheduledAt: `${day(1)}T11:00` }))).toBe('LEAD_NOT_QUALIFIED');
    expect(await code(setLeadException(s.ops, lead.id, 'LOST', ''))).toBe('REASON_REQUIRED');
    expect(await code(releaseToCustomer(s.ops, lead.id))).not.toBe('NO_ERROR');
  });
  it('applies the hard eligibility gates with reasons and refuses to invite an ineligible partner', async () => {
    const { lead } = await customerLead('Eligibility Arcade');
    await surveyLead(s, lead.id);
    await runMatching(s.ops, lead.id);
    const matches = await sql<{ company_id: string; eligible: boolean; ineligibility_reasons: string[]; score: string | null }>(
      'select company_id, eligible, ineligibility_reasons, score::text from partner_matches where lead_id = $1', [lead.id]);
    const of = (x: Partner) => matches.find((m) => m.company_id === x.companyId)!;
    expect(of(A).eligible).toBe(true);
    expect(Number(of(A).score)).toBeGreaterThan(0);
    expect(of(C).eligible).toBe(false);
    expect(of(C).ineligibility_reasons).toEqual(expect.arrayContaining(['PARTNER_NOT_ACTIVE', 'LICENCE_INVALID']));
    expect(of(E).ineligibility_reasons).toContain('OUT_OF_AREA');
    expect(await code(invitePartners(s.ops, lead.id, [C.companyId]))).toBe('PARTNER_NOT_ELIGIBLE');
    expect(await listInvitations(C.ctx)).toHaveLength(0);
  });
  it('keeps every submitted quotation version immutable and numbers revisions', async () => {
    const { lead } = await customerLead('Versioning Court');
    await surveyLead(s, lead.id);
    const quotes = await quoteLead(s, lead.id, [{ ...A, base: '500000' }, { ...B, base: '520000' }]);
    const id = quotes.get(A.companyId)!;
    await startRevision(A.ctx, id);
    await saveQuotation(A.ctx, quotationDraft(id, '480000'), DEMO_PDF);
    const versions = await sql<{ id: string; version_no: number; base: string; submitted: boolean }>(
      'select id, version_no, base_amount::text as base, submitted_at is not null as submitted from quotation_versions where quotation_id = $1 order by version_no', [id]);
    expect(versions.map((v) => [v.version_no, v.base, v.submitted])).toEqual([[1, '500000.00', true], [2, '480000.00', true]]);
    await expect(sql('update quotation_versions set base_amount = 1 where id = $1', [versions[0].id])).rejects.toThrow();
    expect(await code(getQuotation(B.ctx, id))).toBe('NOT_FOUND');
    expect(await code(saveQuotation(B.ctx, quotationDraft(id, '1'), DEMO_PDF))).not.toBe('NO_ERROR');
  });
  it('lets the customer choose only after release, only once, and only from their own quotations', async () => {
    const { lead, customer } = await customerLead('Selection Square');
    await surveyLead(s, lead.id);
    const quotes = await quoteLead(s, lead.id, [{ ...A, base: '500000' }, { ...B, base: '520000' }]);
    const a = quotes.get(A.companyId)!; const b = quotes.get(B.companyId)!;
    expect(await code(customerAction(customer, { leadId: lead.id, action: 'SELECT', quotationId: a }))).not.toBe('NO_ERROR');
    expect((await getComparison(customer, lead.id)).quotations).toHaveLength(0); // nothing is visible before AIEC releases it
    await releaseToCustomer(s.ops, lead.id);
    const { orderId } = await customerAction(customer, { leadId: lead.id, action: 'SELECT', quotationId: b });
    expect(orderId).toBeTruthy();
    expect(await code(customerAction(customer, { leadId: lead.id, action: 'SELECT', quotationId: a }))).not.toBe('NO_ERROR');
    expect(await sql('select id from orders where lead_id = $1', [lead.id])).toHaveLength(1);
    // The partner declines: the order closes and no project exists.
    await respondOrder(B.ctx, { id: orderId!, decision: 'decline', reason: 'No capacity this month' });
    expect(await code(confirmOrder(s.ops, orderId!))).toBe('INVALID_TRANSITION');
    expect(await sql('select id from projects where order_id = $1', [orderId])).toHaveLength(0);
  });
});

describe('order and project gates (spec 5.9, 9.3)', () => {
  it('cannot confirm an order before partner acceptance or with an incomplete checklist', async () => {
    const o = await orderFor(D, B, 'Gate Residency');
    expect(await code(confirmOrder(s.ops, o.orderId))).toBe('ORDER_NOT_ACCEPTED');
    await respondOrder(D.ctx, { id: o.orderId, decision: 'accept', supervisorUserId: await supervisorOf(D) });
    expect(await code(confirmOrder(s.ops, o.orderId))).toBe('CONTRACT_REQUIRED');
    const gates = (await getOrder(s.ops, o.orderId)).checklist!.gates;
    expect(gates.find((g) => g.key === 'partnerAcceptance')!.ok).toBe(true);
    expect(gates.find((g) => g.key === 'contract')!.ok).toBe(false);
    await sql(`update orders set status = 'CANCELLED' where id = $1`, [o.orderId]);
  });
  it('does not start work without verified documents and site readiness', async () => {
    const p = await projectFor(D, B, 'Readiness Park');
    expect(await code(changeProjectStatus(D.ctx, { id: p.projectId, to: 'IN_PROGRESS' }))).not.toBe('NO_ERROR');
    expect(await code(changeProjectStatus(D.ctx, { id: p.projectId, to: 'HANDED_OVER' }))).not.toBe('NO_ERROR');
    await startWork(D, p.projectId);
    expect((await sql<{ status: string }>('select status from projects where id = $1', [p.projectId]))[0].status).toBe('IN_PROGRESS');
    await sql(`update projects set status = 'CANCELLED' where id = $1`, [p.projectId]);
  });
});

describe('technician offline sync and incidents (spec 9, 10)', () => {
  let p: Awaited<ReturnType<typeof projectFor>>;
  let tech: Ctx;
  beforeAll(async () => {
    p = await projectFor(D, B, 'Field Work Towers');
    await startWork(D, p.projectId);
    const phone = nextPhone();
    await addTeamMember(D.ctx, { name: 'Test Technician', phone, role: 'TECHNICIAN' });
    tech = await ctxByPhone(phone);
    await assignTeamMember(D.ctx, p.projectId, tech.userId);
    await createTask(D.ctx, { projectId: p.projectId, title: 'Fix brackets', assignedTo: tech.userId, dueDate: day(2), safetyCritical: true });
  });

  it('applies queued events once, however many times the device retries', async () => {
    const [task] = await sql<{ id: string }>('select id from project_tasks where project_id = $1', [p.projectId]);
    const capturedAt = new Date(Date.now() - 3_600_000).toISOString();
    const events = [
      { clientEventId: randomUUID(), capturedAt, type: 'ATTENDANCE', projectId: p.projectId, kind: 'CHECK_IN', latitude: 18.59, longitude: 73.78, accuracyM: 20 },
      { clientEventId: randomUUID(), capturedAt, type: 'CHECKLIST', projectId: p.projectId, ppeOk: true, barricadeOk: true, powerIsolatedOk: true, toolsOk: true, pitShaftSafeOk: true },
      { clientEventId: randomUUID(), capturedAt, type: 'TASK_STATUS', taskId: task.id, to: 'IN_PROGRESS' },
      { clientEventId: randomUUID(), capturedAt, type: 'MATERIAL_USAGE', projectId: p.projectId, taskId: task.id, description: 'Anchor bolts', quantity: 24, unit: 'nos' },
      { clientEventId: randomUUID(), capturedAt, type: 'EVIDENCE', projectId: p.projectId, taskId: task.id, caption: 'Brackets', fileName: 'photo.png', mimeType: 'image/png', dataBase64: DEMO_PNG.bytes.toString('base64') },
    ];
    expect((await syncEvents(tech, events)).map((a) => a.status)).toEqual(['SYNCED', 'SYNCED', 'SYNCED', 'SYNCED', 'SYNCED']);
    expect((await syncEvents(tech, events)).map((a) => a.status)).toEqual(['DUPLICATE', 'DUPLICATE', 'DUPLICATE', 'DUPLICATE', 'DUPLICATE']);
    const [counts] = await sql<Record<string, number>>(
      `select (select count(*) from technician_attendance where project_id = $1) as attendance, (select count(*) from safety_checklists where project_id = $1) as checklists,
              (select count(*) from material_usage where project_id = $1) as usage, (select count(*) from work_evidence where project_id = $1) as evidence`, [p.projectId]);
    expect(counts).toEqual({ attendance: 1, checklists: 1, usage: 1, evidence: 1 });
    const [att] = await sql<{ late: boolean }>('select received_at > captured_at_device as late from technician_attendance where project_id = $1', [p.projectId]);
    expect(att.late).toBe(true);
  });
  it('rejects malformed events and events for projects the technician is not on', async () => {
    const other = await projectFor(A, B, 'Not My Site');
    const acks = await syncEvents(tech, [
      { clientEventId: randomUUID(), capturedAt: new Date().toISOString(), type: 'ATTENDANCE', projectId: other.projectId, kind: 'CHECK_IN' },
      { clientEventId: 'not-a-uuid', type: 'ATTENDANCE' },
    ]);
    expect(acks.map((a) => a.status)).toEqual(['FAILED', 'FAILED']);
    expect(await sql('select id from technician_attendance where project_id = $1', [other.projectId])).toHaveLength(0);
    expect(await code(syncEvents(s.sales, []))).toBe('FORBIDDEN');
    await sql(`update projects set status = 'CANCELLED' where id = $1`, [other.projectId]);
  });
  it('escalates a high-severity hazard immediately, stops work and lets only AIEC lift the stop', async () => {
    const id = randomUUID();
    const hazard = { clientEventId: id, capturedAt: new Date().toISOString(), type: 'HAZARD', projectId: p.projectId, severity: 'HIGH', description: 'Open shaft without barricade on floor 3', immediateAction: 'Area cordoned off' };
    expect((await syncEvents(tech, [hazard]))[0].status).toBe('SYNCED');
    expect((await syncEvents(tech, [hazard]))[0].status).toBe('DUPLICATE');
    const incidents = await sql<{ status: string }>('select status from safety_incidents where project_id = $1', [p.projectId]);
    expect(incidents).toEqual([{ status: 'EMERGENCY_ESCALATION' }]);
    expect((await sql<{ status: string }>('select status from projects where id = $1', [p.projectId]))[0].status).toBe('STOP_WORK');
    const notified = await sql(`select 1 from notifications where type = 'INCIDENT_EMERGENCY' and user_id = $1`, [s.qc.userId]);
    expect(notified.length).toBeGreaterThan(0);
    expect(await code(changeProjectStatus(D.ctx, { id: p.projectId, to: 'RESUME' }))).toBe('FORBIDDEN');
    await changeProjectStatus(s.ops, { id: p.projectId, to: 'RESUME', reason: 'Barricade verified' });
    expect((await sql<{ status: string }>('select status from projects where id = $1', [p.projectId]))[0].status).toBe('IN_PROGRESS');
    await sql(`update projects set status = 'CANCELLED' where id = $1`, [p.projectId]);
  });
});

describe('finance referral (spec 8)', () => {
  const lender = (over: Record<string, unknown>) => ({
    legalName: 'Sandbox Lender (test)', lenderType: 'NBFC', regulatoryReference: 'TEST', contactName: 'Test', productCategory: 'Loan', agreementStatus: 'SIGNED',
    agreementStart: day(-5), agreementEnd: day(300), approvedFields: ['customer_name', 'customer_phone', 'approx_amount', 'consent_timestamp'],
    referralChannel: 'Sandbox log', feeModel: 'None', grievanceRoute: 'Desk', integrationStatus: 'SANDBOX', complianceReviewDate: day(100), isActive: true, ...over,
  }) as Parameters<typeof saveLender>[1];

  it('needs explicit consent, shares only approved fields with an approved lender, and never infers approval', async () => {
    const { lead, customer } = await customerLead('Finance Greens', { financeInterest: true });
    expect(await code(giveFinanceConsent(customer, { leadId: lead.id, contactPreference: 'PHONE', consent: false }))).toBe('VALIDATION');
    expect(await sql('select id from finance_referrals where lead_id = $1', [lead.id])).toHaveLength(0);
    const referralId = await giveFinanceConsent(customer, { leadId: lead.id, approxAmount: '250000', contactPreference: 'PHONE', consent: true });
    expect(await code(giveFinanceConsent(customer, { leadId: lead.id, contactPreference: 'PHONE', consent: true }))).toBe('DUPLICATE');

    await saveLender(s.finance, lender({ legalName: 'Unsigned Lender (test)', agreementStatus: 'IN_NEGOTIATION' }));
    await saveLender(s.finance, lender({}));
    const lenders = await sql<{ id: string; agreement_status: string }>('select id, agreement_status from lender_partners');
    const unsigned = lenders.find((l) => l.agreement_status !== 'SIGNED')!.id;
    const signed = lenders.find((l) => l.agreement_status === 'SIGNED')!.id;

    await updateReferral(s.finance, { id: referralId, to: 'READY_TO_REFER' });
    expect(await code(updateReferral(s.finance, { id: referralId, to: 'REFERRED', lenderId: unsigned }))).toBe('LENDER_NOT_APPROVED');
    expect(await code(updateReferral(s.ops, { id: referralId, to: 'REFERRED', lenderId: signed }))).toBe('FORBIDDEN');
    await updateReferral(s.finance, { id: referralId, to: 'REFERRED', lenderId: signed });
    const [handoff] = await sql<{ mode: string; payload: Record<string, unknown> }>('select mode, payload from finance_handoffs where referral_id = $1', [referralId]);
    expect(handoff.mode).toBe('SANDBOX');
    expect(Object.keys(handoff.payload).sort()).toEqual(['approx_amount', 'consent_timestamp', 'customer_name', 'customer_phone']);

    expect(await code(updateReferral(s.finance, { id: referralId, to: 'APPROVED' }))).toBe('STATUS_SOURCE_REQUIRED'); // approval is never inferred
    await updateReferral(s.finance, { id: referralId, to: 'LENDER_CONTACTED', statusSource: 'LENDER' });
    expect(await code(updateReferral(s.finance, { id: referralId, to: 'APPLICATION_IN_PROGRESS' }))).toBe('STATUS_SOURCE_REQUIRED');
    expect(await code(updateReferral(s.finance, { id: referralId, to: 'WITHDRAWN' }))).toBe('FORBIDDEN');
    await withdrawFinanceConsent(customer, referralId);
    const [r] = await sql<{ status: string; withdrawn: boolean }>(
      'select r.status, c.withdrawn_at is not null as withdrawn from finance_referrals r join customer_consents c on c.id = r.consent_id where r.id = $1', [referralId]);
    expect(r).toEqual({ status: 'WITHDRAWN', withdrawn: true });
  });
});

describe('licence expiry (spec 6.4)', () => {
  it('expires a partner whose mandatory licence lapsed and removes it from matching', async () => {
    expect(await runExpirySweep()).toMatchObject({ partnersExpired: 0 });
    await sql(`update company_licenses set expiry_date = current_date - 2, issue_date = current_date - 400 where company_id = $1`, [E.companyId]);
    expect((await runExpirySweep()).partnersExpired).toBe(1);
    expect((await sql<{ status: string }>('select status from companies where id = $1', [E.companyId]))[0].status).toBe('EXPIRED');
    const hinjawadi = (await sql<{ id: string }>(`select id from zones where code = 'HINJAWADI'`))[0].id;
    const { lead } = await customerLead('Expiry Meadows', { zoneId: hinjawadi });
    await surveyLead(s, lead.id);
    await runMatching(s.ops, lead.id);
    const [m] = await sql<{ eligible: boolean; ineligibility_reasons: string[] }>('select eligible, ineligibility_reasons from partner_matches where lead_id = $1 and company_id = $2', [lead.id, E.companyId]);
    expect(m.eligible).toBe(false);
    expect(m.ineligibility_reasons).toEqual(expect.arrayContaining(['LICENCE_INVALID', 'PARTNER_NOT_ACTIVE']));
    expect((await sql(`select 1 from notifications where type = 'PARTNER_LICENCE_EXPIRED'`)).length).toBeGreaterThan(0);
  });
});

describe('pilot capacity (spec 5.9)', () => {
  it('respects each partner limit and never confirms a sixth active project', { timeout: 300_000 }, async () => {
    const active = async (companyId: string | null = null) => (await sql<{ n: number }>('select app.active_project_count($1) as n', [companyId]))[0].n;
    const prepared = async (partner: Partner, other: Partner, name: string) => {
      const o = await orderFor(partner, other, name);
      await acceptAndPrepare(partner, o.orderId);
      return o.orderId;
    };
    // A partner with no free capacity is not even invited, so the orders are prepared first.
    expect(await active(B.companyId)).toBe(0);
    const forB = [await prepared(B, D, 'B one'), await prepared(B, D, 'B two'), await prepared(B, D, 'B three')];
    const need = Math.max(0, 5 - (await active()) - 2);
    const forD: string[] = [];
    for (let i = 0; i < need + 3; i++) forD.push(await prepared(D, A, `Pilot ${i}`));

    await confirmOrder(s.ops, forB[0]);
    await confirmOrder(s.ops, forB[1]);
    expect(await code(confirmOrder(s.ops, forB[2]))).toBe('PARTNER_CAPACITY_FULL');
    const { lead } = await customerLead('After B is full');
    await surveyLead(s, lead.id);
    await runMatching(s.ops, lead.id);
    expect((await sql<{ r: string[] }>('select ineligibility_reasons as r from partner_matches where lead_id = $1 and company_id = $2', [lead.id, B.companyId]))[0].r).toContain('NO_CAPACITY');

    while ((await active()) < 5) await confirmOrder(s.ops, forD.shift()!);
    expect(forD.length).toBeGreaterThanOrEqual(2);
    const [sixth, seventh] = forD;
    expect(await code(confirmOrder(s.ops, sixth))).toBe('CAPACITY_FULL');
    expect((await sql<{ status: string }>('select status from orders where id = $1', [sixth]))[0].status).toBe('PARTNER_ACCEPTED');
    expect(await active()).toBe(5);

    // One slot frees up and two confirmations race for it: exactly one wins.
    const [oldest] = await sql<{ id: string }>(`select id from projects where company_id = $1 and status = 'PLANNING' order by created_at limit 1`, [B.companyId]);
    await sql(`update projects set status = 'CANCELLED' where id = $1`, [oldest.id]);
    const results = await Promise.all([code(confirmOrder(s.ops, sixth)), code(confirmOrder(s.admin, seventh))]);
    expect(results.sort()).toEqual(['CAPACITY_FULL', 'NO_ERROR']);
    expect(await active()).toBe(5);
  });
});
