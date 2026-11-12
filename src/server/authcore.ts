import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { AppError } from '@/lib/errors';
import { isSandbox } from '@/lib/config';
import { normalizePhone } from '@/lib/phone';
import { audit } from './audit';
import { loadCtx, type Ctx } from './ctx';
import { withSystem, type Tx } from './db';

const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_WINDOW = 5;
const SESSION_DAYS = 14;

function secret(): string {
  const value = process.env.APP_SECRET;
  if (value && value.length >= 16) return value;
  if (isSandbox()) return 'sandbox-only-secret-not-for-production';
  throw new Error('APP_SECRET must be set (16+ characters)');
}
function hashOtp(phone: string, code: string): string {
  return createHmac('sha256', secret()).update(`${phone}:${code}`).digest('hex');
}
export function hashToken(token: string): string {
  return createHash('sha256').update(`${secret()}:${token}`).digest('hex');
}

/**
 * Creates an OTP challenge. In sandbox mode the code is returned for on-screen display
 * (clearly labelled). Outside sandbox an SMS provider is required; none is integrated yet,
 * so the request fails honestly instead of pretending an SMS was sent.
 */
export async function requestOtp(rawPhone: string): Promise<{ phone: string; sandboxCode: string | null }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AppError('VALIDATION', undefined, { phone: 'INVALID_PHONE' });
  if (!isSandbox()) throw new AppError('OTP_DELIVERY_UNAVAILABLE');
  return withSystem(async (tx) => {
    const recent = await tx.one<{ n: number }>(
      `select count(*) as n from otp_challenges where phone = $1 and created_at > now() - interval '15 minutes'`, [phone],
    );
    if (recent.n >= OTP_MAX_PER_WINDOW) throw new AppError('OTP_RATE_LIMIT');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await tx.exec(
      `insert into otp_challenges (phone, code_hash, expires_at) values ($1, $2, now() + ($3 || ' minutes')::interval)`,
      [phone, hashOtp(phone, code), String(OTP_TTL_MIN)],
    );
    return { phone, sandboxCode: code };
  });
}

/** Finds or creates the user for a verified phone number and links an existing customer record. */
export async function ensureUserForPhone(tx: Tx, phone: string, name: string | null, opts: { asCustomer?: boolean } = {}): Promise<string> {
  let user = await tx.maybeOne<{ id: string; is_active: boolean }>('select id, is_active from users where phone = $1', [phone]);
  const customer = await tx.maybeOne<{ id: string; name: string; user_id: string | null }>('select id, name, user_id from customers where phone = $1', [phone]);
  if (user && !user.is_active) throw new AppError('ACCOUNT_DISABLED');
  let created = false;
  if (!user) {
    const fullName = name?.trim() || customer?.name;
    if (!fullName) throw new AppError('VALIDATION', undefined, { name: 'REQUIRED' });
    user = await tx.one<{ id: string; is_active: boolean }>('insert into users (phone, full_name) values ($1, $2) returning id, is_active', [phone, fullName]);
    created = true;
  }
  // Users created for a company or staff role are not given a customer account implicitly.
  if (opts.asCustomer === false) return user.id;
  const hasRole = await tx.maybeOne('select 1 from user_roles where user_id = $1 and revoked_at is null limit 1', [user.id]);
  if (created || (!hasRole && !customer?.user_id) || (customer && !customer.user_id)) {
    if (customer) {
      if (!customer.user_id) await tx.exec('update customers set user_id = $1 where id = $2', [user.id, customer.id]);
    } else if (created || !hasRole) {
      const u = await tx.one<{ full_name: string }>('select full_name from users where id = $1', [user.id]);
      await tx.exec(`insert into customers (user_id, name, phone, customer_type) values ($1, $2, $3, 'INDIVIDUAL_OWNER')`, [user.id, u.full_name, phone]);
    }
    await tx.exec(
      `insert into user_roles (user_id, role_code) select $1, 'CUSTOMER'
        where not exists (select 1 from user_roles where user_id = $1 and role_code = 'CUSTOMER' and revoked_at is null)`, [user.id],
    );
  }
  return user.id;
}

async function createSession(tx: Tx, userId: string, meta: { ip?: string | null; userAgent?: string | null }): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await tx.exec(
    `insert into sessions (user_id, token_hash, expires_at, ip, user_agent) values ($1, $2, now() + ($3 || ' days')::interval, $4, $5)`,
    [userId, hashToken(token), String(SESSION_DAYS), meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null],
  );
  await tx.exec('delete from sessions where expires_at < now()');
  return token;
}

export async function verifyOtp(
  rawPhone: string, code: string, name: string | null, meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; userId: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AppError('VALIDATION', undefined, { phone: 'INVALID_PHONE' });
  // The attempt counter must persist even when verification fails, so it is committed separately.
  const challenge = await withSystem(async (tx) => {
    const row = await tx.maybeOne<{ id: string; code_hash: string; attempts: number }>(
      `select id, code_hash, attempts from otp_challenges
        where phone = $1 and consumed_at is null and expires_at > now() order by created_at desc limit 1 for update`, [phone],
    );
    if (!row || row.attempts >= OTP_MAX_ATTEMPTS) return null;
    await tx.exec('update otp_challenges set attempts = attempts + 1 where id = $1', [row.id]);
    return row;
  });
  const expected = challenge ? Buffer.from(challenge.code_hash, 'hex') : null;
  const actual = Buffer.from(hashOtp(phone, code.trim()), 'hex');
  if (!challenge || !expected || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await withSystem((tx) => audit(tx, null, 'auth.otp_failed', 'user', null, { phone }));
    throw new AppError('OTP_INVALID');
  }
  return withSystem(async (tx) => {
    const userId = await ensureUserForPhone(tx, phone, name);
    await tx.exec('update otp_challenges set consumed_at = now() where id = $1', [challenge.id]);
    const token = await createSession(tx, userId, meta);
    await audit(tx, null, 'auth.login', 'user', userId, { method: 'otp' });
    return { token, userId };
  });
}

/** Sandbox-only instant sign-in for seeded demo users. Refused outside sandbox mode. */
export async function demoLogin(userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<string> {
  if (!isSandbox()) throw new AppError('FORBIDDEN');
  return withSystem(async (tx) => {
    const user = await tx.maybeOne<{ id: string }>('select id from users where id = $1 and is_demo and is_active', [userId]);
    if (!user) throw new AppError('NOT_FOUND');
    const token = await createSession(tx, user.id, meta);
    await audit(tx, null, 'auth.login', 'user', user.id, { method: 'sandbox-demo' });
    return token;
  });
}

export async function listDemoUsers(): Promise<Array<{ id: string; full_name: string; roles: string[]; company: string | null }>> {
  if (!isSandbox()) return [];
  return withSystem((tx) =>
    tx.query(
      `select u.id, u.full_name, array_agg(distinct ur.role_code order by ur.role_code) as roles, max(c.legal_name) as company
         from users u join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
         left join companies c on c.id = ur.company_id
        where u.is_demo and u.is_active group by u.id, u.full_name, u.created_at order by u.created_at`,
    ),
  );
}

export async function ctxFromToken(token: string, ip: string | null): Promise<Ctx | null> {
  return withSystem(async (tx) => {
    const session = await tx.maybeOne<{ user_id: string; active_company_id: string | null }>(
      'select user_id, active_company_id from sessions where token_hash = $1 and expires_at > now()', [hashToken(token)],
    );
    if (!session) return null;
    return loadCtx(tx, session.user_id, { ip, activeCompanyId: session.active_company_id });
  });
}

export async function destroySession(token: string): Promise<void> {
  await withSystem(async (tx) => {
    const row = await tx.maybeOne<{ user_id: string }>('delete from sessions where token_hash = $1 returning user_id', [hashToken(token)]);
    if (row) await audit(tx, null, 'auth.logout', 'user', row.user_id);
  });
}
