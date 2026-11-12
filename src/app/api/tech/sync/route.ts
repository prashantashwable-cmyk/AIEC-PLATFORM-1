import { api, jsonBody } from '@/server/api';
import { AppError } from '@/lib/errors';
import { syncEvents } from '@/server/services/tech';

/** Offline queue upload. Each event carries a client id and is applied at most once. */
export async function POST(request: Request) {
  return api(request, async (ctx) => {
    const body = await jsonBody(request);
    if (!Array.isArray(body.events)) throw new AppError('VALIDATION');
    return { acks: await syncEvents(ctx, body.events) };
  });
}
