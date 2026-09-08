import type { DateKey } from '../dates';
import type { ExerciseLoadType } from '../model';

/**
 * Effective load: what a set actually asked of the body.
 *
 * The primary metric never changes — `max(reps × effectiveLoad)` over the
 * day's sets, exactly as D84 defined it. What this module adds is that
 * `effectiveLoad` is not always the number on the bar:
 *
 * ```
 *   external    load = the weight lifted
 *   bodyweight  load = bodyweight + added weight
 *   assisted    load = bodyweight − assistance
 * ```
 *
 * Everything stays in **whole grams**, so `reps × load` remains integer
 * arithmetic and two identical sets can never compare unequal (D84).
 *
 * ## Bodyweight is read forward, never backward
 *
 * A bodyweight set is meaningless without knowing what the body weighed, and
 * that changes over time. The rule is the same one the whole app follows: a
 * past day is resolved against the facts in force **on that day**. So the
 * load uses the most recent weight entry on or before the set's date, and a
 * measurement taken afterwards can never enter a session already logged —
 * which is what makes a replay of last March produce last March's numbers
 * however often the user steps on the scales this week.
 */

/** A dated bodyweight measurement, in whole grams. */
export interface BodyweightPoint {
  date: DateKey;
  grams: number;
}

/**
 * The bodyweight in force on a date: the latest measurement on or before it.
 *
 * `null` when the user had not weighed themselves yet. That is an absence,
 * not a zero, and the caller drops the set rather than scoring it — the app
 * has never treated missing data as a bad result.
 *
 * The points are sorted here rather than assumed sorted, because the callers
 * read them straight out of a store whose order is its own business.
 */
export function bodyweightOn(
  points: readonly BodyweightPoint[],
  date: DateKey,
): number | null {
  let best: BodyweightPoint | null = null;
  for (const point of points) {
    if (point.date > date) continue;
    if (!Number.isFinite(point.grams) || point.grams <= 0) continue;
    if (best === null || point.date > best.date) best = point;
  }
  return best?.grams ?? null;
}

export interface LoadInput {
  /** Absent on a set written before load types existed, which was external. */
  loadType?: ExerciseLoadType;
  /** The number the user entered: bar, added weight, or assistance. */
  weightGrams: number;
  /** The bodyweight in force on the set's day, or `null` if unknown. */
  bodyweightGrams: number | null;
}

/**
 * The effective load of one set, in whole grams, or `null` if there is none.
 *
 * `null` means the set describes no scorable work and is dropped — the same
 * treatment a zero-rep set already gets. Four ways that happens, and none of
 * them is a bad performance:
 *
 * - a bodyweight or assisted set on a day with no bodyweight recorded yet;
 * - assistance greater than or equal to the bodyweight, which is a machine
 *   set to carry the user rather than a load they moved. It is **never**
 *   quietly re-read as ordinary positive resistance: `85 − 90` is not a 5 kg
 *   lift, and turning the sign round would invent a workout;
 * - a negative or non-finite number, which is a bug upstream;
 * - an external set with no weight on the bar.
 */
export function effectiveLoadGrams(input: LoadInput): number | null {
  const type = input.loadType ?? 'external';
  const entered = input.weightGrams;
  if (!Number.isFinite(entered) || !Number.isInteger(entered) || entered < 0) return null;

  if (type === 'external') return entered > 0 ? entered : null;

  const body = input.bodyweightGrams;
  if (body === null || !Number.isFinite(body) || body <= 0) return null;

  const load = type === 'bodyweight' ? body + entered : body - entered;
  return load > 0 ? Math.round(load) : null;
}

/** Whether a load type needs a bodyweight before it can be scored at all. */
export function needsBodyweight(loadType: ExerciseLoadType | undefined): boolean {
  return loadType === 'bodyweight' || loadType === 'assisted';
}
