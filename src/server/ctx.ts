import type { Locale, Role } from '@/lib/enums';
import { INTERNAL_ROLES } from '@/lib/enums';
import { AppError } from '@/lib/errors';
import type { Permission } from '@/lib/permissions';
import type { Tx } from './db';

/** Server-derived identity and tenant scope of the signed-in user. Never built from client input. */
export interface Ctx {
  userId: string;
  name: string;
  phone: string;
  locale: Locale;
  roles: Role[];
  permissions: Set<string>;
  isInternal: boolean;
  companyId: string | null;
  companyName: string | null;
  companyCategory: string | null;
  companyRoles: Role[];
  /** True when the user's only company role is TECHNICIAN (most restricted company scope). */
  isTechnician: boolean;
  customerId: string | null;
  zoneIds: string[];
  ip: string | null;
}

export type Portal = 'admin' | 'partner' | 'tech' | 'customer';

export function can(ctx: Ctx, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}
export function canAny(ctx: Ctx, ...permissions: Permission[]): boolean {
  return permissions.some((p) => ctx.permissions.has(p));
}
export function requirePerm(ctx: Ctx, ...anyOf: Permission[]): void {
  if (!canAny(ctx, ...anyOf)) throw new AppError('FORBIDDEN');
}
export function requireInternal(ctx: Ctx): void {
  if (!ctx.isInternal) throw new AppError('FORBIDDEN');
}
export function requireCompany(ctx: Ctx): string {
  if (!ctx.companyId) throw new AppError('FORBIDDEN');
  return ctx.companyId;
}
export function requireCustomer(ctx: Ctx): string {
  if (!ctx.customerId || !ctx.permissions.has('customer.self')) throw new AppError('FORBIDDEN');
  return ctx.customerId;
}

export function portalsFor(ctx: Ctx): Portal[] {
  const portals: Portal[] = [];
  if (ctx.isInternal) portals.push('admin');
  if (ctx.companyId && ctx.companyRoles.some((r) => r !== 'TECHNICIAN')) portals.push('partner');
  if (ctx.companyId && ctx.companyRoles.some((r) => r === 'TECHNICIAN' || r === 'PARTNER_SUPERVISOR' || r === 'SERVICE_PARTNER')) portals.push('tech');
  if (ctx.customerId && ctx.roles.includes('CUSTOMER')) portals.push('customer');
  return portals;
}

type UserRow = { id: string; full_name: string; phone: string; preferred_locale: Locale };

/** Loads roles, permissions and tenant scope from the database for one user. */
export async function loadCtx(tx: Tx, userId: string, opts: { ip?: string | null; activeCompanyId?: string | null } = {}): Promise<Ctx | null> {
  const user = await tx.maybeOne<UserRow>(
    'select id, full_name, phone, preferred_locale from users where id = $1 and is_active', [userId],
  );
  if (!user) return null;
  const roleRows = await tx.query<{ role_code: Role; company_id: string | null; legal_name: string | null; category: string | null }>(
    `select ur.role_code, ur.company_id, c.legal_name, c.category
       from user_roles ur left join companies c on c.id = ur.company_id
      where ur.user_id = $1 and ur.revoked_at is null order by ur.granted_at`, [userId],
  );
  const roles = [...new Set(roleRows.map((r) => r.role_code))];
  const permRows = roles.length
    ? await tx.query<{ permission_code: string }>('select distinct permission_code from role_permissions where role_code = any($1)', [roles])
    : [];
  const companyRows = roleRows.filter((r) => r.company_id);
  const company = companyRows.find((r) => r.company_id === opts.activeCompanyId) ?? companyRows[0] ?? null;
  const companyRoles = company ? companyRows.filter((r) => r.company_id === company.company_id).map((r) => r.role_code) : [];
  const customer = await tx.maybeOne<{ id: string }>('select id from customers where user_id = $1', [userId]);
  const zones = await tx.query<{ zone_id: string }>('select zone_id from user_zones where user_id = $1', [userId]);
  return {
    userId: user.id,
    name: user.full_name,
    phone: user.phone,
    locale: user.preferred_locale,
    roles,
    permissions: new Set(permRows.map((p) => p.permission_code)),
    isInternal: roles.some((r) => (INTERNAL_ROLES as readonly string[]).includes(r)),
    companyId: company?.company_id ?? null,
    companyName: company?.legal_name ?? null,
    companyCategory: company?.category ?? null,
    companyRoles,
    isTechnician: companyRoles.length > 0 && companyRoles.every((r) => r === 'TECHNICIAN'),
    customerId: customer?.id ?? null,
    zoneIds: zones.map((z) => z.zone_id),
    ip: opts.ip ?? null,
  };
}
