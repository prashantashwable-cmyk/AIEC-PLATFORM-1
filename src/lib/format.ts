import type { Locale } from './enums';

// Latin digits are kept in every language so that amounts, phone numbers and
// reference numbers read identically on screen, on invoices and in bank records.
const INTL: Record<Locale, string> = { en: 'en-IN', hi: 'hi-IN-u-nu-latn', mr: 'mr-IN-u-nu-latn' };
// Amounts always use Indian digit grouping (₹6,00,000) and Latin digits, whatever the UI language.
const NUMBERS = 'en-IN';
const TZ = 'Asia/Kolkata';

/** Current time in milliseconds. Kept outside components so that rendering code stays free of direct clock reads. */
export function nowMs(): number {
  return Date.now();
}

export function formatINR(value: string | number | null | undefined, _locale: Locale = 'en'): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(NUMBERS, {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(n);
}

export function formatNumber(value: string | number | null | undefined, _locale: Locale = 'en'): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat(NUMBERS).format(n) : '—';
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  // Plain dates (YYYY-MM-DD) are calendar dates, not instants: pin them to noon UTC.
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: Date | string | null | undefined, locale: Locale = 'en'): string {
  const d = toDate(value);
  return d ? new Intl.DateTimeFormat(INTL[locale], { dateStyle: 'medium', timeZone: TZ }).format(d) : '—';
}

export function formatDateTime(value: Date | string | null | undefined, locale: Locale = 'en'): string {
  const d = toDate(value);
  return d ? new Intl.DateTimeFormat(INTL[locale], { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(d) : '—';
}

/** YYYY-MM-DD in India time, for <input type="date"> defaults and date comparisons. */
export function isoDateIST(value: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
