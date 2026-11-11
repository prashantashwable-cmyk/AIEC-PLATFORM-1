import { z } from 'zod';
import { PAGE_SIZE } from '@/lib/config';
import { COMPANY_ROLES, INTERNAL_ROLES, ROLES, type Role } from '@/lib/enums';
import { AppError } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/permissions';
import { zBool, zEnum, zOptText, zPhone, zText, zUuid } from '@/lib/validation';
import { SETTING_DEFAULTS, audit, getSetting, type SettingKey } from '../audit';
import { can, requirePerm, type Ctx } from '../ctx';
import { withCtx, withSystem, type Rec } from '../db';
import { leadScope } from './leads';

const TODAY = `(now() at time zone 'Asia/Kolkata')::date`;

/** Owner command centre (spec 15): business, project-control and risk numbers with drill-down targets. */
export async function getAdminDashboard(ctx: Ctx) {
  if (!ctx.isInternal) throw new AppError('FORBIDDEN');
  return withCtx(ctx, async (tx) => {
    const max = Number(await getSetting(tx, 'pilot_max_active_projects'));
    const alertDays = Number(await getSetting(tx, 'expiry_alert_days'));
    const seeLeads = ctx.permissions.has('lead.view.all') || ctx.permissions.has('lead.view.city') || ctx.permissions.has('lead.view.assigned');
    const scope = seeLeads ? leadScope(ctx) : { sql: 'false', params: [] as unknown[] };
    const leads = await tx.one<Rec>(
      `select count(*) filter (where l.status = 'NEW') as new_leads,
              count(*) filter (where l.status = 'NEW' and l.response_due_at < now()) as response_overdue,
              count(*) filter (where l.qualified_at is not null) as qualified,
              count(*) filter (where l.status = 'CONFIRMED') as won,
              count(*) filter (where l.status = 'LOST') as lost,
              count(*) as total,
              avg(extract(epoch from (l.first_contacted_at - l.created_at)) / 3600) filter (where l.first_contacted_at is not null) as avg_response_hours
         from leads l where ${scope.sql}`, scope.params);
    const biz = await tx.one<Rec>(
      `select (select count(*) from site_surveys where status in ('SCHEDULED','IN_PROGRESS','REWORK_REQUIRED')) as surveys_open,
              (select count(*) from site_surveys where status = 'SUBMITTED') as surveys_to_review,
              (select count(*) from companies where status = 'ACTIVE') as active_partners,
              (select count(*) from companies where status in ('SUBMITTED','UNDER_REVIEW')) as partners_to_review,
              (select count(*) from quotations where status = 'SUBMITTED') as quotations_open,
              (select count(*) from orders where status = 'PENDING_PARTNER_ACCEPTANCE') as orders_awaiting_partner,
              (select count(*) from orders where status = 'PARTNER_ACCEPTED') as orders_to_confirm,
              (select coalesce(sum(gross_order_value), 0)::text from orders where status in ('CONFIRMED','COMPLETED')) as gross_order_value,
              (select coalesce(sum(amount), 0)::text from commission_ledger) as commission_earned,
              (select coalesce(sum(amount), 0)::text from commission_ledger where status = 'PAID') as commission_collected,
              (select coalesce(sum(amount_received - refunded_amount), 0)::text from partner_collections where status = 'VERIFIED') as verified_collections`);
    const projects = await tx.one<Rec>(
      `select app.active_project_count() as active,
              (select count(*) from projects where status = 'STOP_WORK') as stop_work,
              (select count(*) from projects where status = 'ON_HOLD') as on_hold,
              (select count(*) from projects where status in ('QC','HANDOVER_PENDING')) as near_handover,
              (select count(*) from projects where planned_end < ${TODAY} and status in ('PLANNING','IN_PROGRESS','QC','HANDOVER_PENDING','ON_HOLD','STOP_WORK')) as delayed,
              (select count(*) from project_milestones m join projects p on p.id = m.project_id where m.status <> 'COMPLETED' and m.due_date < ${TODAY}
                 and p.status not in ('HANDED_OVER','CLOSED','CANCELLED')) as milestones_overdue,
              (select count(*) from projects where status = 'PLANNING' and not (site_ready and permissions_confirmed)) as not_ready`);
    const risk = await tx.one<Rec>(
      `select (select count(distinct c.id) from companies c where c.status = 'ACTIVE' and c.category = 'ELEVATOR_COMPANY' and not exists
                 (select 1 from company_licenses l where l.company_id = c.id and l.license_type = 'LIFT_CONTRACTOR' and l.verification_status = 'VERIFIED' and l.expiry_date >= ${TODAY})) as licence_invalid,
              (select count(*) from company_licenses l join companies c on c.id = l.company_id where c.status = 'ACTIVE' and l.verification_status = 'VERIFIED'
                 and l.expiry_date between ${TODAY} and ${TODAY} + $1::int) as licences_expiring,
              (select count(*) from company_insurance_policies i join companies c on c.id = i.company_id where c.status = 'ACTIVE' and i.verification_status = 'VERIFIED'
                 and i.expiry_date between ${TODAY} and ${TODAY} + $1::int) as insurance_expiring,
              (select count(*) from compliance_documents where verification_status = 'PENDING') as docs_pending,
              (select count(*) from partner_collections where status in ('SUBMITTED','UNDER_REVIEW')) as collections_to_review,
              (select count(*) from partner_collections where status = 'DISPUTED') as payment_disputes,
              (select count(*) from commission_invoices where status = 'ISSUED' and due_date < ${TODAY}) as commission_overdue,
              (select count(*) from safety_incidents where status <> 'CLOSED') as incidents_open,
              (select count(*) from safety_incidents where status = 'EMERGENCY_ESCALATION') as incidents_emergency,
              (select count(*) from qc_defects where status <> 'CLOSED') as defects_open,
              (select count(*) from service_tickets where status not in ('RESOLVED','CLOSED')) as tickets_open,
              (select count(*) from service_tickets where status = 'OPEN' and ack_due_at < now()) as tickets_overdue,
              (select count(*) from disputes where status in ('OPEN','UNDER_REVIEW')) as disputes_open,
              (select count(*) from companies where status = 'SUSPENDED' or safety_block) as partners_blocked,
              (select count(*) from lead_duplicate_candidates where status = 'OPEN') as duplicates_open,
              (select count(*) from audit_logs where action = 'auth.otp_failed' and created_at > now() - interval '24 hours') as failed_logins`, [alertDays]);
    return { leads, biz, projects, risk, max };
  });
}

export async function listCustomers(ctx: Ctx, filter: { q?: string; page?: number }) {
  requirePerm(ctx, 'customer.view');
  const scope = can(ctx, 'lead.view.all') ? { sql: 'true', params: [] as unknown[] } : leadScope(ctx, 'l', 1);
  const params = [...scope.params];
  let search = 'true';
  if (filter.q) { params.push(`%${filter.q.trim()}%`); search = `(c.name ilike $${params.length} or c.phone ilike $${params.length})`; }
  const page = Math.max(1, filter.page ?? 1);
  // Staff with a narrower scope only see customers who have at least one lead in that scope.
  const where = `${search} and (${scope.sql === 'true' ? 'true' : `exists (select 1 from leads l where l.customer_id = c.id and ${scope.sql})`})`;
  return withCtx(ctx, async (tx) => {
    const total = (await tx.one<{ n: number }>(`select count(*) as n from customers c where ${where}`, params)).n;
    const rows = await tx.query<Rec>(
      `select c.id, c.name, c.phone, c.customer_type, c.created_at, (c.user_id is not null) as has_account,
              (select count(*) from leads x where x.customer_id = c.id) as lead_count,
              (select count(*) from projects p where p.customer_id = c.id) as project_count
         from customers c where ${where} order by c.created_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, params);
    return { rows, total, page };
  });
}

// ───────────── users, roles and permissions ─────────────
export async function getUsersOverview(ctx: Ctx) {
  requirePerm(ctx, 'user.manage');
  return withCtx(ctx, async (tx) => {
    const users = await tx.query<Rec>(
      `select u.id, u.full_name, u.phone, u.is_active, u.created_at,
              coalesce(json_agg(json_build_object('id', ur.id, 'role', ur.role_code, 'company', c.legal_name) order by ur.granted_at) filter (where ur.id is not null), '[]'::json) as roles,
              (select coalesce(json_agg(z.code order by z.code), '[]'::json) from user_zones uz join zones z on z.id = uz.zone_id where uz.user_id = u.id) as zones
         from users u left join user_roles ur on ur.user_id = u.id and ur.revoked_at is null left join companies c on c.id = ur.company_id
        where exists (select 1 from user_roles x where x.user_id = u.id and x.role_code = any($1)) or not exists (select 1 from user_roles y where y.user_id = u.id and y.revoked_at is null)
        group by u.id order by u.created_at limit 300`, [INTERNAL_ROLES as readonly string[]]);
    const matrix = await tx.query<Rec>('select role_code, permission_code from role_permissions');
    const zones = await tx.query<Rec>('select id, code, is_active from zones order by code');
    return { users, matrix, zones, roles: ROLES, permissions: PERMISSIONS };
  });
}

export const staffSchema = z.object({ name: zText(120), phone: zPhone, role: zEnum(INTERNAL_ROLES) });
export async function createStaffUser(ctx: Ctx, input: z.infer<typeof staffSchema>): Promise<void> {
  requirePerm(ctx, 'user.manage');
  await withSystem(async (tx) => {
    let user = await tx.maybeOne<{ id: string }>('select id from users where phone = $1', [input.phone]);
    user ??= await tx.one<{ id: string }>('insert into users (phone, full_name) values ($1, $2) returning id', [input.phone, input.name]);
    await tx.exec(
      `insert into user_roles (user_id, role_code, granted_by) select $1, $2, $3
        where not exists (select 1 from user_roles where user_id = $1 and role_code = $2 and company_id is null and revoked_at is null)`, [user.id, input.role, ctx.userId]);
    await audit(tx, ctx, 'user.role_grant', 'user', user.id, { role: input.role });
  });
}

export const roleChangeSchema = z.object({ userId: zUuid, role: zEnum(INTERNAL_ROLES), grant: zEnum(['yes', 'no'] as const) });
/** Grants or revokes an AIEC staff role. Revocation takes effect on the user's next request. */
export async function changeStaffRole(ctx: Ctx, input: z.infer<typeof roleChangeSchema>): Promise<void> {
  requirePerm(ctx, 'user.manage');
  if (input.userId === ctx.userId) throw new AppError('SELF_ROLE_CHANGE');
  await withCtx(ctx, async (tx) => {
    if (input.grant === 'yes') {
      await tx.exec(
        `insert into user_roles (user_id, role_code, granted_by) select $1, $2, $3
          where not exists (select 1 from user_roles where user_id = $1 and role_code = $2 and company_id is null and revoked_at is null)`, [input.userId, input.role, ctx.userId]);
    } else {
      await tx.exec('update user_roles set revoked_at = now(), revoked_by = $3 where user_id = $1 and role_code = $2 and company_id is null and revoked_at is null',
        [input.userId, input.role, ctx.userId]);
      await assertSuperAdminExists(tx);
    }
    await audit(tx, ctx, input.grant === 'yes' ? 'user.role_grant' : 'user.role_revoke', 'user', input.userId, { role: input.role });
  });
}

async function assertSuperAdminExists(tx: { one<T>(sql: string, params?: unknown[]): Promise<T> }): Promise<void> {
  const n = (await tx.one<{ n: number }>(
    `select count(*) as n from user_roles ur join users u on u.id = ur.user_id and u.is_active where ur.role_code = 'SUPER_ADMIN' and ur.revoked_at is null`)).n;
  if (!n) throw new AppError('LAST_ADMIN');
}

export async function setUserActive(ctx: Ctx, userId: string, active: boolean): Promise<void> {
  requirePerm(ctx, 'user.manage');
  if (userId === ctx.userId) throw new AppError('SELF_ROLE_CHANGE');
  await withSystem(async (tx) => {
    await tx.one('update users set is_active = $2 where id = $1 returning id', [userId, active]);
    if (!active) await tx.exec('delete from sessions where user_id = $1', [userId]);
    await assertSuperAdminExists(tx);
    await audit(tx, ctx, active ? 'user.activate' : 'user.deactivate', 'user', userId, {});
  });
}

export async function setUserZones(ctx: Ctx, userId: string, zoneIds: string[]): Promise<void> {
  requirePerm(ctx, 'user.manage');
  await withCtx(ctx, async (tx) => {
    await tx.exec('delete from user_zones where user_id = $1', [userId]);
    if (zoneIds.length) await tx.exec('insert into user_zones (user_id, zone_id) select $1, z.id from zones z where z.id = any($2::uuid[])', [userId, zoneIds]);
    await audit(tx, ctx, 'user.zones_set', 'user', userId, { zones: zoneIds.length });
  });
}

export const permissionToggleSchema = z.object({ role: zEnum(ROLES), permission: zEnum(PERMISSIONS), grant: zEnum(['yes', 'no'] as const) });
/** Edits the role → permission matrix. Scope is preserved: staff permissions cannot be given to partner or customer roles. */
export async function togglePermission(ctx: Ctx, input: z.infer<typeof permissionToggleSchema>): Promise<void> {
  requirePerm(ctx, 'user.manage');
  const companySide = ['company.manage', 'quotation.submit', 'order.accept', 'project.assign', 'milestone.update', 'payment.evidence.submit', 'commission.view.own',
    'team.manage', 'task.perform', 'evidence.submit', 'catalogue.manage', 'service.perform'];
  const roleIsInternal = (INTERNAL_ROLES as readonly string[]).includes(input.role);
  const roleIsCompany = (COMPANY_ROLES as readonly string[]).includes(input.role);
  const permScope = input.permission === 'customer.self' ? 'CUSTOMER' : companySide.includes(input.permission) ? 'COMPANY' : 'INTERNAL';
  if (input.grant === 'yes' && permScope !== (roleIsInternal ? 'INTERNAL' : roleIsCompany ? 'COMPANY' : 'CUSTOMER')) throw new AppError('FORBIDDEN');
  if (input.role === 'SUPER_ADMIN' && input.permission === 'user.manage' && input.grant === 'no') throw new AppError('LAST_ADMIN');
  await withCtx(ctx, async (tx) => {
    if (input.grant === 'yes') await tx.exec('insert into role_permissions (role_code, permission_code) values ($1, $2) on conflict do nothing', [input.role, input.permission]);
    else await tx.exec('delete from role_permissions where role_code = $1 and permission_code = $2', [input.role, input.permission]);
    await audit(tx, ctx, 'permission.change', 'role', null, { role: input.role as Role, permission: input.permission, grant: input.grant === 'yes' });
  });
}

// ───────────── settings, zones, audit ─────────────
export async function getSettings(ctx: Ctx) {
  requirePerm(ctx, 'settings.manage');
  return withCtx(ctx, async (tx) => {
    const stored = new Map((await tx.query<{ key: string; value: string }>('select key, value from system_settings')).map((r) => [r.key, r.value]));
    const settings = (Object.keys(SETTING_DEFAULTS) as SettingKey[]).map((key) => ({ key, value: stored.get(key) ?? SETTING_DEFAULTS[key] }));
    const zones = await tx.query<Rec>(
      `select z.*, (select count(*) from partner_service_areas a join companies c on c.id = a.company_id and c.status = 'ACTIVE' where a.zone_id = z.id) as active_partners from zones z order by z.code`);
    const rules = await tx.query<Rec>('select * from matching_rule_versions order by version desc');
    const messages = await tx.query<Rec>('select * from outbound_messages order by created_at desc limit 20');
    return { settings, zones, rules, messages };
  });
}

const NUMERIC_SETTINGS: Partial<Record<SettingKey, [number, number]>> = {
  pilot_max_active_projects: [1, 100], sla_lead_response_hours: [1, 72], sla_partner_response_days: [1, 30], sla_survey_schedule_days: [1, 30],
  sla_quotation_days: [1, 60], sla_complaint_ack_days: [1, 30], commission_invoice_gst_percent: [0, 28], commission_invoice_due_days: [0, 180],
  expiry_alert_days: [1, 365], monthly_fixed_cost: [0, 100000000],
};
export async function saveSetting(ctx: Ctx, key: string, value: string): Promise<void> {
  requirePerm(ctx, 'settings.manage');
  if (!(key in SETTING_DEFAULTS)) throw new AppError('VALIDATION');
  const range = NUMERIC_SETTINGS[key as SettingKey];
  if (range && !(Number.isFinite(Number(value)) && Number(value) >= range[0] && Number(value) <= range[1])) throw new AppError('VALIDATION', undefined, { value: 'INVALID' });
  if (key === 'holidays' && value && !value.split(',').every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.trim()))) throw new AppError('VALIDATION', undefined, { value: 'INVALID_DATE' });
  await withCtx(ctx, async (tx) => {
    await tx.exec(
      `insert into system_settings (key, value, updated_by) values ($1, $2, $3) on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
      [key, value.trim(), ctx.userId]);
    await audit(tx, ctx, 'settings.update', 'system_setting', null, { key, value });
  });
}

export const zoneSchema = z.object({ id: zUuid, active: zBool, note: zOptText(300) });
/** A zone is opened for service only once verified partner capacity exists there (spec 3.1). */
export async function setZoneActive(ctx: Ctx, input: z.infer<typeof zoneSchema>): Promise<void> {
  requirePerm(ctx, 'settings.manage');
  await withCtx(ctx, async (tx) => {
    if (input.active) {
      const partners = (await tx.one<{ n: number }>(
        `select count(*) as n from partner_service_areas a join companies c on c.id = a.company_id and c.status = 'ACTIVE' where a.zone_id = $1`, [input.id])).n;
      if (!partners) throw new AppError('NO_ELIGIBLE_PARTNER');
    }
    await tx.one('update zones set is_active = $2, activated_at = case when $2 then now() end, activated_by = case when $2 then $3::uuid end where id = $1 returning id',
      [input.id, input.active, ctx.userId]);
    await audit(tx, ctx, 'zone.activation', 'zone', input.id, { active: input.active });
  });
}

export async function listAudit(ctx: Ctx, filter: { action?: string; entity?: string; page?: number }) {
  requirePerm(ctx, 'audit.view');
  const params: unknown[] = [];
  const where = ['true'];
  if (filter.action) { params.push(`${filter.action.trim()}%`); where.push(`a.action like $${params.length}`); }
  if (filter.entity) { params.push(filter.entity.trim()); where.push(`a.entity_type = $${params.length}`); }
  const page = Math.max(1, filter.page ?? 1);
  return withCtx(ctx, async (tx) => {
    const total = (await tx.one<{ n: number }>(`select count(*) as n from audit_logs a where ${where.join(' and ')}`, params)).n;
    const rows = await tx.query<Rec>(
      `select a.*, u.full_name as actor from audit_logs a left join users u on u.id = a.actor_id where ${where.join(' and ')}
        order by a.created_at desc limit 50 offset ${(page - 1) * 50}`, params);
    return { rows, total, page, pageSize: 50 };
  });
}

/** Management report (spec 14, 17.1): funnel, money actually collected and break-even on real numbers. */
export async function getReports(ctx: Ctx) {
  requirePerm(ctx, 'report.view');
  return withCtx(ctx, async (tx) => {
    const scope = leadScope(ctx);
    const funnel = await tx.query<Rec>(`select l.status, count(*) as n from leads l where ${scope.sql} group by l.status`, scope.params);
    const sources = await tx.query<Rec>(
      `select l.source, count(*) as n, count(*) filter (where l.status = 'CONFIRMED') as won from leads l where ${scope.sql} group by l.source order by n desc`, scope.params);
    const zones = await tx.query<Rec>(
      `select z.code, count(l.id) as n from zones z left join leads l on l.zone_id = z.id and ${scope.sql} group by z.code order by n desc, z.code`, scope.params);
    const full = can(ctx, 'commission.view');
    const money = full ? await tx.one<Rec>(
      `select (select coalesce(sum(gross_order_value), 0)::text from orders where status in ('CONFIRMED','COMPLETED')) as gross_order_value,
              (select coalesce(sum(eligible_value), 0)::text from orders where status in ('CONFIRMED','COMPLETED')) as eligible_value,
              (select coalesce(sum(amount_received - refunded_amount), 0)::text from partner_collections where status in ('VERIFIED','REFUNDED')) as collections,
              (select coalesce(sum(refunded_amount), 0)::text from partner_collections) as refunds,
              (select coalesce(sum(amount), 0)::text from commission_ledger) as earned,
              (select coalesce(sum(amount), 0)::text from commission_ledger where status in ('INVOICED','PAID')) as invoiced,
              (select coalesce(sum(amount), 0)::text from commission_ledger where status = 'PAID') as collected,
              (select coalesce(sum(cl.amount), 0)::text from commission_ledger cl join commission_invoices ci on ci.id = cl.invoice_id
                where cl.status = 'INVOICED' and ci.due_date < ${TODAY}) as overdue,
              (select count(*) from orders where status in ('CONFIRMED','COMPLETED')) as orders,
              (select rate_percent::text from commission_policies where is_active) as rate`) : null;
    const targets = await tx.one<Rec>(
      `select (select count(*) from companies where status not in ('DRAFT')) as partners_screened,
              (select count(*) from companies where status = 'ACTIVE') as partners_active,
              (select count(*) from leads) as leads, (select count(*) from leads where qualified_at is not null) as qualified,
              (select count(*) from site_surveys where status in ('SUBMITTED','REVIEWED')) as surveys,
              (select count(*) from quotations q join quotation_versions v on v.id = q.current_version_id where v.submitted_at is not null) as quotations,
              (select count(*) from orders where status in ('CONFIRMED','COMPLETED')) as orders,
              (select count(*) from lender_partners) as lenders_approached,
              (select count(*) from lender_partners where agreement_status = 'SIGNED') as lenders_signed, app.active_project_count() as active_projects`);
    const fixedCost = await getSetting(tx, 'monthly_fixed_cost');
    return { funnel, sources, zones, money, targets, fixedCost, max: Number(await getSetting(tx, 'pilot_max_active_projects')) };
  });
}
