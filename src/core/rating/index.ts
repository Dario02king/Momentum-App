import { RATING } from '../config/constants';
import type { DateKey } from '../dates';
import type { DayStatus } from '../scoring/dayScore';

/**
 * The rating engine (§13).
 *
 * An internal 0–1000 number that drives the current rank. Three properties
 * matter more than the exact arithmetic:
 *
 * 1. **It is a pure fold over history.** The rating for any past date is
 *    recomputed from the day scores that were valid then, so it cannot move
 *    because of a later configuration change. Nothing is stored and replayed;
 *    replaying is the only way it is ever produced.
 * 2. **Movement is gradual by construction.** A single bad day moves the
 *    rating by a few points against tier widths of well over a hundred, so
 *    one day can never cost a tier.
 * 3. **Absence is forgiven, not punished twice.** A day with nothing recorded
 *    does not feed a zero into the average; it decays gently and the decay is
 *    capped per episode, so a week away cannot cost several tiers.
 */

export interface RatingDay {
  date: DateKey;
  status: DayStatus;
  /** Overall daily score 0–100, or `null` for a neutral or open day. */
  score: number | null;
  /** Whether anything at all was recorded that day. */
  recorded: boolean;
  /** Whether every due item was answered — what a streak counts. */
  complete: boolean;
}

export interface RatingPoint {
  date: DateKey;
  /** The rating a user would see on this day, including the streak bonus. */
  rating: number;
  /** The underlying moving average, before the streak bonus. */
  base: number;
  streak: number;
  /** The bonus actually applied, which eases towards what the streak earns. */
  streakBonus: number;
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
 * How much of the gap to the target a single day closes.
 * Derived from the half-life so the constant stays meaningful when tuned.
 */
export function smoothingFactor(halfLifeDays: number = RATING.HALF_LIFE_DAYS): number {
  return 1 - Math.pow(2, -1 / Math.max(1, halfLifeDays));
}

/**
 * Streak bonus with diminishing returns: the first day adds about
 * `STREAK_BONUS_PER_DAY`, and the total approaches — but never reaches — the
 * cap. A streak can therefore never be farmed into a rank.
 */
export function streakBonus(streak: number): number {
  if (streak <= 0) return 0;
  const cap = RATING.STREAK_BONUS_CAP;
  return cap * (1 - Math.exp((-streak * RATING.STREAK_BONUS_PER_DAY) / cap));
}

/** Decay for the nth consecutive day of an inactivity episode. */
export function decayForDay(consecutiveInactiveDays: number): number {
  const { GRACE_DAYS, SMALL_UNTIL_DAY, SMALL_PER_DAY, LARGE_PER_DAY } = RATING.DECAY;
  if (consecutiveInactiveDays <= GRACE_DAYS) return 0;
  if (consecutiveInactiveDays <= SMALL_UNTIL_DAY) return SMALL_PER_DAY;
  return LARGE_PER_DAY;
}

export function computeRating(days: RatingDay[]): RatingResult {
  const alpha = smoothingFactor();
  const points: RatingPoint[] = [];

  let base: number = RATING.START;
  let bonus = 0;
  let streak = 0;
  let bestStreak = 0;
  let peak: number = RATING.START;
  let inactiveRun = 0;
  let episodeDecay = 0;
  /** Calendar days since the first day the app had anything to score. */
  let dayIndex = 0;

  for (const day of days) {
    const calibrating = dayIndex < RATING.CALIBRATION_DAYS;
    const previousBase = base;
    let decay = 0;

    if (day.status !== 'scored') {
      // Neutral or open: nothing was expected, or it can still be answered.
      // Neither moves the rating, and neither breaks a streak.
      points.push({
        date: day.date,
        rating: clamp(base + bonus),
        base,
        streak,
        streakBonus: bonus,
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
      const step = decayForDay(inactiveRun);
      const remaining = Math.max(0, RATING.DECAY.MAX_PER_EPISODE - episodeDecay);
      decay = Math.min(step, remaining);
      episodeDecay += decay;
      base = clamp(base - decay);
      streak = 0;
    } else {
      inactiveRun = 0;
      episodeDecay = 0;
      const target = (day.score ?? 0) * 10;
      base = clamp(base + alpha * (target - base));
      streak = day.complete ? streak + 1 : 0;
      bestStreak = Math.max(bestStreak, streak);
    }

    // During calibration the rating may rise but never fall: early data is
    // noisy and the user is still learning what their questions mean.
    if (calibrating && base < previousBase) base = previousBase;

    // The bonus eases towards what the streak has earned, in both
    // directions, so neither gaining nor losing a streak is a cliff.
    bonus += RATING.STREAK_BONUS_SMOOTHING * (streakBonus(streak) - bonus);
    const rating = clamp(base + bonus);
    peak = Math.max(peak, rating);

    points.push({
      date: day.date,
      rating,
      base,
      streak,
      streakBonus: bonus,
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
