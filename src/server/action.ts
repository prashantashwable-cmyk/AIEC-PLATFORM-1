import 'server-only';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import type { ActionResult } from '@/components/ui/form';
import type { TParams } from '@/i18n';
import { AppError } from '@/lib/errors';
import { getSessionUser } from './auth';
import type { Ctx } from './ctx';

export type { ActionResult };
type Ok = { message?: string; params?: TParams; redirect?: string } | void;

/** FormData → plain object. Empty strings and empty files are treated as "not provided". */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith('$ACTION')) continue;
    const values = formData.getAll(key).filter((v) => (typeof v === 'string' ? v.trim() !== '' : v.size > 0));
    if (key.endsWith('[]')) out[key.slice(0, -2)] = values;
    else if (values.length) out[key] = values[values.length - 1];
  }
  return out;
}

function issueCode(issue: z.core.$ZodIssue): string {
  if (/^[A-Z_]+$/.test(issue.message)) return issue.message;
  if (issue.code === 'invalid_type' && /received undefined/.test(issue.message)) return 'REQUIRED';
  if (issue.code === 'too_big') return 'TOO_LONG';
  return 'INVALID';
}

function toResult(error: unknown): ActionResult {
  if (error instanceof AppError) return { ok: false, error: error.code, params: error.params, fieldErrors: error.fieldErrors };
  console.error('[action] unexpected error', error);
  return { ok: false, error: 'UNKNOWN' };
}

async function execute<S extends z.ZodType>(schema: S, formData: FormData, handler: (input: z.infer<S>) => Promise<Ok>): Promise<ActionResult> {
  const parsed = schema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? '_');
      fieldErrors[field] ??= issueCode(issue);
    }
    return { ok: false, error: 'VALIDATION', fieldErrors };
  }
  try {
    const result = await handler(parsed.data);
    revalidatePath('/', 'layout');
    return { ok: true, ...(result ?? {}) };
  } catch (error) {
    return toResult(error);
  }
}

/** Server action for signed-in users: validates input, then calls the handler with the session context. */
export async function runAction<S extends z.ZodType>(
  schema: S, formData: FormData, handler: (input: z.infer<S>, ctx: Ctx) => Promise<Ok>,
): Promise<ActionResult> {
  const ctx = await getSessionUser();
  if (!ctx) return { ok: false, error: 'UNAUTHENTICATED' };
  return execute(schema, formData, (input) => handler(input, ctx));
}

/** Server action that does not require a session (enquiry form, sign-in). */
export async function runPublicAction<S extends z.ZodType>(
  schema: S, formData: FormData, handler: (input: z.infer<S>) => Promise<Ok>,
): Promise<ActionResult> {
  return execute(schema, formData, handler);
}
