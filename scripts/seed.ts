// Demo / local seed data. Everything created here is flagged is_demo and uses obviously
// fictional names and phone numbers. It drives real records through the real services, so the
// seeded state is always one the application itself can produce.
// Usage: tsx scripts/seed.ts   (expects a freshly migrated, empty database)
import { loadCtx, type Ctx } from '../src/server/ctx';
import { closePool, withSystem } from '../src/server/db';
import { createLead, markContacted, qualifyLead, type LeadInput } from '../src/server/services/leads';
import {
  addInsurance, addLicence, addTeamMember, changePartnerStatus, registerCompany, reviewPartnerDocument, setCapability, setServiceAreas,
  submitForReview, updateGovernance, verifyCapability,
} from '../src/server/services/partners';
import { addSurveyEvidence, reviewSurvey, saveSurvey, scheduleSurvey } from '../src/server/services/surveys';
import { invitePartners, listInvitations, respondInvitation, runMatching } from '../src/server/services/matching';
import { customerAction, releaseToCustomer, saveQuotation, type QuotationDraft } from '../src/server/services/quotations';
import { confirmOrder, respondOrder, updateOrderTerms } from '../src/server/services/orders';
import { addComplianceDocument, changeProjectStatus, createTask, updateMilestone, updateReadiness } from '../src/server/services/projects';
import { createInvoice, reconcileCollection, submitCollection } from '../src/server/services/money';
import { reviewComplianceDocument } from '../src/server/services/quality';
import { giveFinanceConsent, saveLender } from '../src/server/services/finance';
import { createTicket } from '../src/server/services/service';
import { isoDateIST } from '../src/lib/format';
import { loadEnv } from './migrate';

export const DEMO_PDF = { name: 'demo-document.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4\n% AIEC demo placeholder document\n%%EOF\n') };
export const DEMO_PNG = {
  name: 'demo-photo.png', type: 'image/png',
  bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
};

function daysFromNow(days: number): string {
  return isoDateIST(new Date(Date.now() + days * 86_400_000));
}

async function staff(name: string, phone: string, role: string, zoneCodes: string[] = []): Promise<Ctx> {
  return withSystem(async (tx) => {
    const user = await tx.one<{ id: string }>('insert into users (phone, full_name, is_demo) values ($1, $2, true) returning id', [phone, name]);
    await tx.exec('insert into user_roles (user_id, role_code) values ($1, $2)', [user.id, role]);
    if (zoneCodes.length) await tx.exec('insert into user_zones (user_id, zone_id) select $1, id from zones where code = any($2)', [user.id, zoneCodes]);
    return (await loadCtx(tx, user.id))!;
  });
}
async function ctxByPhone(phone: string): Promise<Ctx> {
  return withSystem(async (tx) => {
    const user = await tx.one<{ id: string }>('update users set is_demo = true where phone = $1 returning id', [phone]);
    return (await loadCtx(tx, user.id))!;
  });
}
async function zoneId(code: string): Promise<string> {
  return withSystem(async (tx) => (await tx.one<{ id: string }>('select id from zones where code = $1', [code])).id);
}

export interface PartnerSpec { legalName: string; adminName: string; adminPhone: string; pan: string; zones: string[]; maxProjects: number; licenceExpiryDays?: number; activate?: boolean }

/** Registers a partner and takes it through document review to ACTIVE (unless activate === false). */
export async function seedPartner(admin: Ctx, spec: PartnerSpec): Promise<{ companyId: string; ctx: Ctx }> {
  const companyId = await registerCompany(admin, {
    legalName: spec.legalName, category: 'ELEVATOR_COMPANY', entityType: 'PRIVATE_LIMITED', pan: spec.pan, address: 'Demo address, Pune 411001', city: 'Pune',
    signatoryName: spec.adminName, contactPhone: spec.adminPhone,
  }, { phone: spec.adminPhone, name: spec.adminName });
  await withSystem((tx) => tx.exec('update companies set is_demo = true where id = $1', [companyId]));
  const ctx = await ctxByPhone(spec.adminPhone);
  const expiry = daysFromNow(spec.licenceExpiryDays ?? 400);
  await addLicence(ctx, { licenseType: 'LIFT_CONTRACTOR', licenseNumber: `DEMO-LIC-${spec.pan.slice(5, 9)}`, authority: 'Demo licensing authority', state: 'Maharashtra', issueDate: daysFromNow(-700), expiryDate: expiry }, DEMO_PDF);
  await addInsurance(ctx, { policyType: 'PUBLIC_LIABILITY', insurer: 'Demo Insurance Co.', policyNumber: `DEMO-POL-${spec.pan.slice(5, 9)}`, coverAmount: '5000000', issueDate: daysFromNow(-100), expiryDate: daysFromNow(265) }, DEMO_PDF);
  await setCapability(ctx, { liftCategory: 'PASSENGER_RESIDENTIAL', maxFloors: 12 });
  await setCapability(ctx, { liftCategory: 'HOME_LIFT', maxFloors: 4 });
  const zones = await withSystem((tx) => tx.query<{ id: string }>('select id from zones where code = any($1)', [spec.zones]));
  await setServiceAreas(ctx, zones.map((z) => z.id), spec.maxProjects);
  await submitForReview(ctx);
  if (spec.activate === false) return { companyId, ctx };
  await changePartnerStatus(admin, { id: companyId, to: 'UNDER_REVIEW' });
  const docs = await withSystem(async (tx) => ({
    licences: await tx.query<{ id: string }>('select id from company_licenses where company_id = $1', [companyId]),
    insurance: await tx.query<{ id: string }>('select id from company_insurance_policies where company_id = $1', [companyId]),
  }));
  for (const l of docs.licences) await reviewPartnerDocument(admin, { kind: 'licence', id: l.id, approve: 'yes' });
  for (const i of docs.insurance) await reviewPartnerDocument(admin, { kind: 'insurance', id: i.id, approve: 'yes' });
  await verifyCapability(admin, companyId, 'PASSENGER_RESIDENTIAL', true);
  await verifyCapability(admin, companyId, 'HOME_LIFT', true);
  await changePartnerStatus(admin, { id: companyId, to: 'VERIFIED' });
  await updateGovernance(admin, { id: companyId, agreementSignedOn: daysFromNow(-10), agreementReference: 'DEMO-PNA-001', grade: 'UNGRADED', safetyBlock: 'no' });
  await changePartnerStatus(admin, { id: companyId, to: 'ACTIVE' });
  return { companyId, ctx: await ctxByPhone(spec.adminPhone) };
}

export function leadInput(over: Partial<LeadInput> & Pick<LeadInput, 'name' | 'phone' | 'projectName' | 'zoneId'>): LeadInput {
  return {
    customerType: 'HOUSING_SOCIETY', address: `${over.projectName}, Pune`, buildingType: 'RESIDENTIAL_APARTMENT', floors: 5, liftCategory: 'PASSENGER_RESIDENTIAL',
    liftCount: 1, timeline: 'ONE_TO_THREE_MONTHS', siteReadiness: 'SHAFT_READY', financeInterest: false, consentContact: true, consentPrivacy: true, ...over,
  };
}

export function quotationDraft(id: string, base: string, over: Partial<QuotationDraft> = {}): QuotationDraft {
  return {
    id, manufacturer: 'Demo OEM', model: 'DX-8', capacityKg: 544, persons: 8, speedMps: 1, floors: 5, stops: 5, doorType: 'Automatic centre-opening, stainless steel',
    controller: 'Microprocessor based', drive: 'VVVF gearless', safetyFeatures: 'ARD, overload device, door sensor, emergency alarm, intercom',
    supplyScope: 'Complete lift equipment as per specification', installationScope: 'Installation, testing and commissioning',
    civilElectricalInclusions: 'None', exclusions: 'Civil work, scaffolding, 3-phase power supply, statutory fees', baseAmount: base, freightAmount: '0', taxAmount: '0',
    warrantyMonths: 12, amcTerms: 'Free service during warranty; AMC quoted separately', deliveryWeeks: 8, installationWeeks: 4, validityDate: daysFromNow(45),
    assumptions: 'Shaft dimensions as per survey; plumb and clear', approvalsDependencies: 'Erection permission and working licence from the competent authority',
    milestoneName: ['Advance', 'Drawings and production', 'Material delivery', 'Installation and QC', 'Handover'], milestonePercent: ['10', '30', '30', '25', '5'],
    submit: '1', ...over,
  };
}

export interface Staff { admin: Ctx; ops: Ctx; city: Ctx; sales: Ctx; surveyor: Ctx; finance: Ctx; qc: Ctx }
export async function seedStaff(): Promise<Staff> {
  return {
    admin: await staff('Asha Kulkarni (Demo Owner)', '+919000000001', 'SUPER_ADMIN'),
    ops: await staff('Rohit Deshmukh (Demo Ops)', '+919000000002', 'OPS_MANAGER'),
    city: await staff('Meera Joshi (Demo City Manager)', '+919000000003', 'CITY_MANAGER', ['PCMC', 'WAKAD', 'HINJAWADI']),
    sales: await staff('Imran Shaikh (Demo Sales)', '+919000000004', 'SALES_EXEC'),
    surveyor: await staff('Ganesh Pawar (Demo Surveyor)', '+919000000005', 'SURVEYOR'),
    finance: await staff('Neha Gokhale (Demo Finance Coordinator)', '+919000000006', 'FINANCE_COORD'),
    qc: await staff('Vikram Bhosale (Demo QC)', '+919000000007', 'QC_COORD'),
  };
}

/** Takes a NEW lead to SURVEY_COMPLETED using the staff workflow. */
export async function surveyLead(s: Staff, leadId: string, floors = 5): Promise<void> {
  await markContacted(s.ops, leadId, 'Spoke to the customer and confirmed the requirement');
  await qualifyLead(s.ops, { id: leadId, genuine: true, decisionMaker: true, scopeClear: true, surveyFeasible: true, contactConsent: true, note: 'Qualified' });
  const surveyId = await scheduleSurvey(s.ops, { leadId, surveyorId: s.surveyor.userId, scheduledAt: `${daysFromNow(1)}T11:00` });
  await addSurveyEvidence(s.surveyor, surveyId, DEMO_PNG, 'Shaft from ground floor', new Date().toISOString());
  await saveSurvey(s.surveyor, {
    id: surveyId, latitude: 18.5975, longitude: 73.7898, accuracyM: 12, floors, stops: floors, shaftWidthMm: 1900, shaftDepthMm: 1800, pitDepthMm: 1500, overheadMm: 4500,
    landingDetails: 'Clear landing on every floor', machineRoom: false, powerSupply: '3-phase, 415V available', civilReadiness: 'Shaft plastered and ready',
    accessNotes: 'Material movement through front gate', drawingsRef: 'DEMO-DRW-01', customerAckName: 'Site representative', notes: 'No obstructions', submit: '1',
  });
  await reviewSurvey(s.ops, { id: surveyId, decision: 'approve', note: 'Complete' });
}

/** Matching → invitations → submitted quotations. Returns quotation ids by company id. */
export async function quoteLead(s: Staff, leadId: string, partners: Array<{ companyId: string; ctx: Ctx; base: string }>): Promise<Map<string, string>> {
  await runMatching(s.ops, leadId);
  await invitePartners(s.ops, leadId, partners.map((p) => p.companyId));
  const out = new Map<string, string>();
  for (const p of partners) {
    const invitation = (await listInvitations(p.ctx)).find((i) => i.status === 'INVITED')!;
    const quotationId = (await respondInvitation(p.ctx, { id: invitation.id, decision: 'accept' }))!;
    await saveQuotation(p.ctx, quotationDraft(quotationId, p.base), DEMO_PDF);
    out.set(p.companyId, quotationId);
  }
  return out;
}

export async function seedDemo(): Promise<void> {
  const s = await seedStaff();
  const { admin, ops } = s;

  const a = await seedPartner(admin, { legalName: 'Sahyadri Lifts Pvt Ltd (Demo)', adminName: 'Sanjay More (Demo Partner A)', adminPhone: '+919000000011', pan: 'AAACS1111A', zones: ['PUNE', 'PCMC', 'WAKAD', 'BANER'], maxProjects: 3 });
  const b = await seedPartner(admin, { legalName: 'Deccan Elevators LLP (Demo)', adminName: 'Priya Nair (Demo Partner B)', adminPhone: '+919000000012', pan: 'AAACD2222B', zones: ['PUNE', 'WAKAD', 'HINJAWADI', 'BANER'], maxProjects: 2 });
  await seedPartner(admin, { legalName: 'Mula Mutha Elevators (Demo)', adminName: 'Kiran Jadhav (Demo Partner C)', adminPhone: '+919000000013', pan: 'AAACM3333C', zones: ['PUNE', 'CHAKAN'], maxProjects: 1, activate: false });
  await addTeamMember(a.ctx, { name: 'Sunil Gaikwad (Demo Supervisor)', phone: '+919000000021', role: 'PARTNER_SUPERVISOR' });
  await addTeamMember(a.ctx, { name: 'Akash Shinde (Demo Technician)', phone: '+919000000022', role: 'TECHNICIAN' });
  const supervisor = await ctxByPhone('+919000000021');
  const technician = await ctxByPhone('+919000000022');

  // Supplier (catalogue / supply only) - not a lift contractor, never eligible for regulated work.
  const supplierId = await registerCompany(admin, { legalName: 'Bhima Components (Demo Supplier)', category: 'SUPPLIER', entityType: 'PARTNERSHIP', pan: 'AAACB4444D', address: 'Demo MIDC, Chakan', city: 'Pune', signatoryName: 'Demo Supplier' },
    { phone: '+919000000014', name: 'Farhan Khan (Demo Supplier)' });
  await withSystem(async (tx) => {
    await tx.exec(`update companies set is_demo = true, status = 'ACTIVE', agreement_signed_on = current_date where id = $1`, [supplierId]);
    await tx.exec(`insert into products (company_id, name, model, category, specification) values ($1, 'Landing door set', 'LD-700', 'Doors', '700 mm clear opening, stainless steel hairline finish')`, [supplierId]);
    await tx.exec(`update zones set is_active = true, activated_at = now() where code in ('PUNE','PCMC','WAKAD','BANER','HINJAWADI')`);
  });
  await ctxByPhone('+919000000014');

  const wakad = await zoneId('WAKAD');
  const baner = await zoneId('BANER');

  // Lead 1: full lifecycle to a running project with one verified collection and an invoiced commission.
  const lead1 = await createLead(null, leadInput({ name: 'Anita Patil (Demo Customer)', phone: '+919000000031', projectName: 'Shriram Residency A-Wing', zoneId: wakad, financeInterest: true }));
  const customer1 = await withSystem(async (tx) => {
    const { ensureUserForPhone } = await import('../src/server/authcore');
    const id = await ensureUserForPhone(tx, '+919000000031', null);
    await tx.exec('update users set is_demo = true where id = $1', [id]);
    await tx.exec('update customers set is_demo = true where phone = $1', ['+919000000031']);
    return (await loadCtx(tx, id))!;
  });
  await surveyLead(s, lead1.id);
  const q1 = await quoteLead(s, lead1.id, [{ ...a, base: '600000' }, { ...b, base: '645000' }]);
  await releaseToCustomer(ops, lead1.id);
  const { orderId } = await customerAction(customer1, { leadId: lead1.id, action: 'SELECT', quotationId: q1.get(a.companyId)! });
  await respondOrder(a.ctx, { id: orderId!, decision: 'accept', supervisorUserId: supervisor.userId });
  await updateOrderTerms(ops, { id: orderId!, eligibleValue: '600000', contractReference: 'DEMO-CONTRACT-001', contractAcceptedOn: daysFromNow(-2), approvalPathNote: 'Partner to apply for erection permission; working licence before handover.' }, DEMO_PDF);
  const projectId = await confirmOrder(ops, orderId!);
  for (const docType of ['ERECTION_PERMISSION', 'APPROVED_DRAWINGS'] as const) {
    await addComplianceDocument(a.ctx, { projectId, docType, authority: 'Demo authority', referenceNumber: `DEMO-${docType}`, issueDate: daysFromNow(-1) }, DEMO_PDF);
  }
  const docs = await withSystem((tx) => tx.query<{ id: string }>('select id from compliance_documents where project_id = $1', [projectId]));
  for (const d of docs) await reviewComplianceDocument(s.qc, { id: d.id, decision: 'approve' });
  await updateReadiness(a.ctx, { id: projectId, siteReady: true, permissionsConfirmed: false, plannedStart: daysFromNow(0), plannedEnd: daysFromNow(90) });
  await updateReadiness(ops, { id: projectId, siteReady: true, permissionsConfirmed: true, plannedStart: daysFromNow(0), plannedEnd: daysFromNow(90) });
  await changeProjectStatus(a.ctx, { id: projectId, to: 'IN_PROGRESS' });
  await createTask(a.ctx, { projectId, title: 'Fix guide rail brackets, floors 1–3', description: 'Use approved anchor bolts', assignedTo: technician.userId, dueDate: daysFromNow(3), safetyCritical: true });
  await createTask(a.ctx, { projectId, title: 'Unload and store door sets', assignedTo: technician.userId, dueDate: daysFromNow(5), safetyCritical: false });
  const milestones = await withSystem((tx) => tx.query<{ id: string }>('select id from project_milestones where project_id = $1 order by seq', [projectId]));
  await updateMilestone(a.ctx, { id: milestones[0].id, status: 'COMPLETED' });
  await updateMilestone(a.ctx, { id: milestones[1].id, status: 'IN_PROGRESS', dueDate: daysFromNow(20) });
  const collectionId = await submitCollection(a.ctx, { projectId, milestoneId: milestones[0].id, amountReceived: '60000', excludedAmount: '0', collectionDate: daysFromNow(-1), paymentMode: 'BANK_TRANSFER', bankReference: 'DEMO-UTR-0001', partnerReceiptNo: 'DEMO-RCPT-01', evidenceKind: 'BANK_PROOF' }, DEMO_PDF);
  await reconcileCollection(ops, { id: collectionId, decision: 'verify', note: 'Matched with bank reference' });
  await createInvoice(admin, a.companyId);
  await submitCollection(a.ctx, { projectId, milestoneId: milestones[1].id, amountReceived: '180000', excludedAmount: '0', collectionDate: daysFromNow(0), paymentMode: 'UPI', partnerReceiptNo: 'DEMO-RCPT-02', evidenceKind: 'SCREENSHOT' }, DEMO_PNG);
  await giveFinanceConsent(customer1, { leadId: lead1.id, approxAmount: '300000', contactPreference: 'PHONE', consent: true });
  await createTicket(customer1, { projectId, kind: 'COMPLAINT', priority: 'NORMAL', description: 'Please share the installation schedule for next week.' });

  // Lead 2: quotations released, waiting for the customer's decision.
  const lead2 = await createLead(null, leadInput({ name: 'Rahul Mehta (Demo Customer)', phone: '+919000000032', projectName: 'Mehta Bungalow', zoneId: baner, customerType: 'INDIVIDUAL_OWNER', buildingType: 'RESIDENTIAL_BUNGALOW', floors: 3, liftCategory: 'HOME_LIFT' }));
  await withSystem(async (tx) => {
    const { ensureUserForPhone } = await import('../src/server/authcore');
    const id = await ensureUserForPhone(tx, '+919000000032', null);
    await tx.exec('update users set is_demo = true where id = $1', [id]);
    await tx.exec('update customers set is_demo = true where phone = $1', ['+919000000032']);
  });
  await surveyLead(s, lead2.id, 3);
  await quoteLead(s, lead2.id, [{ ...a, base: '480000' }, { ...b, base: '455000' }]);
  await releaseToCustomer(ops, lead2.id);

  // Leads 3–5: early pipeline, including a likely duplicate for review and a complex requirement.
  const lead3 = await createLead(ops, leadInput({ name: 'Green Meadows CHS (Demo)', phone: '+919000000033', projectName: 'Green Meadows CHS B-Wing', zoneId: wakad, floors: 7, source: 'BUILDER_REFERRAL' }));
  await markContacted(ops, lead3.id, 'Committee meeting scheduled');
  await createLead(null, leadInput({ name: 'Anita Patil (Demo Customer)', phone: '+919000000031', projectName: 'Shriram Residency A Wing', zoneId: wakad, address: 'Shriram Residency A-Wing, Pune' }));
  await createLead(null, leadInput({ name: 'City Care Hospital (Demo)', phone: '+919000000034', projectName: 'City Care Hospital', zoneId: await zoneId('PCMC'), customerType: 'COMMERCIAL_OWNER', buildingType: 'HOSPITAL', floors: 6, liftCategory: 'HOSPITAL_BED' }));
  await withSystem((tx) => tx.exec('update leads set is_demo = true'));

  await saveLender(s.finance, {
    legalName: 'Demo Sandbox Finance Ltd (not a real lender)', lenderType: 'NBFC', regulatoryReference: 'DEMO - no registration', contactName: 'Demo contact',
    productCategory: 'Home improvement loan', agreementStatus: 'SIGNED', agreementStart: daysFromNow(-5), agreementEnd: daysFromNow(360),
    approvedFields: ['customer_name', 'customer_phone', 'project_reference', 'approx_amount', 'contact_preference', 'consent_timestamp', 'consent_version'],
    referralChannel: 'Sandbox handoff log (no data leaves AIEC)', feeModel: 'None in sandbox', grievanceRoute: 'Demo grievance desk', integrationStatus: 'SANDBOX',
    complianceReviewDate: daysFromNow(180), isActive: true,
  });
  await withSystem((tx) => tx.exec('update lender_partners set is_demo = true'));
}

if (process.argv[1]?.endsWith('seed.ts')) {
  loadEnv();
  process.env.AUTH_SANDBOX ??= 'true';
  seedDemo().then(() => { console.log('demo data seeded'); return closePool(); }).catch(async (error) => { console.error(error); await closePool(); process.exit(1); });
}
