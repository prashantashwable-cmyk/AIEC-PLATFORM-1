import { PAGE_SIZE } from '@/lib/config';
import type { Ctx } from '../ctx';
import { withCtx, type Rec } from '../db';

export async function unreadCount(ctx: Ctx): Promise<number> {
  return withCtx(ctx, async (tx) =>
    (await tx.one<{ n: number }>('select count(*) as n from notifications where user_id = $1 and read_at is null', [ctx.userId])).n);
}

export async function listNotifications(ctx: Ctx, page = 1): Promise<{ rows: Rec[]; total: number; page: number }> {
  return withCtx(ctx, async (tx) => {
    const total = (await tx.one<{ n: number }>('select count(*) as n from notifications where user_id = $1', [ctx.userId])).n;
    const rows = await tx.query<Rec>(
      `select id, type, params, link, read_at, created_at from notifications where user_id = $1
        order by created_at desc limit ${PAGE_SIZE} offset ${(Math.max(1, page) - 1) * PAGE_SIZE}`, [ctx.userId]);
    return { rows, total, page: Math.max(1, page) };
  });
}

export async function markNotificationsRead(ctx: Ctx, id?: string): Promise<void> {
  await withCtx(ctx, (tx) =>
    tx.exec('update notifications set read_at = now() where user_id = $1 and read_at is null and ($2::uuid is null or id = $2)', [ctx.userId, id ?? null]));
}
