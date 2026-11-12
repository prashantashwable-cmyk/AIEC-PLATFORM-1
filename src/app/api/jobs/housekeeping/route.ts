import { timingSafeEqual } from 'node:crypto';
import { AppError } from '@/lib/errors';
import { fail, ok } from '@/server/api';
import { runExpirySweep } from '@/server/services/partners';

/** Scheduled housekeeping (licence expiry, invitation expiry). Call from a cron with `Authorization: Bearer <APP_SECRET>`. */
export async function POST(request: Request) {
  try {
    const secret = process.env.APP_SECRET ?? '';
    const given = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
    const a = Buffer.from(secret);
    const b = Buffer.from(given);
    if (secret.length < 16 || a.length !== b.length || !timingSafeEqual(a, b)) throw new AppError('FORBIDDEN');
    return ok(await runExpirySweep());
  } catch (error) {
    return fail(error);
  }
}
