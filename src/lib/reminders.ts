// Pure helpers for the scheduled reminders (spec 13). No I/O.

/**
 * Alerts for something that expires are sent once per threshold (for example 30, 7 and 1 days before).
 * Returns the smallest threshold that has been reached, or null while it is still further away than
 * the largest threshold, or when it has already expired (expiry is handled by its own sweep).
 */
export function expiryBucket(daysLeft: number, thresholds: readonly number[]): number | null {
  if (daysLeft < 0) return null;
  const reached = thresholds.filter((t) => daysLeft <= t);
  return reached.length ? Math.min(...reached) : null;
}

/** Whole days from `from` to `to` (YYYY-MM-DD calendar dates). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86_400_000);
}

/**
 * Maintenance visits an AMC contract should have had by `today`. The visits for the whole term
 * (visits per year scaled to the term, at least one) are spread evenly and rounded down, so a visit
 * becomes due once its share of the term has fully elapsed and all of them are due at the term end.
 */
export function amcVisitsExpected(visitsPerYear: number, startsOn: string, endsOn: string, today: string): number {
  const termDays = daysBetween(startsOn, endsOn);
  if (termDays <= 0 || today <= startsOn) return 0;
  const elapsed = Math.min(daysBetween(startsOn, today), termDays);
  const totalVisits = Math.max(1, Math.round((visitsPerYear * termDays) / 365.25));
  return Math.floor((totalVisits * elapsed) / termDays);
}
