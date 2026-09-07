import { XP } from '../config/constants';

/**
 * Lifetime XP (§14).
 *
 * Total accumulated activity, and a different question from the rating: it
 * answers "how much have I done", never "how am I doing now". It is awarded
 * for turning up — completed check-ins, logged sessions, weekly targets met
 * — so it rises with effort rather than with performance.
 *
 * No negative XP, no currency, no loot boxes, nothing purchasable. It is not
 * spendable and it does not drive the rank.
 */

export interface XpDay {
  /** Items actually answered that day. */
  answeredItems: number;
  /** Every due item answered. */
  complete: boolean;
  /** A day that counts at all — neutral and open days award nothing yet. */
  counts: boolean;
}

export interface XpWeek {
  sessions: number;
  met: boolean;
  /** A week still running has not earned its target bonus yet. */
  inProgress: boolean;
}

/**
 * Derived by replay, like everything else.
 *
 * It is monotonic in history: appending days can only ever add. The one way
 * a total moves down is a user correcting a day still inside the edit window
 * — undoing an answer they had recorded — which is the correction working,
 * not XP being taken away.
 */
export function computeXp(days: XpDay[], weeks: XpWeek[]): number {
  let total = 0;
  for (const day of days) {
    if (!day.counts) continue;
    total += Math.max(0, day.answeredItems) * XP.PER_ANSWERED_ITEM;
    if (day.complete) total += XP.PER_COMPLETED_DAY;
  }
  for (const week of weeks) {
    total += Math.max(0, week.sessions) * XP.PER_SPORTS_SESSION;
    if (week.met && !week.inProgress) total += XP.PER_WEEKLY_TARGET_MET;
  }
  return Math.max(0, Math.round(total));
}
