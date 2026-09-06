import { addDays, diffInDays, isValidDateKey, toDateKey, weekdayIndex, daysBetween } from './dateKey';
import type { DateKey, WeekKey } from './types';

const WEEK_KEY_PATTERN = /^(\d{4})-W(\d{2})$/;

/** Monday of the week containing `key`. Weeks run Monday to Sunday. */
export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, -weekdayIndex(key));
}

/** Sunday of the week containing `key`. */
export function endOfWeek(key: DateKey): DateKey {
  return addDays(startOfWeek(key), 6);
}

/** All seven days of the week containing `key`, Monday first. */
export function daysOfWeek(key: DateKey): DateKey[] {
  const start = startOfWeek(key);
  return daysBetween(start, addDays(start, 6));
}

/**
 * The ISO-8601 week key for a day, e.g. `2025-W01`.
 *
 * The week-year is not always the calendar year: 2024-12-30 belongs to
 * 2025-W01, and 2027-01-01 belongs to 2026-W53.
 */
export function weekKeyOf(key: DateKey): WeekKey {
  // The Thursday of an ISO week always falls in that week's week-year.
  const thursday = addDays(startOfWeek(key), 3);
  const weekYear = Number(thursday.slice(0, 4));
  const firstThursday = addDays(startOfWeek(`${String(weekYear).padStart(4, '0')}-01-04`), 3);
  const week = 1 + diffInDays(firstThursday, thursday) / 7;
  return `${String(weekYear).padStart(4, '0')}-W${String(week).padStart(2, '0')}`;
}

export function isValidWeekKey(value: unknown): value is WeekKey {
  if (typeof value !== 'string') return false;
  const match = WEEK_KEY_PATTERN.exec(value);
  if (!match) return false;
  const week = Number(match[2]);
  if (week < 1 || week > 53) return false;
  // Week 53 only exists in long years; round-tripping proves it.
  return weekKeyOf(startOfWeekKey(value)) === value;
}

/** Monday of a week key. */
export function startOfWeekKey(weekKey: WeekKey): DateKey {
  const match = WEEK_KEY_PATTERN.exec(weekKey);
  if (!match) throw new Error(`Invalid week key: ${weekKey}`);
  const weekYear = Number(match[1]);
  const week = Number(match[2]);
  const firstMonday = startOfWeek(`${String(weekYear).padStart(4, '0')}-01-04`);
  return addDays(firstMonday, (week - 1) * 7);
}

/** Inclusive Monday-to-Sunday range of a week key. */
export function weekRange(weekKey: WeekKey): { start: DateKey; end: DateKey } {
  const start = startOfWeekKey(weekKey);
  return { start, end: addDays(start, 6) };
}

export function addWeeks(weekKey: WeekKey, weeks: number): WeekKey {
  return weekKeyOf(addDays(startOfWeekKey(weekKey), weeks * 7));
}

/** Whole weeks from `from` to `to`; negative when `to` precedes `from`. */
export function diffInWeeks(from: WeekKey, to: WeekKey): number {
  return diffInDays(startOfWeekKey(from), startOfWeekKey(to)) / 7;
}

export function isSameWeek(a: DateKey, b: DateKey): boolean {
  return startOfWeek(a) === startOfWeek(b);
}

/**
 * Days left in `key`'s week, counting `key` itself. Monday = 7, Sunday = 1.
 * Lets a weekly target say how much of the week is still available.
 */
export function remainingDaysInWeek(key: DateKey): number {
  return 7 - weekdayIndex(key);
}

/** The week a `Date` instant belongs to, in local time. */
export function weekKeyOfDate(date: Date): WeekKey {
  return weekKeyOf(toDateKey(date));
}

export function assertDateKey(value: unknown): DateKey {
  if (!isValidDateKey(value)) throw new Error(`Invalid date key: ${String(value)}`);
  return value;
}
