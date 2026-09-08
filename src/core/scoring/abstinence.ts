import { TRAINING_DECAY_PHASES, TRAINING_RATING, type TrainingDecayPhaseId } from '../config/constants';
import type { DateKey } from '../dates';
import { diffInDays, middayOf } from '../dates';
import { nextRank, rankById, type Rank } from '../ranks';

/**
 * Inactivity decay for Gym — **within the rank, and nowhere else.**
 *
 * This is not the cooling-off gate. `core/decay` still holds RC2's provisional
 * rating decay behind `DECAY_MODEL_APPROVED`, and that gate is still open.
 * What is defined here is the approved Gym-specific rule, and the two do not
 * meet: a Gym day under the performance model does not feed the per-day
 * rating decay at all, because decaying twice for one absence is exactly the
 * double penalty this rule was written to avoid.
 *
 * ## What triggers it, and what does not
 *
 * **Abstinence is seven consecutive days with no saved Gym session.** Missing
 * the weekly target is *not* abstinence: a user who trained twice against a
 * target of three has trained, their Attendance already says so, and charging
 * them again here would punish partial effort harder than the rule that is
 * already measuring it. One saved session, any day, and the episode is over.
 *
 * Decay starts only after the Endurance Phase is complete. Before that the
 * user has not been promoted anything to lose.
 *
 * ## What it touches
 *
 * Only the **progress the user has made inside the rank they currently hold**:
 *
 * ```
 *   rankProgress = (rating − rankFloor) / (rankCeiling − rankFloor)
 * ```
 *
 * Nothing else moves. Sets, exercise performances, muscle-group figures, the
 * performance percentages, past snapshots and Tombstones are all facts about
 * what happened, and not training this week does not change what happened
 * last March. The user also cannot fall out of their rank through this: the
 * floor is the floor. Losing the rank as well would make a fortnight's
 * holiday cost a tier, and demotion in this app has always needed sustained
 * evidence rather than an absence.
 *
 * ## Cumulative, never compounded
 *
 * Every percentage below is measured against the rank progress held **at the
 * start of the episode**, which is captured once and then left alone. In the
 * 25 %-a-block phase, 80 % of a rank runs
 *
 * ```
 *   80 → 60 → 40 → 20 → 0
 * ```
 *
 * and emphatically not 80 → 60 → 45 → 33.75, which is what applying each
 * step to the remainder would give. Compounding never reaches zero and would
 * make the fourth week of absence cost a quarter of what the first did.
 */

export interface AbstinenceEpisode {
  /** First day with no session — day 1 of the run. */
  from: DateKey;
  /** The most recent abstinent day, which is where the decay is measured to. */
  through: DateKey;
  /** Consecutive abstinent days, inclusive of both ends. */
  days: number;
}

/**
 * Gym training age in **completed whole months**, which is what the schedule
 * phases are keyed on.
 *
 * Calendar months rather than 30-day blocks, so "three months in" means what
 * a user means by it. A day-of-month that does not exist in the later month
 * (the 31st, the 29th of February) counts the month as complete once the
 * month itself has turned, which is the only reading that never stalls.
 */
export function trainingAgeMonths(start: DateKey, on: DateKey): number {
  if (on < start) return 0;
  const a = middayOf(start);
  const b = middayOf(on);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(0, months);
}

export interface TrainingDecayPhase {
  id: TrainingDecayPhaseId;
  fromMonth: number;
  /** Share of the baseline rank progress one full 7-day block removes. */
  perBlock: number;
}

/** Which schedule a user of this training age decays under. */
export function decayPhaseFor(ageMonths: number): TrainingDecayPhase {
  const phases: readonly TrainingDecayPhase[] = TRAINING_DECAY_PHASES;
  let match: TrainingDecayPhase = phases[0]!;
  for (const phase of phases) if (ageMonths >= phase.fromMonth) match = phase;
  return match;
}

/**
 * How much of the baseline rank progress an episode has removed, 0 to 1.
 *
 * One expression covers all four approved schedules, because all four *are*
 * one rule with a different number in it: a full seven-day block removes a
 * fixed share of the baseline, and the total is capped at everything.
 *
 * ```
 *   months 1–2    50 % a block   → 7d 50 %, 14d 100 %
 *   months 3–4    25 % a block   → 7d 25 %, 14d 50 %, 21d 75 %, 28d 100 %
 *   months 5–12   20 % a block   → 7d 20 % … 35d 100 %
 *   month 13+     10 % a block   → 7d 10 % … 70d 100 %
 * ```
 *
 * Blocks are whole: six days is not a block and removes nothing, thirteen
 * days is one block and not one and a bit. Partial credit would make the
 * boundary meaningless and the arithmetic unexplainable.
 */
export function decayFraction(days: number, ageMonths: number): number {
  const blocks = Math.floor(Math.max(0, days) / TRAINING_RATING.ABSTINENCE_BLOCK_DAYS);
  if (blocks <= 0) return 0;
  return Math.min(1, blocks * decayPhaseFor(ageMonths).perBlock);
}

export interface RankInterval {
  floor: number;
  /** The next rank's threshold, or the top of the scale at Legend. */
  ceiling: number;
}

/** The rating interval a rank spans, which is what progress is measured in. */
export function rankInterval(rank: Rank, max: number): RankInterval {
  const next = nextRank(rank);
  return { floor: rank.min, ceiling: next ? next.min : max };
}

/** Where in its rank a rating sits, from 0 to 1. */
export function rankProgressOf(rating: number, interval: RankInterval): number {
  const span = interval.ceiling - interval.floor;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (rating - interval.floor) / span));
}

export interface DecayInput {
  /** The rating when the abstinence episode began. Not today's. */
  baselineRating: number;
  /** The rank held when it began, whose interval the progress is measured in. */
  baselineRank: Rank;
  /** Consecutive abstinent days so far. */
  days: number;
  /** Gym training age in whole months at the start of the episode. */
  ageMonths: number;
  /** The top of the rating scale, for the interval at Legend. */
  max: number;
}

export interface DecayResult {
  /** The rating after the decay, never below the baseline rank's floor. */
  rating: number;
  /** Share of the baseline progress removed, 0 to 1. */
  fraction: number;
  /** Rank progress before and after, for a screen that wants to explain it. */
  progressBefore: number;
  progressAfter: number;
  phase: TrainingDecayPhaseId;
  blocks: number;
}

/**
 * One abstinence episode's effect on the rating.
 *
 * Pure and idempotent in the sense that matters: it is always computed from
 * the *baseline*, so calling it on day 21 gives the same answer whether or
 * not it was called on day 7 and 14. That is what makes the schedule
 * cumulative rather than compounding, and it is why nothing is stored.
 */
export function applyAbstinenceDecay(input: DecayInput): DecayResult {
  const interval = rankInterval(input.baselineRank, input.max);
  const progressBefore = rankProgressOf(input.baselineRating, interval);
  const fraction = decayFraction(input.days, input.ageMonths);
  const progressAfter = progressBefore * (1 - fraction);
  return {
    rating: interval.floor + progressAfter * (interval.ceiling - interval.floor),
    fraction,
    progressBefore,
    progressAfter,
    phase: decayPhaseFor(input.ageMonths).id,
    blocks: Math.floor(Math.max(0, input.days) / TRAINING_RATING.ABSTINENCE_BLOCK_DAYS),
  };
}

/**
 * The current run of days with no saved session, ending on `on`.
 *
 * `null` when a session was logged today — an episode that has ended is not
 * an episode. Any saved session stops the clock immediately and permanently
 * for that run; what was already lost stays lost, and the user rebuilds it
 * through attendance and performance like anyone else. A later absence starts
 * a fresh episode with a fresh baseline taken at *its* start, not the old one.
 */
export function currentAbstinence(
  sessionDates: ReadonlySet<DateKey>,
  origin: DateKey,
  on: DateKey,
): AbstinenceEpisode | null {
  if (sessionDates.has(on)) return null;
  const span = diffInDays(origin, on);
  if (span < 0) return null;

  let days = 0;
  let from = on;
  for (let back = 0; back <= span; back += 1) {
    const date = shift(on, -back);
    if (sessionDates.has(date)) break;
    days += 1;
    from = date;
  }
  return days === 0 ? null : { from, through: on, days };
}

/** `addDays` without the import cycle a re-export through the barrel makes. */
function shift(key: DateKey, days: number): DateKey {
  const date = middayOf(key);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export { rankById };
