import { EDIT_WINDOW_DAYS } from '../config/constants';
import { addDays, daysBetween, diffInDays } from './dateKey';
import type { DateKey } from './types';

/**
 * Lifecycle of a past day, used by scoring and by the history UI.
 *
 * - `future`  — not reachable yet.
 * - `open`    — today, or within the edit window: still correctable, so it is
 *               never counted as missed and never enters an average.
 * - `closed`  — past the edit window: read-only, and anything left unanswered
 *               now counts as missed.
 */
export type DayEditState = 'future' | 'open' | 'closed';

export function dayEditState(
  day: DateKey,
  today: DateKey,
  windowDays: number = EDIT_WINDOW_DAYS,
): DayEditState {
  const age = diffInDays(day, today);
  if (age < 0) return 'future';
  if (age <= windowDays) return 'open';
  return 'closed';
}

/** Daily check-in data may be written or corrected for today and the three
 *  preceding days. Everything older is read-only. */
export function isEditableDay(
  day: DateKey,
  today: DateKey,
  windowDays: number = EDIT_WINDOW_DAYS,
): boolean {
  return dayEditState(day, today, windowDays) === 'open';
}

/** The days a user may currently edit, oldest first. */
export function editableDays(today: DateKey, windowDays: number = EDIT_WINDOW_DAYS): DateKey[] {
  return daysBetween(addDays(today, -windowDays), today);
}

/** The oldest day still editable. */
export function oldestEditableDay(
  today: DateKey,
  windowDays: number = EDIT_WINDOW_DAYS,
): DateKey {
  return addDays(today, -windowDays);
}
