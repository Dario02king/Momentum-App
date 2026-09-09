import { PAUSE } from '../config/constants';
import { compareDateKeys, diffInDays, type DateKey } from '../dates';
import type { PausePeriodRecord } from '../model';

/**
 * Pause periods — **the one place a date is judged paused.**
 *
 * A pause is a temporary suspension of *inactivity penalties*, declared by the
 * user for a holiday, an illness, an injury or any other stretch where keeping
 * the app's ordinary rhythm is unreasonable. Everything about it follows from
 * three sentences, and each of them is a rule the code has to hold:
 *
 * 1. **It suspends penalties for absence. It is not a scoring freeze.** The
 *    app keeps working: a day logged inside a pause is stored, scored, and
 *    earns exactly the XP and rating movement it would have earned outside
 *    one. A pause protects against what the user *did not* do, never against
 *    what they did.
 * 2. **It freezes the inactivity clock; it does not reset it.** Five silent
 *    days, then a fortnight paused, then another silent day: that day is the
 *    sixth of the episode, not the first. Otherwise a one-day pause would be
 *    a reset button held just short of every decay threshold.
 * 3. **It is prospective.** The earliest permitted start is today, and a day
 *    already lived can never be reclassified. A user cannot watch decay
 *    happen and then backdate a pause to undo it.
 *
 * This module is pure. It knows nothing about storage, and every caller —
 * the replay, the services, the screens — asks it rather than re-deriving
 * date overlap, which is exactly the sort of arithmetic that goes subtly
 * different in a second copy.
 */

/** A pause covers `from` and `to` inclusive. `to: null` is open-ended. */
export function coversDate(pause: PausePeriodRecord, date: DateKey): boolean {
  if (compareDateKeys(date, pause.from) < 0) return false;
  return pause.to === null || compareDateKeys(date, pause.to) <= 0;
}

export function overlapsRange(pause: PausePeriodRecord, from: DateKey, to: DateKey): boolean {
  if (compareDateKeys(pause.from, to) > 0) return false;
  return pause.to === null || compareDateKeys(pause.to, from) >= 0;
}

/** Whether any of these pauses covers the date. */
export function isPausedOn(
  pauses: readonly PausePeriodRecord[],
  date: DateKey,
): boolean {
  return pauses.some((pause) => coversDate(pause, date));
}

/**
 * A paused flag for each date, as one pass rather than a scan per day.
 *
 * The replay walks two years of dates and there is no reason for that to be
 * quadratic in the number of pauses — the same shape D73 already removed once
 * from the week lookup.
 */
export function pausedFlags(
  pauses: readonly PausePeriodRecord[],
  dates: readonly DateKey[],
): boolean[] {
  if (pauses.length === 0) return dates.map(() => false);
  const sorted = [...pauses].sort((a, b) => compareDateKeys(a.from, b.from));
  return dates.map((date) => sorted.some((pause) => coversDate(pause, date)));
}

/** Length in whole calendar days, inclusive of both ends. */
export function pauseLengthDays(from: DateKey, to: DateKey): number {
  return diffInDays(from, to) + 1;
}

/* ── Validation ─────────────────────────────────────────────────────────── */

export type PauseProblem =
  | 'startInPast'
  | 'endBeforeStart'
  | 'endMissing'
  | 'tooLong'
  | 'overlaps'
  | 'alreadyBegun'
  | 'endsInPast'
  | 'extendsBeyondOriginal'
  | 'notFound';

export interface PauseDraft {
  from: DateKey;
  /** Required in every normal product flow — an open-ended pause is not offered. */
  to: DateKey | null;
  reason?: string | null;
}

/**
 * Whether a draft may be stored, and why not if it may not.
 *
 * The rules are deliberately all here rather than spread between a form and a
 * service: a screen can then show the same reason the write would have given,
 * and there is one answer to "is this allowed" instead of two that can drift.
 */
export function validateDraft(
  draft: PauseDraft,
  existing: readonly PausePeriodRecord[],
  today: DateKey,
  ignoreId?: string,
): PauseProblem | null {
  if (draft.to === null) return 'endMissing';
  if (compareDateKeys(draft.from, today) < 0) return 'startInPast';
  if (compareDateKeys(draft.to, draft.from) < 0) return 'endBeforeStart';
  if (pauseLengthDays(draft.from, draft.to) > PAUSE.MAX_DAYS) return 'tooLong';

  const clashes = existing.some(
    (pause) =>
      pause.id !== ignoreId &&
      (pause.to === null
        ? compareDateKeys(pause.from, draft.to as DateKey) <= 0
        : compareDateKeys(pause.from, draft.to as DateKey) <= 0 &&
          compareDateKeys(pause.to, draft.from) >= 0),
  );
  return clashes ? 'overlaps' : null;
}

/** Where a pause stands relative to today — what a screen shows and offers. */
export type PauseStanding = 'upcoming' | 'active' | 'past';

export function standingOf(pause: PausePeriodRecord, today: DateKey): PauseStanding {
  if (compareDateKeys(today, pause.from) < 0) return 'upcoming';
  if (pause.to !== null && compareDateKeys(today, pause.to) > 0) return 'past';
  return 'active';
}

/**
 * Whether a pause may still be edited or deleted outright.
 *
 * Only one that has not begun. Once a pause is running, the days it has
 * already covered are lived days, and moving it would reclassify them — the
 * one thing a prospective-only rule exists to forbid.
 */
export function isEditable(pause: PausePeriodRecord, today: DateKey): boolean {
  return standingOf(pause, today) === 'upcoming';
}

/**
 * The earliest a running pause may be made to end.
 *
 * Today, never earlier: ending it "from yesterday" would un-pause a day the
 * user already lived through, which is the retroactive rewrite the rule
 * forbids. Ending it today leaves today as the final paused day.
 */
export function earliestEndFor(pause: PausePeriodRecord, today: DateKey): DateKey {
  return compareDateKeys(pause.from, today) > 0 ? pause.from : today;
}

export function validateEndEarly(
  pause: PausePeriodRecord,
  newEnd: DateKey,
  today: DateKey,
): PauseProblem | null {
  if (standingOf(pause, today) === 'past') return 'alreadyBegun';
  if (compareDateKeys(newEnd, earliestEndFor(pause, today)) < 0) return 'endsInPast';
  if (compareDateKeys(newEnd, pause.from) < 0) return 'endBeforeStart';
  // Ending early may only shorten. Lengthening is a new decision about days
  // that are not yet lived, and goes through the ordinary edit rules.
  if (pause.to !== null && compareDateKeys(newEnd, pause.to) > 0) return 'extendsBeyondOriginal';
  return null;
}
