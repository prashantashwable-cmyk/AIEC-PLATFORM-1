// Working-time arithmetic for the operational SLA targets (spec 13).
// Working week: Monday–Saturday, 10:00–18:00 India time. Holidays are configurable (YYYY-MM-DD).

const IST_OFFSET_MIN = 330;
const START_HOUR = 10;
const END_HOUR = 18;

type Wall = { y: number; m: number; d: number; minutes: number; dow: number };

function toWall(date: Date): Wall {
  const shifted = new Date(date.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(), dow: shifted.getUTCDay(),
  };
}
function fromWall(y: number, m: number, d: number, minutes: number): Date {
  return new Date(Date.UTC(y, m, d, 0, minutes) - IST_OFFSET_MIN * 60_000);
}
function dayKey(w: { y: number; m: number; d: number }): string {
  return `${w.y}-${String(w.m + 1).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}
function isWorkingDay(w: Wall, holidays: ReadonlySet<string>): boolean {
  return w.dow !== 0 && !holidays.has(dayKey(w));
}

/** Moves forward to the next instant that falls inside working hours. */
function nextWorkingInstant(date: Date, holidays: ReadonlySet<string>): Date {
  let current = date;
  for (let guard = 0; guard < 400; guard++) {
    const w = toWall(current);
    if (isWorkingDay(w, holidays)) {
      if (w.minutes < START_HOUR * 60) return fromWall(w.y, w.m, w.d, START_HOUR * 60);
      if (w.minutes < END_HOUR * 60) return current;
    }
    current = fromWall(w.y, w.m, w.d + 1, START_HOUR * 60);
  }
  return current;
}

export function addWorkingHours(from: Date, hours: number, holidays: readonly string[] = []): Date {
  const set = new Set(holidays);
  let remaining = Math.round(hours * 60);
  let current = nextWorkingInstant(from, set);
  while (remaining > 0) {
    const w = toWall(current);
    const available = END_HOUR * 60 - w.minutes;
    if (remaining <= available) return new Date(current.getTime() + remaining * 60_000);
    remaining -= available;
    current = nextWorkingInstant(fromWall(w.y, w.m, w.d + 1, START_HOUR * 60), set);
  }
  return current;
}

/** End of the Nth working day after `from` (the day of `from` is not counted). */
export function addWorkingDays(from: Date, days: number, holidays: readonly string[] = []): Date {
  const set = new Set(holidays);
  let w = toWall(from);
  let left = days;
  let cursor = from;
  while (left > 0) {
    cursor = fromWall(w.y, w.m, w.d + 1, END_HOUR * 60);
    w = toWall(cursor);
    if (isWorkingDay(w, set)) left--;
  }
  return cursor;
}
