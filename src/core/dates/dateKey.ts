import type { DateKey, WeekdayIndex } from './types';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** Formats a `Date` as the local calendar day it falls on. */
export function toDateKey(date: Date): DateKey {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local calendar day `now` falls on. */
export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now);
}

export function isValidDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Reject non-existent days such as 2025-02-30, which `Date` would roll over.
  return toDateKey(new Date(y, m - 1, d, 12)) === value;
}

function parts(key: DateKey): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return [y, m, d];
}

/**
 * Local *midday* for a day key. Midday, not midnight, is the anchor for all
 * arithmetic: in time zones where DST skips local midnight, `new Date(y, m, d)`
 * silently lands on the previous or next day. 12:00 is never skipped.
 */
export function middayOf(key: DateKey): Date {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/**
 * The first instant of a local day.
 *
 * Usually local midnight, but in zones where DST starts at midnight that hour
 * does not exist, so the earliest hour that actually occurs on that day wins.
 */
export function startOfDay(key: DateKey): Date {
  const [y, m, d] = parts(key);
  for (let hour = 0; hour <= 12; hour += 1) {
    const candidate = new Date(y, m - 1, d, hour, 0, 0, 0);
    if (toDateKey(candidate) === key) return candidate;
  }
  return middayOf(key);
}

/** The first instant of the *following* day; use as an exclusive upper bound. */
export function endOfDayExclusive(key: DateKey): Date {
  return startOfDay(addDays(key, 1));
}

/** Adds (or with a negative `days`, subtracts) calendar days. DST-safe. */
export function addDays(key: DateKey, days: number): DateKey {
  const anchor = middayOf(key);
  anchor.setDate(anchor.getDate() + days);
  return toDateKey(anchor);
}

/**
 * Whole calendar days from `from` to `to`; negative when `to` precedes `from`.
 * Counts day boundaries crossed, so a DST transition in between does not
 * turn 1 day into 0.96.
 */
export function diffInDays(from: DateKey, to: DateKey): number {
  return Math.round((middayOf(to).getTime() - middayOf(from).getTime()) / MS_PER_DAY);
}

export function compareDateKeys(a: DateKey, b: DateKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDateKey(a: DateKey, b: DateKey): DateKey {
  return a <= b ? a : b;
}

export function maxDateKey(a: DateKey, b: DateKey): DateKey {
  return a >= b ? a : b;
}

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(key: DateKey): WeekdayIndex {
  return ((middayOf(key).getDay() + 6) % 7) as WeekdayIndex;
}

/** Every day from `from` to `to` inclusive, ascending. Empty if `to` < `from`. */
export function daysBetween(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  const total = diffInDays(from, to);
  for (let i = 0; i <= total; i += 1) out.push(addDays(from, i));
  return out;
}

/** The last `count` days ending at `end` inclusive, ascending. */
export function lastNDays(end: DateKey, count: number): DateKey[] {
  if (count <= 0) return [];
  return daysBetween(addDays(end, -(count - 1)), end);
}
