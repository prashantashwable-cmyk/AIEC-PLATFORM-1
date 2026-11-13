import 'server-only';
import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';
import { getSessionUser } from './auth';
import type { Ctx } from './ctx';

const STATUS: Record<string, number> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 422, DUPLICATE: 409, INVALID_TRANSITION: 409 };

/** Consistent API envelope: { ok: true, data } or { ok: false, error: { code, params?, fields? } }. */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}
export function fail(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ ok: false, error: { code: error.code, params: error.params, fields: error.fieldErrors } }, { status: STATUS[error.code] ?? 400 });
  }
  console.error('[api] unexpected error', error);
  return NextResponse.json({ ok: false, error: { code: 'UNKNOWN' } }, { status: 500 });
}

/** Wraps a route handler: requires a session, checks same-origin for state-changing calls, maps errors. */
export async function api(request: Request, handler: (ctx: Ctx) => Promise<unknown>, status = 200): Promise<NextResponse> {
  try {
    if (request.method !== 'GET') {
      // Session cookies are SameSite=Lax; this additionally rejects cross-site form/script posts.
      const origin = request.headers.get('origin');
      if (origin && new URL(origin).host !== request.headers.get('host')) throw new AppError('FORBIDDEN');
    }
    const ctx = await getSessionUser();
    if (!ctx) throw new AppError('UNAUTHENTICATED');
    return ok(await handler(ctx), status);
  } catch (error) {
    return fail(error);
  }
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    return body as Record<string, unknown>;
  } catch {
    throw new AppError('VALIDATION');
  }
}
