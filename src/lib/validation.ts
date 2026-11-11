import { z } from 'zod';
import { normalizePhone } from './phone';

// Validation messages are error codes that map to `err.<CODE>` translations.
export const zText = (max = 200) => z.string({ error: 'REQUIRED' }).trim().min(1, 'REQUIRED').max(max, 'TOO_LONG');
export const zOptText = (max = 2000) => z.string().trim().max(max, 'TOO_LONG').optional();
export const zUuid = z.string({ error: 'REQUIRED' }).uuid('INVALID');
export const zOptUuid = z.string().uuid('INVALID').optional();
export const zPhone = z.string({ error: 'REQUIRED' }).transform((value, ctx) => {
  const phone = normalizePhone(value);
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'INVALID_PHONE' });
    return z.NEVER;
  }
  return phone;
});
/** Money stays a decimal string end-to-end (PostgreSQL numeric); never a float. */
export const zMoney = z.string({ error: 'REQUIRED' }).trim().regex(/^\d{1,11}(\.\d{1,2})?$/, 'INVALID_AMOUNT');
export const zOptMoney = zMoney.optional();
export const zDate = z.string({ error: 'REQUIRED' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'INVALID_DATE');
export const zOptDate = zDate.optional();
export const zDateTime = z.string({ error: 'REQUIRED' }).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'INVALID_DATE');
export const zBool = z.preprocess((v) => v === true || v === 'on' || v === 'true' || v === '1', z.boolean());
export const zInt = (min: number, max: number) => z.coerce.number({ error: 'REQUIRED' }).int('INVALID').min(min, 'INVALID').max(max, 'INVALID');
export const zOptInt = (min: number, max: number) => zInt(min, max).optional();
export const zNumber = (min: number, max: number) => z.coerce.number({ error: 'REQUIRED' }).min(min, 'INVALID').max(max, 'INVALID');
export const zEnum = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values, { error: 'REQUIRED' });
export const zFile = z.instanceof(File).optional();

/** <input type="datetime-local"> values are India wall-clock time. */
export function istLocalToDate(value: string): Date {
  return new Date(`${value.slice(0, 16)}:00+05:30`);
}
