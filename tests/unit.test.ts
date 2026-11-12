import { describe, expect, it } from 'vitest';
import { addMoney, commissionFor, fromPaise, percentOf, rateToE4, toPaise } from '@/lib/commission';
import { compareLeads, isLikelyDuplicate, similarity } from '@/lib/duplicates';
import { AppError } from '@/lib/errors';
import { formatINR } from '@/lib/format';
import { DEFAULT_WEIGHTS, eligibility, score, type PartnerFacts } from '@/lib/matching';
import { displayPhone, normalizePhone } from '@/lib/phone';
import { addWorkingDays, addWorkingHours } from '@/lib/sla';
import { LEAD_MACHINE, ORDER_MACHINE, PROJECT_MACHINE, REFERRAL_MACHINE, assertTransition, canTransition } from '@/lib/state';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '@/lib/permissions';
import { THEMES, DEFAULT_THEME } from '@/lib/themes';
import { en } from '@/i18n/messages/en';
import { hi } from '@/i18n/messages/hi';
import { mr } from '@/i18n/messages/mr';
import { scan } from '../scripts/i18n-scan';

describe('commission arithmetic (spec 7)', () => {
  it('reproduces the specification example: 2% of each milestone of a ₹6,00,000 order', () => {
    const collections = ['60000', '180000', '180000', '150000', '30000'];
    const commissions = collections.map((c) => commissionFor(c, '2.0000'));
    expect(commissions).toEqual(['1200.00', '3600.00', '3600.00', '3000.00', '600.00']);
    expect(addMoney(...commissions)).toBe('12000.00');
  });
  it('uses integer paise and rounds half away from zero', () => {
    expect(toPaise('0.1') + toPaise('0.2')).toBe(30n);
    expect(commissionFor('33.33', '2')).toBe('0.67'); // 0.6666 → 0.67
    expect(commissionFor('25', '2.5')).toBe('0.63'); // 0.625 → 0.63
    expect(fromPaise(percentOf(-250000n, rateToE4('2')))).toBe('-50.00');
    expect(commissionFor('0', '2')).toBe('0.00');
  });
  it('rejects malformed money instead of guessing', () => {
    expect(() => toPaise('12.345')).toThrow();
    expect(() => toPaise('abc')).toThrow();
    expect(() => rateToE4('-1')).toThrow();
  });
});

describe('state machines (spec 5.1, 6.3, 8.5)', () => {
  it('follows the lead lifecycle in order and rejects skipping steps', () => {
    const path = ['NEW', 'CONTACTED', 'QUALIFIED', 'SURVEY_PENDING', 'SURVEY_COMPLETED', 'PARTNER_MATCHING', 'QUOTATION_PENDING', 'QUOTATION_RECEIVED',
      'CUSTOMER_REVIEW', 'SELECTED', 'ORDER_PENDING', 'CONFIRMED'] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(LEAD_MACHINE, path[i], path[i + 1])).toBe(true);
    expect(canTransition(LEAD_MACHINE, 'NEW', 'QUALIFIED')).toBe(false);
    expect(canTransition(LEAD_MACHINE, 'CONTACTED', 'CONFIRMED')).toBe(false);
    expect(() => assertTransition(LEAD_MACHINE, 'NEW', 'SELECTED')).toThrow(AppError);
  });
  it('allows exception states from open leads only', () => {
    expect(canTransition(LEAD_MACHINE, 'QUALIFIED', 'ON_HOLD')).toBe(true);
    expect(canTransition(LEAD_MACHINE, 'CUSTOMER_REVIEW', 'LOST')).toBe(true);
    expect(canTransition(LEAD_MACHINE, 'CONFIRMED', 'LOST')).toBe(false);
  });
  it('cannot confirm an order the partner has not accepted', () => {
    expect(canTransition(ORDER_MACHINE, 'PENDING_PARTNER_ACCEPTANCE', 'CONFIRMED')).toBe(false);
    expect(canTransition(ORDER_MACHINE, 'PARTNER_ACCEPTED', 'CONFIRMED')).toBe(true);
  });
  it('never jumps a project to handover and keeps approved referrals final', () => {
    expect(canTransition(PROJECT_MACHINE, 'IN_PROGRESS', 'HANDED_OVER')).toBe(false);
    expect(canTransition(PROJECT_MACHINE, 'PLANNING', 'STOP_WORK')).toBe(true);
    expect(REFERRAL_MACHINE.APPROVED).toEqual([]);
    expect(canTransition(REFERRAL_MACHINE, 'CONSENT_PENDING', 'REFERRED')).toBe(false);
  });
});

describe('partner matching (spec 5.6)', () => {
  const ok: PartnerFacts = {
    category: 'ELEVATOR_COMPANY', status: 'ACTIVE', safetyBlock: false, licenceDaysLeft: 300, insuranceDaysLeft: 200, capabilityVerified: true,
    capabilityMaxFloors: 12, servesZone: true, maxConcurrentProjects: 3, activeProjects: 1, performanceAvg: null, responseRate: null,
  };
  it('passes a fully compliant partner', () => expect(eligibility(ok, { floors: 5 })).toEqual([]));
  it('applies every hard gate with a reason', () => {
    expect(eligibility({ ...ok, licenceDaysLeft: null }, { floors: 5 })).toContain('LICENCE_INVALID');
    expect(eligibility({ ...ok, insuranceDaysLeft: null }, { floors: 5 })).toContain('INSURANCE_INVALID');
    expect(eligibility({ ...ok, status: 'SUSPENDED' }, { floors: 5 })).toContain('PARTNER_NOT_ACTIVE');
    expect(eligibility({ ...ok, safetyBlock: true }, { floors: 5 })).toContain('SAFETY_BLOCK');
    expect(eligibility({ ...ok, servesZone: false }, { floors: 5 })).toContain('OUT_OF_AREA');
    expect(eligibility({ ...ok, activeProjects: 3 }, { floors: 5 })).toContain('NO_CAPACITY');
    expect(eligibility({ ...ok, capabilityMaxFloors: 4 }, { floors: 5 })).toContain('NO_CAPABILITY');
    expect(eligibility({ ...ok, capabilityVerified: false }, { floors: 5 })).toContain('NO_CAPABILITY');
    expect(eligibility({ ...ok, category: 'SUPPLIER' }, { floors: 5 })).toContain('NOT_LIFT_CONTRACTOR');
  });
  it('produces an explainable score from the configured weights', () => {
    const s = score(ok, { floors: 5 }, DEFAULT_WEIGHTS);
    expect(s).toMatchObject({ compliance: 100, capability: 100, capacity: 67, performance: 60, price: 50, response: 60 });
    expect(s.total).toBeCloseTo((100 * 25 + 100 * 20 + 67 * 20 + 60 * 15 + 50 * 10 + 60 * 10) / 100, 2);
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('duplicate detection (spec 5.3)', () => {
  const base = { phone: '+919000000001', projectName: 'Shriram Residency A-Wing', address: 'Survey 21, Wakad, Pune', zoneId: 'z1', liftCategory: 'PASSENGER_RESIDENTIAL', latitude: 18.6, longitude: 73.76 };
  it('never flags on phone alone or coordinates alone', () => {
    expect(isLikelyDuplicate(compareLeads(base, { ...base, projectName: 'Other Tower', address: 'Baner road', zoneId: 'z2', latitude: null, longitude: null }))).toBe(false);
    expect(isLikelyDuplicate(compareLeads(base, { ...base, phone: '+919000000002', projectName: 'Other Tower', address: 'Elsewhere', zoneId: 'z2' }))).toBe(false);
  });
  it('flags combined signals for review', () => {
    const r = compareLeads(base, { ...base, projectName: 'Shriram Residency A Wing' });
    expect(isLikelyDuplicate(r)).toBe(true);
    expect(r.reasons).toEqual(expect.arrayContaining(['SAME_PHONE', 'SIMILAR_PROJECT_NAME']));
  });
  it('compares Devanagari text too', () => expect(similarity('श्रीराम रेसिडेन्सी ए विंग', 'श्रीराम रेसिडेन्सी विंग')).toBeGreaterThan(0.6));
});

describe('phone, SLA and formatting', () => {
  it('normalises Indian mobile numbers and rejects others', () => {
    expect(normalizePhone('98220 11223')).toBe('+919822011223');
    expect(normalizePhone('+91-9822011223')).toBe('+919822011223');
    expect(normalizePhone('09822011223')).toBe('+919822011223');
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('5822011223')).toBeNull();
    expect(displayPhone('+919822011223')).toBe('+91 98220 11223');
  });
  it('counts only working hours (Mon–Sat, 10:00–18:00 IST)', () => {
    // Wednesday 11 Nov 2026, 16:00 IST + 4 working hours → Thursday 12:00 IST
    expect(addWorkingHours(new Date('2026-11-11T10:30:00Z'), 4).toISOString()).toBe('2026-11-12T06:30:00.000Z');
    // Saturday 17:00 IST + 4h → Monday 13:00 IST (Sunday skipped)
    expect(addWorkingHours(new Date('2026-11-14T11:30:00Z'), 4).toISOString()).toBe('2026-11-16T07:30:00.000Z');
    // A configured holiday is skipped
    expect(addWorkingHours(new Date('2026-11-11T10:30:00Z'), 4, ['2026-11-12']).toISOString()).toBe('2026-11-13T06:30:00.000Z');
    expect(addWorkingDays(new Date('2026-11-14T05:00:00Z'), 1).toISOString()).toBe('2026-11-16T12:30:00.000Z');
  });
  it('formats rupees with Indian grouping in every language', () => {
    for (const locale of ['en', 'hi', 'mr'] as const) expect(formatINR('600000', locale)).toBe('₹6,00,000');
  });
});

describe('roles, themes and translations', () => {
  it('keeps company and customer roles away from staff permissions', () => {
    const staffOnly = ['payment.reconcile', 'commission.adjust', 'partner.activate', 'user.manage', 'audit.view', 'finance.referral.view'];
    for (const role of ['PARTNER_ADMIN', 'PARTNER_SUPERVISOR', 'TECHNICIAN', 'SUPPLIER', 'SERVICE_PARTNER', 'CUSTOMER'] as const) {
      for (const p of staffOnly) expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain(p);
    }
    expect(DEFAULT_ROLE_PERMISSIONS.TECHNICIAN).toEqual(['task.perform', 'evidence.submit']);
    expect(DEFAULT_ROLE_PERMISSIONS.SALES_EXEC).not.toContain('payment.reconcile');
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });
  it('defines ten themes including the default', () => {
    expect(THEMES).toHaveLength(10);
    expect(THEMES.some((t) => t.id === DEFAULT_THEME)).toBe(true);
  });
  it('has identical keys and placeholders in English, Hindi and Marathi, with no empty text', () => {
    const flatten = (node: unknown, prefix = ''): Record<string, string> =>
      typeof node === 'string' ? { [prefix]: node } : Object.assign({}, ...Object.entries(node as object).map(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k)));
    const E = flatten(en); const H = flatten(hi); const M = flatten(mr);
    expect(Object.keys(H).sort()).toEqual(Object.keys(E).sort());
    expect(Object.keys(M).sort()).toEqual(Object.keys(E).sort());
    const vars = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort().join(',');
    for (const key of Object.keys(E)) {
      expect(H[key].trim().length, `hi ${key}`).toBeGreaterThan(0);
      expect(M[key].trim().length, `mr ${key}`).toBeGreaterThan(0);
      expect(vars(H[key]), `hi placeholders ${key}`).toBe(vars(E[key]));
      expect(vars(M[key]), `mr placeholders ${key}`).toBe(vars(E[key]));
    }
  });
  it('translates the application screens, not just copies English', () => {
    const sample = ['nav.leads', 'a.confirmOrder', 'p.dashboard.title', 'err.FORBIDDEN', 'e.leadStatus.NEW', 'landing.heroTitle'];
    const get = (obj: unknown, key: string) => key.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], obj);
    for (const key of sample) { expect(get(hi, key)).not.toBe(get(en, key)); expect(get(mr, key)).not.toBe(get(en, key)); }
  });
  it('has a translation for every key, error code and notification used in the source', () => {
    expect(scan('src').missing).toEqual([]);
  });
});
