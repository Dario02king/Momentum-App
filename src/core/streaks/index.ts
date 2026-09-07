import type { DateKey, WeekKey } from '../dates';

/**
 * Streaks (§16).
 *
 * Tracked only where they describe behaviour meaningfully: consecutive
 * completed daily check-ins, and consecutive weeks the training target was
 * met. A domain does not get a streak merely because it has data.
 *
 * The best streak never disappears, including after the current one breaks.
 */

export interface Streak {
  current: number;
  best: number;
}

const EMPTY: Streak = { current: 0, best: 0 };

export interface StreakDay {
  date: DateKey;
  /** Every due item answered. */
  complete: boolean;
  /** Whether the day counts at all — a neutral or open day is skipped. */
  counts: boolean;
}

/**
 * Consecutive completed check-ins.
 *
 * Days that were never asked about, and days still inside the edit window,
 * neither extend nor break a streak: they are simply not part of the run.
 */
export function mentalStreak(days: StreakDay[]): Streak {
  let current = 0;
  let best = 0;
  for (const day of days) {
    if (!day.counts) continue;
    if (day.complete) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return { current, best };
}

export interface StreakWeek {
  weekKey: WeekKey;
  met: boolean;
  /** A week still running cannot have broken the streak yet. */
  inProgress: boolean;
}

/**
 * Consecutive weeks the target was met.
 *
 * The week in progress can extend the streak once its target is met, but
 * cannot break it before it has finished — the user still has days left.
 */
export function sportsStreak(weeks: StreakWeek[]): Streak {
  let current = 0;
  let best = 0;
  for (const week of weeks) {
    if (week.met) {
      current += 1;
      best = Math.max(best, current);
    } else if (!week.inProgress) {
      current = 0;
    }
  }
  return { current, best };
}

export const NO_STREAK = EMPTY;
