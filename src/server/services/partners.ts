import { z } from 'zod';
import { PAGE_SIZE } from '@/lib/config';
import {
  COMPANY_CATEGORY, ENTITY_TYPE, INSURANCE_TYPE, LICENSE_TYPE, LIFT_CATEGORY, PARTNER_GRADE, PARTNER_STATUS, type PartnerStatus,
} from '@/lib/enums';
import { AppError } from '@/lib/errors';
import { PARTNER_MACHINE, assertTransition } from '@/lib/state';
import { zDate, zEnum, zInt, zOptDate, zOptMoney, zOptText, zPhone, zText, zUuid } from '@/lib/validation';
import { audit, notifyCompany, notifyPermission } from '../audit';
import { can, requirePerm, type Ctx } from '../ctx';
import { withCtx, withSystem, type Rec, type Tx } from '../db';
import { ensureUserForPhone } from '../authcore';
import { saveFile } from './files';

type Upload = { name: string; type: string; bytes: Buffer } | null;

export const companySchema = z.object({
  legalName: zText(200),
  tradeName: zOptText(200),
  category: zEnum(COMPANY_CATEGORY),
  entityType: zEnum(ENTITY_TYPE),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'INVALID').optional(),
  gstin: z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, 'INVALID').optional(),
  address: zOptText(500),
  city: zOptText(100),
  signatoryName: zOptText(120),
  contactPhone: zPhone.optional(),
  contactEmail: z.string().trim().email('INVALID').optional(),
  warrantyPolicy: zOptText(2000),
  safetyProcedures: zOptText(2000),
  referencesNote: zOptText(2000),
});
export type CompanyInput = z.infer<typeof companySchema>;

const COMPANY_COLUMNS = `legal_name = $2, trade_name = $3, category = $4, entity_type = $5, pan = $6, gstin = $7, address = $8, city = $9,
  signatory_name = $10, contact_phone = $11, contact_email = $12, warranty_policy = $13, safety_procedures = $14, references_note = $15`;
function companyParams(i: CompanyInput): unknown[] {
  return [
    i.legalName, i.tradeName ?? null, i.category, i.entityType, i.pan ?? null, i.gstin ?? null, i.address ?? null, i.city ?? null,
    i.signatoryName ?? null, i.contactPhone ?? null, i.contactEmail ?? null, i.warrantyPolicy ?? null, i.safetyProcedures ?? null, i.referencesNote ?? null,
  ];
}
function adminRoleFor(category: string): string {
  return category === 'MANUFACTURER' || category === 'SUPPLIER' ? 'SUPPLIER' : category === 'SERVICE_PROVIDER' ? 'SERVICE_PARTNER' : 'PARTNER_ADMIN';
}

/**
 * Creates a partner company in DRAFT. A signed-in user registers their own company (and becomes
 * its admin); AIEC staff may register one on behalf of a partner by giving the admin's phone.
 */
export async function registerCompany(ctx: Ctx, input: CompanyInput, adminPhone?: { phone: string; name: string }): Promise<string> {
  const byStaff = can(ctx, 'partner.manage');
  if (!byStaff && ctx.companyId) throw new AppError('DUPLICATE');
  if (byStaff && !adminPhone) throw new AppError('VALIDATION', undefined, { adminPhone: 'REQUIRED' });
  return withSystem(async (tx) => {
    const company = await tx.one<{ id: string }>(
      `insert into companies (legal_name, trade_name, category, entity_type, pan, gstin, address, city, signatory_name, contact_phone, contact_email,
                              warranty_policy, safety_procedures, references_note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`, [...companyParams(input), ctx.userId],
    );
    const adminUserId = byStaff ? await ensureUserForPhone(tx, adminPhone!.phone, adminPhone!.name, { asCustomer: false }) : ctx.userId;
    await tx.exec('insert into user_roles (user_id, role_code, company_id, granted_by) values ($1, $2, $3, $4)',
      [adminUserId, adminRoleFor(input.category), company.id, ctx.userId]);
    await audit(tx, ctx, 'partner.register', 'company', company.id, { legalName: input.legalName, category: input.category }, company.id);
    return company.id;
  });
}

/** Company the caller may edit: their own (company.manage) or any (partner.manage). */
function editableCompanyId(ctx: Ctx, companyId?: string | null): string {
  if (can(ctx, 'partner.manage') && companyId) return companyId;
  if (can(ctx, 'company.manage') && ctx.companyId && (!companyId || companyId === ctx.companyId)) return ctx.companyId;
  throw new AppError('FORBIDDEN');
}

export async function updateCompany(ctx: Ctx, input: CompanyInput, companyId?: string): Promise<void> {
  const id = editableCompanyId(ctx, companyId);
  await withCtx(ctx, async (tx) => {
    const current = await tx.one<{ category: string }>('select category from companies where id = $1', [id]);
    // Category drives licensing gates; only AIEC staff may change it after registration.
    const category = can(ctx, 'partner.manage') ? input.category : current.category;
    await tx.exec(`update companies set ${COMPANY_COLUMNS}, updated_at = now() where id = $1`, [id, ...companyParams({ ...input, category: category as CompanyInput['category'] })]);
    await audit(tx, ctx, 'partner.update', 'company', id, { legalName: input.legalName }, id);
  });
}

export const licenceSchema = z.object({
  companyId: zUuid.optional(), licenseType: zEnum(LICENSE_TYPE), licenseNumber: zText(100), authority: zText(200),
  state: zText(100).default('Maharashtra'), scope: zOptText(500), issueDate: zDate, expiryDate: zDate,
});
export async function addLicence(ctx: Ctx, input: z.infer<typeof licenceSchema>, file: Upload): Promise<void> {
  const id = editableCompanyId(ctx, input.companyId);
  if (input.expiryDate <= input.issueDate) throw new AppError('VALIDATION', undefined, { expiryDate: 'INVALID_DATE' });
  if (!file) throw new AppError('VALIDATION', undefined, { file: 'FILE_REQUIRED' });
  await withCtx(ctx, async (tx) => {
    const fileId = await saveFile(tx, ctx, file, 'LICENCE', { companyId: id });
    const row = await tx.one<{ id: string }>(
      `insert into company_licenses (company_id, license_type, license_number, authority, state, scope, issue_date, expiry_date, file_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [id, input.licenseType, input.licenseNumber, input.authority, input.state, input.scope ?? null, input.issueDate, input.expiryDate, fileId],
    );
    await audit(tx, ctx, 'partner.licence_add', 'company_license', row.id, { number: input.licenseNumber, expiry: input.expiryDate }, id);
  });
}

export const insuranceSchema = z.object({
  companyId: zUuid.optional(), policyType: zEnum(INSURANCE_TYPE), insurer: zText(200), policyNumber: zText(100), coverAmount: zOptMoney,
  issueDate: zDate, expiryDate: zDate,
});
export async function addInsurance(ctx: Ctx, input: z.infer<typeof insuranceSchema>, file: Upload): Promise<void> {
  const id = editableCompanyId(ctx, input.companyId);
  if (input.expiryDate <= input.issueDate) throw new AppError('VALIDATION', undefined, { expiryDate: 'INVALID_DATE' });
  if (!file) throw new AppError('VALIDATION', undefined, { file: 'FILE_REQUIRED' });
  await withCtx(ctx, async (tx) => {
    const fileId = await saveFile(tx, ctx, file, 'INSURANCE', { companyId: id });
    const row = await tx.one<{ id: string }>(
      `insert into company_insurance_policies (company_id, policy_type, insurer, policy_number, cover_amount, issue_date, expiry_date, file_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [id, input.policyType, input.insurer, input.policyNumber, input.coverAmount ?? null, input.issueDate, input.expiryDate, fileId],
    );
    await audit(tx, ctx, 'partner.insurance_add', 'company_insurance', row.id, { number: input.policyNumber, expiry: input.expiryDate }, id);
  });
}

export const capabilitySchema = z.object({ companyId: zUuid.optional(), liftCategory: zEnum(LIFT_CATEGORY), maxFloors: zInt(1, 100) });
/** Partners declare capability; it only counts for matching after AIEC verifies it. */
export async function setCapability(ctx: Ctx, input: z.infer<typeof capabilitySchema>): Promise<void> {
  const id = editableCompanyId(ctx, input.companyId);
  await withCtx(ctx, async (tx) => {
    await tx.exec(
      `insert into partner_capabilities (company_id, lift_category, max_floors) values ($1, $2, $3)
       on conflict (company_id, lift_category) do update set max_floors = excluded.max_floors, verified = false`,
      [id, input.liftCategory, input.maxFloors],
    );
    await audit(tx, ctx, 'partner.capability_set', 'company', id, input, id);
  });
}

export async function setServiceAreas(ctx: Ctx, zoneIds: string[], maxConcurrentProjects: number, companyId?: string): Promise<void> {
  const id = editableCompanyId(ctx, companyId);
  await withCtx(ctx, async (tx) => {
    await tx.exec('delete from partner_service_areas where company_id = $1', [id]);
    if (zoneIds.length) {
      await tx.exec('insert into partner_service_areas (company_id, zone_id) select $1, z.id from zones z where z.id = any($2::uuid[])', [id, zoneIds]);
    }
    await tx.exec('update companies set max_concurrent_projects = $2, updated_at = now() where id = $1', [id, maxConcurrentProjects]);
    await audit(tx, ctx, 'partner.capacity_set', 'company', id, { zones: zoneIds.length, maxConcurrentProjects }, id);
  });
}

/** Days until the best verified licence / insurance expires (null = none valid). Used by every gate. */
export async function complianceFacts(tx: Tx, companyId: string): Promise<{ licenceDaysLeft: number | null; insuranceDaysLeft: number | null }> {
  const row = await tx.one<{ lic: number | null; ins: number | null }>(
    `select (select max(expiry_date - (now() at time zone 'Asia/Kolkata')::date) from company_licenses
              where company_id = $1 and license_type = 'LIFT_CONTRACTOR' and verification_status = 'VERIFIED'
                and expiry_date >= (now() at time zone 'Asia/Kolkata')::date) as lic,
            (select max(expiry_date - (now() at time zone 'Asia/Kolkata')::date) from company_insurance_policies
              where company_id = $1 and verification_status = 'VERIFIED' and expiry_date >= (now() at time zone 'Asia/Kolkata')::date) as ins`,
    [companyId],
  );
  return { licenceDaysLeft: row.lic, insuranceDaysLeft: row.ins };
}

/** Blocks regulated work unless the partner is active, not safety-blocked and holds valid verified documents. */
export async function assertPartnerFitForWork(tx: Tx, companyId: string): Promise<void> {
  const company = await tx.one<{ status: string; safety_block: boolean; category: string }>(
    'select status, safety_block, category from companies where id = $1', [companyId]);
  if (company.status !== 'ACTIVE') throw new AppError('PARTNER_NOT_ACTIVE');
  if (company.safety_block) throw new AppError('PARTNER_SAFETY_BLOCK');
  const facts = await complianceFacts(tx, companyId);
  if (facts.licenceDaysLeft === null) throw new AppError('LICENCE_INVALID');
  if (facts.insuranceDaysLeft === null) throw new AppError('INSURANCE_INVALID');
}

export async function submitForReview(ctx: Ctx): Promise<void> {
  const id = editableCompanyId(ctx, null);
  await withCtx(ctx, async (tx) => {
    const company = await tx.one<Rec>('select * from companies where id = $1 for update', [id]);
    assertTransition(PARTNER_MACHINE, company.status as PartnerStatus, 'SUBMITTED');
    const missing: Record<string, string> = {};
    if (!company.pan) missing.pan = 'REQUIRED';
    if (!company.address) missing.address = 'REQUIRED';
    if (!company.signatory_name) missing.signatoryName = 'REQUIRED';
    if (company.category === 'ELEVATOR_COMPANY') {
      const counts = await tx.one<Rec>(
        `select (select count(*) from company_licenses where company_id = $1 and license_type = 'LIFT_CONTRACTOR') as lic,
                (select count(*) from company_insurance_policies where company_id = $1) as ins,
                (select count(*) from partner_capabilities where company_id = $1) as cap,
                (select count(*) from partner_service_areas where company_id = $1) as areas`, [id]);
      if (!counts.lic) missing.licence = 'REQUIRED';
      if (!counts.ins) missing.insurance = 'REQUIRED';
      if (!counts.cap) missing.capability = 'REQUIRED';
      if (!counts.areas) missing.areas = 'REQUIRED';
    }
    if (Object.keys(missing).length) throw new AppError('ONBOARDING_INCOMPLETE', { missing: Object.keys(missing).join(', ') }, missing);
    await setStatus(tx, ctx, id, company.status, 'SUBMITTED', null);
    await notifyPermission(tx, 'partner.verify', 'PARTNER_SUBMITTED', { name: company.legal_name }, `/admin/partners/${id}`);
  });
}

async function setStatus(tx: Tx, ctx: Ctx | null, id: string, from: string, to: PartnerStatus, note: string | null): Promise<void> {
  await tx.exec('update companies set status = $2, status_reason = $3, updated_at = now() where id = $1', [id, to, note]);
  await tx.exec('insert into company_verification_reviews (company_id, from_status, to_status, reviewer_id, note) values ($1,$2,$3,$4,$5)',
    [id, from, to, ctx?.userId ?? null, note]);
  await audit(tx, ctx, 'partner.status', 'company', id, { from, to, note }, id);
}

export const partnerStatusSchema = z.object({ id: zUuid, to: zEnum(PARTNER_STATUS), note: zOptText(1000) });
/** Verification and activation by authorised AIEC reviewers (spec 6.2, 6.3). */
export async function changePartnerStatus(ctx: Ctx, input: z.infer<typeof partnerStatusSchema>): Promise<void> {
  const activation = ['ACTIVE', 'SUSPENDED', 'TERMINATED', 'EXPIRED', 'UNDER_RENEWAL'].includes(input.to);
  requirePerm(ctx, activation ? 'partner.activate' : 'partner.verify');
  await withCtx(ctx, async (tx) => {
    const company = await tx.one<Rec>('select * from companies where id = $1 for update', [input.id]);
    assertTransition(PARTNER_MACHINE, company.status as PartnerStatus, input.to);
    if (['REJECTED', 'SUSPENDED', 'TERMINATED'].includes(input.to) && !input.note) throw new AppError('REASON_REQUIRED');
    if ((input.to === 'VERIFIED' || input.to === 'ACTIVE') && company.category === 'ELEVATOR_COMPANY') {
      const facts = await complianceFacts(tx, input.id);
      if (facts.licenceDaysLeft === null) throw new AppError('LICENCE_INVALID');
      if (facts.insuranceDaysLeft === null) throw new AppError('INSURANCE_INVALID');
    }
    if (input.to === 'ACTIVE' && !company.agreement_signed_on) throw new AppError('PARTNER_AGREEMENT_REQUIRED');
    await setStatus(tx, ctx, input.id, company.status, input.to, input.note ?? null);
    await notifyCompany(tx, input.id, 'PARTNER_STATUS', { status: input.to }, '/partner/company');
  });
}

export const docReviewSchema = z.object({ kind: zEnum(['licence', 'insurance'] as const), id: zUuid, approve: zEnum(['yes', 'no'] as const), reason: zOptText(500) });
export async function reviewPartnerDocument(ctx: Ctx, input: z.infer<typeof docReviewSchema>): Promise<void> {
  requirePerm(ctx, 'partner.verify');
  const approve = input.approve === 'yes';
  if (!approve && !input.reason) throw new AppError('REASON_REQUIRED');
  const table = input.kind === 'licence' ? 'company_licenses' : 'company_insurance_policies';
  await withCtx(ctx, async (tx) => {
    const row = await tx.one<{ company_id: string }>(
      `update ${table} set verification_status = $2, reviewed_by = $3, reviewed_at = now(), rejection_reason = $4 where id = $1 returning company_id`,
      [input.id, approve ? 'VERIFIED' : 'REJECTED', ctx.userId, approve ? null : input.reason],
    );
    await audit(tx, ctx, `partner.${input.kind}_review`, table, input.id, { approve, reason: input.reason ?? null }, row.company_id);
    await notifyCompany(tx, row.company_id, 'PARTNER_DOC_REVIEWED', { result: approve ? 'VERIFIED' : 'REJECTED' }, '/partner/company');
  });
}

export async function verifyCapability(ctx: Ctx, companyId: string, liftCategory: string, verified: boolean): Promise<void> {
  requirePerm(ctx, 'partner.verify');
  await withCtx(ctx, async (tx) => {
    const n = await tx.exec('update partner_capabilities set verified = $3 where company_id = $1 and lift_category = $2', [companyId, liftCategory, verified]);
    if (!n) throw new AppError('NOT_FOUND');
    await audit(tx, ctx, 'partner.capability_verify', 'company', companyId, { liftCategory, verified }, companyId);
  });
}

export const governanceSchema = z.object({
  id: zUuid, agreementSignedOn: zOptDate, agreementReference: zOptText(200), grade: zEnum(PARTNER_GRADE),
  safetyBlock: zEnum(['yes', 'no'] as const), safetyBlockReason: zOptText(500),
});
/** Agreement record, evidence-based grade and safety block. Grade is never derived from payments. */
export async function updateGovernance(ctx: Ctx, input: z.infer<typeof governanceSchema>): Promise<void> {
  requirePerm(ctx, 'partner.activate');
  const block = input.safetyBlock === 'yes';
  if (block && !input.safetyBlockReason) throw new AppError('REASON_REQUIRED');
  await withCtx(ctx, async (tx) => {
    await tx.exec(
      `update companies set agreement_signed_on = $2, agreement_reference = $3, grade = $4, safety_block = $5, safety_block_reason = $6, updated_at = now() where id = $1`,
      [input.id, input.agreementSignedOn ?? null, input.agreementReference ?? null, input.grade, block, block ? input.safetyBlockReason : null],
    );
    await audit(tx, ctx, 'partner.governance', 'company', input.id, { ...input }, input.id);
  });
}

export async function listPartners(ctx: Ctx, filter: { status?: string; category?: string; q?: string; page?: number }) {
  requirePerm(ctx, 'partner.view');
  const params: unknown[] = [];
  const where = ['true'];
  if (filter.status) { params.push(filter.status); where.push(`c.status = $${params.length}`); }
  if (filter.category) { params.push(filter.category); where.push(`c.category = $${params.length}`); }
  if (filter.q) { params.push(`%${filter.q.trim()}%`); where.push(`(c.legal_name ilike $${params.length} or c.trade_name ilike $${params.length})`); }
  if (!can(ctx, 'lead.view.all') && can(ctx, 'lead.view.city')) {
    // City managers see partners serving their assigned zones only.
    params.push(ctx.zoneIds);
    where.push(`exists (select 1 from partner_service_areas a where a.company_id = c.id and a.zone_id = any($${params.length}::uuid[]))`);
  }
  const page = Math.max(1, filter.page ?? 1);
  return withCtx(ctx, async (tx) => {
    const total = (await tx.one<{ n: number }>(`select count(*) as n from companies c where ${where.join(' and ')}`, params)).n;
    const rows = await tx.query<Rec>(
      `select c.id, c.legal_name, c.category, c.status, c.grade, c.city, c.max_concurrent_projects, c.safety_block,
              app.active_project_count(c.id) as active_projects,
              (select min(expiry_date) from company_licenses l where l.company_id = c.id and l.verification_status = 'VERIFIED' and l.license_type = 'LIFT_CONTRACTOR'
                 and l.expiry_date >= current_date) as licence_expiry,
              (select min(expiry_date) from company_insurance_policies i where i.company_id = c.id and i.verification_status = 'VERIFIED'
                 and i.expiry_date >= current_date) as insurance_expiry
         from companies c where ${where.join(' and ')} order by c.created_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, params);
    return { rows, total, page };
  });
}

/** Full company profile. Staff need partner.view; partner users always get their own company. */
export async function getCompanyProfile(ctx: Ctx, companyId?: string) {
  const id = companyId && can(ctx, 'partner.view') ? companyId : ctx.companyId;
  if (!id || ctx.isTechnician) throw new AppError('FORBIDDEN');
  return withCtx(ctx, async (tx) => {
    const company = await tx.one<Rec>('select c.*, app.active_project_count(c.id) as active_projects from companies c where c.id = $1', [id]);
    const [licences, insurance, capabilities, areas, reviews, performance, team, facts] = await Promise.all([
      tx.query<Rec>('select * from company_licenses where company_id = $1 order by expiry_date desc', [id]),
      tx.query<Rec>('select * from company_insurance_policies where company_id = $1 order by expiry_date desc', [id]),
      tx.query<Rec>('select * from partner_capabilities where company_id = $1 order by lift_category', [id]),
      tx.query<Rec>('select z.id, z.code from partner_service_areas a join zones z on z.id = a.zone_id where a.company_id = $1 order by z.code', [id]),
      tx.query<Rec>(`select r.*, u.full_name as reviewer from company_verification_reviews r left join users u on u.id = r.reviewer_id where r.company_id = $1 order by r.created_at desc`, [id]),
      tx.query<Rec>('select * from partner_performance_events where company_id = $1 order by created_at desc limit 50', [id]),
      tx.query<Rec>(`select u.id, u.full_name, u.phone, ur.role_code from user_roles ur join users u on u.id = ur.user_id where ur.company_id = $1 and ur.revoked_at is null order by u.full_name`, [id]),
      complianceFacts(tx, id),
    ]);
    return { company, licences, insurance, capabilities, areas, reviews, performance, team, facts };
  });
}

export const performanceSchema = z.object({
  companyId: zUuid, eventType: zEnum(['PROJECT_ON_TIME', 'PROJECT_DELAYED', 'QC_PASS', 'QC_FAIL', 'COMPLAINT', 'CUSTOMER_RATING', 'SAFETY_INCIDENT'] as const),
  score: zInt(0, 100), note: zText(500),
});
export async function addPerformanceEvent(ctx: Ctx, input: z.infer<typeof performanceSchema>): Promise<void> {
  requirePerm(ctx, 'partner.verify');
  await withCtx(ctx, async (tx) => {
    await tx.exec('insert into partner_performance_events (company_id, event_type, score, note, created_by) values ($1,$2,$3,$4,$5)',
      [input.companyId, input.eventType, input.score, input.note, ctx.userId]);
    await audit(tx, ctx, 'partner.performance_event', 'company', input.companyId, input, input.companyId);
  });
}

// ───────────── partner team (supervisors and technicians are sub-roles of the company) ─────────────
export const teamMemberSchema = z.object({ name: zText(120), phone: zPhone, role: zEnum(['PARTNER_SUPERVISOR', 'TECHNICIAN'] as const) });
export async function addTeamMember(ctx: Ctx, input: z.infer<typeof teamMemberSchema>): Promise<void> {
  requirePerm(ctx, 'team.manage');
  const companyId = ctx.companyId;
  if (!companyId) throw new AppError('FORBIDDEN');
  await withSystem(async (tx) => {
    let user = await tx.maybeOne<{ id: string }>('select id from users where phone = $1', [input.phone]);
    user ??= await tx.one<{ id: string }>('insert into users (phone, full_name) values ($1, $2) returning id', [input.phone, input.name]);
    const elsewhere = await tx.maybeOne('select 1 from user_roles where user_id = $1 and company_id is not null and company_id <> $2 and revoked_at is null', [user.id, companyId]);
    if (elsewhere) throw new AppError('DUPLICATE');
    await tx.exec(
      `insert into user_roles (user_id, role_code, company_id, granted_by) select $1, $2, $3, $4
        where not exists (select 1 from user_roles where user_id = $1 and role_code = $2 and company_id = $3 and revoked_at is null)`,
      [user.id, input.role, companyId, ctx.userId]);
    await audit(tx, ctx, 'team.add', 'user', user.id, { role: input.role }, companyId);
  });
}

export async function removeTeamMember(ctx: Ctx, userId: string, role: string): Promise<void> {
  requirePerm(ctx, 'team.manage');
  if (!['PARTNER_SUPERVISOR', 'TECHNICIAN'].includes(role)) throw new AppError('FORBIDDEN');
  await withCtx(ctx, async (tx) => {
    const n = await tx.exec(
      'update user_roles set revoked_at = now(), revoked_by = $4 where user_id = $1 and role_code = $2 and company_id = $3 and revoked_at is null',
      [userId, role, ctx.companyId, ctx.userId]);
    if (!n) throw new AppError('NOT_FOUND');
    await audit(tx, ctx, 'team.remove', 'user', userId, { role }, ctx.companyId);
  });
}

/**
 * Housekeeping (idempotent): expires partners whose mandatory licence has lapsed and invitations
 * that passed their response deadline. Runs as a trusted job from the admin dashboard and cron endpoint.
 */
export async function runExpirySweep(): Promise<{ partnersExpired: number; invitationsExpired: number }> {
  return withSystem(async (tx) => {
    const expired = await tx.query<{ id: string; legal_name: string }>(
      `select c.id, c.legal_name from companies c where c.status = 'ACTIVE' and c.category = 'ELEVATOR_COMPANY'
          and not exists (select 1 from company_licenses l where l.company_id = c.id and l.license_type = 'LIFT_CONTRACTOR'
                           and l.verification_status = 'VERIFIED' and l.expiry_date >= (now() at time zone 'Asia/Kolkata')::date) for update`);
    for (const c of expired) {
      await setStatus(tx, null, c.id, 'ACTIVE', 'EXPIRED', 'Mandatory lift contractor licence expired');
      await notifyCompany(tx, c.id, 'PARTNER_STATUS', { status: 'EXPIRED' }, '/partner/company');
      await notifyPermission(tx, 'partner.activate', 'PARTNER_LICENCE_EXPIRED', { name: c.legal_name }, `/admin/partners/${c.id}`);
    }
    const invites = await tx.query<{ id: string; company_id: string }>(
      `update partner_matches set status = 'EXPIRED' where status = 'INVITED' and respond_due_at < now() returning id, company_id`);
    for (const m of invites) {
      await tx.exec(`insert into partner_performance_events (company_id, event_type, score, note) values ($1, 'INVITE_EXPIRED', 0, 'Invitation not answered in time')`, [m.company_id]);
    }
    return { partnersExpired: expired.length, invitationsExpired: invites.length };
  });
}
