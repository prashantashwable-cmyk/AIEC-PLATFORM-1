import 'server-only';
import { notFound } from 'next/navigation';
import { getT } from '@/i18n/server';
import { AppError } from '@/lib/errors';
import { requirePortal } from './auth';
import type { Portal } from './ctx';

/** Standard page preamble: workspace guard plus translator. */
export async function pageCtx(portal: Portal) {
  const ctx = await requirePortal(portal);
  const { t, locale } = await getT();
  return { ctx, t, locale };
}

/** Runs a read; missing or forbidden records render the not-found page instead of leaking existence. */
export async function load<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError && (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN')) notFound();
    throw error;
  }
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export async function readParams(searchParams: SearchParams): Promise<Record<string, string>> {
  const raw = await searchParams;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v) out[key] = v;
  }
  return out;
}
export function withParams(path: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value));
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
export const isUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
