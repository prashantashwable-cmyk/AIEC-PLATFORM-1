import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ctxFromToken } from './authcore';
import { portalsFor, type Ctx, type Portal } from './ctx';

export const SESSION_COOKIE = 'aiec_session';

export async function clientMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  return { ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null, userAgent: h.get('user-agent') };
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_URL?.startsWith('https') === true,
    path: '/', maxAge: 60 * 60 * 24 * 14,
  });
}

/** The signed-in user for this request (null when not signed in). Re-validated on every request. */
export const getSessionUser = cache(async (): Promise<Ctx | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { ip } = await clientMeta();
  return ctxFromToken(token, ip);
});

export async function requireUser(): Promise<Ctx> {
  const ctx = await getSessionUser();
  if (!ctx) redirect('/login');
  return ctx;
}

export const PORTAL_HOME: Record<Portal, string> = { admin: '/admin', partner: '/partner', tech: '/tech', customer: '/customer' };

/** Guards a workspace: unauthenticated → /login, wrong workspace → the user's own workspace chooser. */
export async function requirePortal(portal: Portal): Promise<Ctx> {
  const ctx = await requireUser();
  if (!portalsFor(ctx).includes(portal)) redirect('/app');
  return ctx;
}
