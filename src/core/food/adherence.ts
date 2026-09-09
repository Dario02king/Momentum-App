import { SCALE_MAX, SCALE_MIN } from '../config/constants';
import type { ScaleBandId } from '../config/constants';
import { scaleBandOf, scaleValueToPercent } from '../scoring/scale';

/**
 * What Food measures, and what it deliberately does not.
 *
 * Food's evidence is **one number the user chooses each day**: how closely
 * the day matched what they were trying to eat like, on the same 1–10 scale
 * every other subjective answer in the app uses. That number is stored
 * verbatim (`FoodDayRecord.adherence`) and everything else — the percentage,
 * the day score, the rating, the rank — is derived from it on every replay.
 *
 * ## Why adherence and not calories
 *
 * The app records calories and macros for entries the user logs, and shows
 * their total. **Nothing scores them.** What a person's calorie and macro
 * targets ought to be is a product decision that has not been made, and a
 * number chosen here to make the arithmetic work would be impossible to tell
 * apart afterwards from one that had actually been decided. Adherence is
 * answerable without it: the user knows whether the day went the way they
 * intended, and that is the question being asked.
 *
 * So this file has no target in it, no basal-rate model, no goal model and no
 * weight arithmetic. If those arrive, they arrive as a decision, and the
 * entered 1–10 stays exactly what it always was.
 *
 * ## Why it is the same 1–10 as everywhere else
 *
 * Reusing `scaleValueToPercent` is not a shortcut. A user who has learned
 * what "7" means from a Wellbeing question has learned what it means here,
 * the colour bands and their words are the same, and a second scale with its
 * own arithmetic would be a second thing to learn and a second thing to get
 * wrong.
 */

export const ADHERENCE_MIN = SCALE_MIN;
export const ADHERENCE_MAX = SCALE_MAX;

/** Every value the picker offers, low to high. */
export const ADHERENCE_VALUES: number[] = Array.from(
  { length: ADHERENCE_MAX - ADHERENCE_MIN + 1 },
  (_, index) => ADHERENCE_MIN + index,
);

export function isValidAdherence(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= ADHERENCE_MIN &&
    value <= ADHERENCE_MAX
  );
}

/** The day's percentage: value × 10, the same mapping a scale answer uses. */
export function adherencePercent(value: number): number {
  return scaleValueToPercent(value);
}

/** The qualitative band, so the number is never shown as a bare figure. */
export function adherenceBandOf(value: number): ScaleBandId {
  return scaleBandOf(value);
}
