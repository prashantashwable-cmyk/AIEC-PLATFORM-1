import { fail, ok } from '@/server/api';
import { handleReconciliationWebhook } from '@/server/services/money';

/**
 * Bank reconciliation webhook - SANDBOX CONTRACT. No bank is connected; this endpoint exists so the
 * idempotent reconciliation path can be exercised. Requests must carry an HMAC-SHA256 signature of
 * the raw body in `x-aiec-signature` (hex), keyed with RECONCILIATION_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    return ok(await handleReconciliationWebhook(raw, request.headers.get('x-aiec-signature')));
  } catch (error) {
    return fail(error instanceof SyntaxError ? new (await import('@/lib/errors')).AppError('VALIDATION') : error);
  }
}
