import { Pool, types, type PoolClient } from 'pg';
import { AppError } from '@/lib/errors';
import type { Ctx } from './ctx';

// DATE columns are calendar dates: keep them as 'YYYY-MM-DD' strings (no timezone drift).
types.setTypeParser(1082, (v) => v);
// bigint (COUNT) → number. Values in this system are far below 2^53.
types.setTypeParser(20, (v) => Number(v));

const globalForPg = globalThis as unknown as { __aiecPool?: Pool };

export function getPool(): Pool {
  if (!globalForPg.__aiecPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    globalForPg.__aiecPool = new Pool({
      connectionString,
      max: 10,
      ssl: /sslmode=require|supabase\.(co|com)/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalForPg.__aiecPool;
}

export async function closePool(): Promise<void> {
  await globalForPg.__aiecPool?.end();
  globalForPg.__aiecPool = undefined;
}

export type Row = Record<string, unknown>;
/** Loosely typed result row for read models that are rendered straight into pages. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Rec = Record<string, any>;
export interface Tx {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Exactly one row, otherwise NOT_FOUND (also the result when RLS hides the row). */
  one<T = Row>(sql: string, params?: unknown[]): Promise<T>;
  maybeOne<T = Row>(sql: string, params?: unknown[]): Promise<T | null>;
  exec(sql: string, params?: unknown[]): Promise<number>;
}

function mapPgError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  const e = error as { code?: string; message?: string; constraint?: string };
  if (e?.code === 'P0001' && e.message) {
    const code = e.message.split(':')[0].trim();
    return new AppError(/^[A-Z_]+$/.test(code) ? (code === 'APPEND_ONLY' ? 'FORBIDDEN' : code) : 'UNKNOWN');
  }
  if (e?.code === '42501') return new AppError('FORBIDDEN');
  if (e?.code === '23505') return new AppError('DUPLICATE', { constraint: e.constraint });
  return error;
}

function wrap(client: PoolClient): Tx {
  const query = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    try {
      return (await client.query(sql, params)).rows as T[];
    } catch (error) {
      throw mapPgError(error);
    }
  };
  return {
    query,
    async one<T>(sql: string, params?: unknown[]) {
      const rows = await query<T>(sql, params);
      if (rows.length !== 1) throw new AppError('NOT_FOUND');
      return rows[0];
    },
    async maybeOne<T>(sql: string, params?: unknown[]) {
      return (await query<T>(sql, params))[0] ?? null;
    },
    async exec(sql: string, params: unknown[] = []) {
      try {
        return (await client.query(sql, params)).rowCount ?? 0;
      } catch (error) {
        throw mapPgError(error);
      }
    },
  };
}

async function run<T>(setup: ((client: PoolClient) => Promise<void>) | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    if (setup) await setup(client);
    const result = await fn(wrap(client));
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw mapPgError(error);
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` in one transaction as the signed-in user: the restricted database role is
 * activated and the tenant claims are bound, so row-level security applies to every query.
 */
export function withCtx<T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return run(async (client) => {
    await client.query(
      `select set_config('app.user_id', $1, true), set_config('app.company_id', $2, true),
              set_config('app.customer_id', $3, true), set_config('app.is_internal', $4, true),
              set_config('app.is_technician', $5, true), set_config('app.can_finance', $6, true)`,
      [
        ctx.userId, ctx.companyId ?? '', ctx.customerId ?? '', String(ctx.isInternal), String(ctx.isTechnician),
        String(ctx.permissions.has('finance.referral.view')),
      ],
    );
    await client.query('set local role aiec_app');
  }, fn);
}

/** Trusted server-side transaction (sign-in, public enquiry intake, webhooks, seeding). Bypasses RLS. */
export function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return run(null, fn);
}
