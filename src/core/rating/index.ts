import { RATING } from '../config/constants';
import { activeDecayModel } from '../decay';
import type { DateKey } from '../dates';
import type { DomainType } from '../model';
import type { DayStatus } from '../scoring/dayScore';

/**
 * The general inactivity schedule, re-exported from its one implementation.
 *
 * It lived here until D72 was approved, and `core/decay` held a second copy
 * of the same arithmetic that nothing called. There is now one function, in
 * the module that owns the contract; this name is kept so the import path it
 * has always had keeps working rather than a rename rippling through code
 * and tests that are about something else.
 */
export { decayForDay } from '../decay';

/**
 * The rating engine (§13).
 *
 * An internal 0–1000 number that drives the current rank. Four properties
 * matter more than the exact arithmetic:
 *
 * 1. **It is a pure fold over reconstructed history.** The rating for any
 *    past date is recomputed from the daily state that was valid then, so it
 *    cannot move because of a later configuration change. Nothing is stored
 *    and replayed; replaying is the only way it is ever produced.
 * 2. **Every movement inherits the half-life.** The streak bonus is part of
 *    what the average tracks rather than a separate figure added on top, so
 *    gaining or losing a streak moves the rating gradually like everything
 *    else — and a bad day cannot keep pulling the rating down for days
 *    afterwards while performance has already recovered.
 * 3. **Absence is forgiven, not punished twice.** A day with nothing recorded
 *    does not feed a zero into the average; it decays gently and the decay is
 *    capped per episode, so a week away cannot cost several tiers.
 * 4. **Reporting part of a day is never worse than reporting none of it.**
 *    A day counts in proportion to how much of it was reported, and it counts
 *    on what was reported — not divided by what was due.
 */

/**
 * One day of reconstructed state — not merely a number.
 *
 * The distinction between a zero because the user answered "no" and a zero
 * because nothing was recorded is deliberate and load-bearing, so it is part
 * of the input rather than something the fold could infer from the score.
 */
export interface DayState {
  date: DateKey;
  status: DayStatus;
  /** Score over items **due** (§11): a missed item is a miss. For history. */
  score: number | null;
  /** Score over the items actually **reported**. What the rating tracks. */
  recordedScore: number | null;
  /** Items due and items answered, which set the day's weight. */
  dueItems: number;
  answeredItems: number;
  /** Whether anything at all was recorded that day. */
  recorded: boolean;
  /** Whether every due item was answered — what a streak counts. */
  complete: boolean;
}

export interface RatingPoint {
  date: DateKey;
  rating: number;
  streak: number;
  /** What the current streak is worth to the target, capped by design. */
  streakBonus: number;
  /** How much of the day was reported, from 0 to 1. */
  weight: number;
  /** Points removed by inactivity decay on this day. */
  decay: number;
  /** True while the calibration period protects the rating from falling. */
  calibrating: boolean;
  /** True when the day contributed nothing — neutral, open, or before use. */
  skipped: boolean;
}

export interface RatingResult {
  points: RatingPoint[];
  current: number;
  /** Highest rating ever reached. Never decreases, and decay cannot touch it. */
  peak: number;
  currentStreak: number;
  bestStreak: number;
}

const clamp = (value: number) => Math.min(RATING.MAX, Math.max(RATING.MIN, value));

/**
 * How much of the gap to the target a full day closes.
 * Derived from the half-life so the constant stays meaningful when tuned.
 */
export function smoothingFactor(halfLifeDays: number = RATING.HALF_LIFE_DAYS): number {
  return 1 - Math.pow(2, -1 / Math.max(1, halfLifeDays));
}

/**
 * What a streak is worth, with diminishing returns: the first day is worth
 * about `STREAK_BONUS_PER_DAY`, and the total approaches — but never reaches
 * — the cap. A streak can therefore never be farmed into a rank.
 */
export function streakBonus(streak: number): number {
  if (streak <= 0) return 0;
  const cap = RATING.STREAK_BONUS_CAP;
  return cap * (1 - Math.exp((-streak * RATING.STREAK_BONUS_PER_DAY) / cap));
}

/**
 * How much a day counts, from 0 to 1.
 *
 * A day where two of six questions were answered is a quarter of a day's
 * worth of evidence, and moves the rating by a quarter as much. This is what
 * stops honest partial progress from costing more than silence: reporting
 * two good answers out of six now nudges the rating *up*, where dividing by
 * items due would have counted it as a 33% day and pulled it sharply down.
 */
export function dayWeight(day: DayState): number {
  if (day.dueItems <= 0) return 1;
  return Math.min(1, Math.max(0, day.answeredItems / day.dueItems));
}

export interface RatingOptions {
  /**
   * Which domain this fold is for, passed through to the decay model.
   *
   * Optional: the legacy progression folds every domain at once and has no
   * single answer, and the approved general formula does not read it. It is
   * carried so that a future per-domain formula needs no new plumbing.
   */
  domain?: DomainType;
}

export function computeRating(days: DayState[], options: RatingOptions = {}): RatingResult {
  const alpha = smoothingFactor();
  const points: RatingPoint[] = [];
  /*
   * The general cooling-off model (D72), resolved once for the whole fold.
   *
   * This is the live execution path: there is no inline schedule here any
   * more, so what the rating loses to inactivity is exactly what
   * `core/decay` says it loses, and the approval flag is a statement about
   * code that actually runs.
   */
  const decayModel = activeDecayModel();

  let rating: number = RATING.START;
  let streak = 0;
  let bestStreak = 0;
  let peak: number = RATING.START;
  let inactiveRun = 0;
  let episodeDecay = 0;
  /** Calendar days since the first day the app had anything to score. */
  let dayIndex = 0;

  for (const day of days) {
    const calibrating = dayIndex < RATING.CALIBRATION_DAYS;
    const previous = rating;
    let decay = 0;
    let weight = 0;

    if (day.status !== 'scored') {
      // Neutral or open: nothing was expected, or it can still be answered.
      // Neither moves the rating, and neither breaks a streak.
      points.push({
        date: day.date,
        rating,
        streak,
        streakBonus: streakBonus(streak),
        weight: 0,
        decay: 0,
        calibrating,
        skipped: true,
      });
      continue;
    }

    // From here the day counts, so it is a day of use.
    dayIndex += 1;

    if (!day.recorded) {
      /*
       * Nothing was recorded. The score for such a day is zero — and the
       * history screens say so — but feeding that zero into the average
       * would cost a fortnight's progress for a week away. Inactivity decays
       * instead, gently and with a cap per episode.
       */
      inactiveRun += 1;
      decay = decayModel.perDay({
        ...(options.domain === undefined ? {} : { domain: options.domain }),
        consecutiveInactiveDays: inactiveRun,
        episodeSoFar: episodeDecay,
        /*
         * Dormant, and deliberately so. Nothing writes a rest day or a pause
         * period, `DayState` carries neither, and what they should suspend is
         * a separate unresolved product question that D72 did not answer.
         * Passing `false` reproduces today's behaviour exactly; wiring them
         * is a later decision, not a side effect of centralising this.
         */
        restDay: false,
        paused: false,
      });
      episodeDecay += decay;
      rating = clamp(rating - decay);
      streak = 0;
    } else {
      inactiveRun = 0;
      episodeDecay = 0;
      /*
       * The bonus is earned by the run up to this day, so the day is judged
       * with the streak it was carried into. Cancelling it on the very day it
       * breaks would make an honestly reported partial day score fractionally
       * worse than saying nothing at all — a small gap, but pointing the
       * wrong way.
       */
      const carried = streakBonus(streak);
      streak = day.complete ? streak + 1 : 0;
      bestStreak = Math.max(bestStreak, streak);
      weight = dayWeight(day);
      /*
       * The streak is part of the target rather than an amount added on
       * afterwards. Losing a streak therefore costs at most `alpha` of its
       * worth per day, the same gradual movement as everything else, instead
       * of a cliff that could demote a user at a tier boundary.
       */
      const target = clamp((day.recordedScore ?? 0) * 10 + carried);
      rating = clamp(rating + alpha * weight * (target - rating));
    }

    // During calibration the rating may rise but never fall: early data is
    // noisy and the user is still learning what their questions mean.
    if (calibrating && rating < previous) rating = previous;

    peak = Math.max(peak, rating);

    points.push({
      date: day.date,
      rating,
      streak,
      streakBonus: streakBonus(streak),
      weight,
      decay,
      calibrating,
      skipped: false,
    });
  }

  const last = points[points.length - 1];
  return {
    points,
    current: last ? last.rating : RATING.START,
    peak,
    currentStreak: streak,
    bestStreak,
  };
}
