import { TRAINING_RATING } from '../config/constants';
import type { WeekKey } from '../dates';

/**
 * The Endurance Phase — the gate on a new Gym user's **first promotion**.
 *
 * A rank should mean the user turned up for a while, and four weeks of that
 * cannot be demonstrated in four days. So a new Gym user starts here, and
 * their first rank promotion waits until they have shown it.
 *
 * ## What it does and does not gate
 *
 * It gates **rank promotion, and nothing else.** Performance is computed from
 * the second comparable training onwards, the rating calculates and moves
 * normally, every screen shows real numbers, and history replays exactly as
 * it will after the unlock. What is withheld is the promotion itself. That
 * separation is deliberate: gating the arithmetic would mean the user's first
 * month of work simply did not exist, and it would have to be invented back
 * afterwards.
 *
 * ## Progress, which is a balance rather than a streak
 *
 * ```
 *   a completed week that met the target   +1.0
 *   a completed week that missed it        −0.5
 *   floor                                   0
 *   unlock at                               4.0
 * ```
 *
 * A miss costs half a week, not the whole balance. Resetting to zero after a
 * single bad week would make the gate a streak, and this app does not demote
 * anyone for one bad day or one bad week — the same rule, one level up. The
 * worked example from the specification:
 *
 * ```
 *   week 1 met      1.0
 *   week 2 met      2.0
 *   week 3 missed   1.5
 *   week 4 met      2.5   ← four weeks in, still not unlocked
 * ```
 *
 * which is the point: **28 days elapsing is not the requirement.** Four net
 * weeks of actually training is.
 *
 * Once the balance reaches 4.0 the gate is **permanently** complete. It is
 * not re-earned, not lost by a later bad month, and it awards nothing — no
 * bonus rating, no jump. Ordinary rank logic and the existing hysteresis take
 * over from that moment, and the rating the user has been building all along
 * is simply allowed to show.
 */

export interface EnduranceWeek {
  weekKey: WeekKey;
  /** Sessions logged in the week, against the target in force that week. */
  sessions: number;
  target: number;
  /** A week still running cannot have missed anything yet, so it is skipped. */
  inProgress: boolean;
}

export interface EnduranceProgressPoint {
  weekKey: WeekKey;
  met: boolean;
  /** The balance after this week, floored at zero. */
  progress: number;
  /** True from the first week the balance reached the requirement. */
  unlocked: boolean;
}

export interface EnduranceState {
  /** Net weeks accumulated, floored at zero. */
  progress: number;
  required: number;
  /** True once the requirement has ever been reached. Never goes back. */
  unlocked: boolean;
  /** The week it was reached in, or `null` while the gate is still closed. */
  unlockedAt: WeekKey | null;
  /** Whole weeks still to earn, for the interface to state plainly. */
  remaining: number;
  /** One point per completed week, for a progress list and for tests. */
  points: EnduranceProgressPoint[];
}

/**
 * Walks the completed weeks and reports where the gate stands.
 *
 * Only completed weeks count. The week in progress has not failed at
 * anything yet, and counting it as a miss would penalise a user for opening
 * the app on a Tuesday.
 */
export function enduranceState(weeks: readonly EnduranceWeek[]): EnduranceState {
  const required = TRAINING_RATING.ENDURANCE_WEEKS_REQUIRED;
  const points: EnduranceProgressPoint[] = [];
  let progress = 0;
  let unlockedAt: WeekKey | null = null;

  for (const week of weeks) {
    if (week.inProgress) continue;
    const met = week.sessions >= Math.max(1, week.target);
    progress = Math.max(
      0,
      progress + (met ? TRAINING_RATING.ENDURANCE_WEEK_MET : TRAINING_RATING.ENDURANCE_WEEK_MISSED),
    );
    // Reached once is reached for good: the flag is latched here rather than
    // recomputed from the final balance, so a later bad month cannot close a
    // gate the user has already walked through.
    if (unlockedAt === null && progress >= required) unlockedAt = week.weekKey;
    points.push({ weekKey: week.weekKey, met, progress, unlocked: unlockedAt !== null });
  }

  return {
    progress,
    required,
    unlocked: unlockedAt !== null,
    unlockedAt,
    remaining: Math.max(0, required - progress),
    points,
  };
}
