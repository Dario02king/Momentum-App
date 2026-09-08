import type { DateKey } from '../dates';
import { MUSCLE_GROUPS, type MuscleGroup } from '../model';

/**
 * Gym performance: the whole pipeline, and nothing that touches storage or
 * React.
 *
 * ```
 *   sets → exercise-day best set → comparison with the previous workout
 *        → muscle-group value → equal-weighted Gym performance
 * ```
 *
 * Every function here is pure and deterministic. The body renderer, the
 * progress screen and the exercise detail all read what this produces; none
 * of them computes any part of it, so there is exactly one place where a Gym
 * number can be wrong.
 */

/* ── The set, and the day ───────────────────────────────────────────────── */

export interface SetInput {
  id: string;
  reps: number;
  /** Whole grams. Integers, so two identical sets always compare equal. */
  weightGrams: number;
  /** Position within the exercise on that day, for a deterministic tie-break. */
  order: number;
}

export interface BestSet {
  /** `reps × weightGrams`. The exercise-day performance. */
  score: number;
  /** One set that achieves it — for display only; ties never change `score`. */
  set: SetInput;
}

/**
 * A set counts when it describes work that happened.
 *
 * Zero reps is not a set, zero weight is not a load, and a negative or
 * non-finite number is a bug upstream rather than a very bad workout. All are
 * dropped rather than scored, so a stray empty row a user tapped into
 * existence cannot drag a day down.
 */
export function isScorableSet(set: SetInput): boolean {
  return (
    Number.isFinite(set.reps) &&
    Number.isFinite(set.weightGrams) &&
    Number.isInteger(set.weightGrams) &&
    set.reps > 0 &&
    set.weightGrams > 0
  );
}

export function setScore(set: SetInput): number {
  return set.reps * set.weightGrams;
}

/**
 * The best set of an exercise on one day.
 *
 * **`max(reps × weight)`, and nothing else.** Not total volume, not the sum
 * of the sets, not their average, not the average weight, not an estimated
 * one-rep max, and not the heaviest weight on its own. Ten at 10 kg and six
 * at 20 kg are both 100 kg-reps of best set; eight at 15 kg beats them both
 * at 120.
 *
 * Ties do not change the number — that is the point of taking a maximum. A
 * screen that wants to name one set gets the earliest by `order`, which is
 * stable across reloads and edits, but nothing downstream reads it.
 */
export function bestSet(sets: readonly SetInput[]): BestSet | null {
  let best: BestSet | null = null;
  for (const set of sets) {
    if (!isScorableSet(set)) continue;
    const score = setScore(set);
    if (best === null || score > best.score || (score === best.score && set.order < best.set.order)) {
      best = { score, set };
    }
  }
  return best;
}

/** One exercise on one day, as the rest of the pipeline sees it. */
export interface ExerciseDay {
  date: DateKey;
  exerciseId: string;
  /** The groups the sets were logged under, not the ones mapped today. */
  muscles: MuscleGroup[];
  best: BestSet;
}

export interface ExerciseDayInput {
  date: DateKey;
  exerciseId: string;
  muscles: MuscleGroup[];
  sets: readonly SetInput[];
}

/**
 * Collapses a day's sets into one number per exercise.
 *
 * An exercise whose sets are all unscorable produces nothing at all rather
 * than a zero: it was not performed, and "not performed" is not a bad
 * performance.
 */
export function exerciseDays(inputs: readonly ExerciseDayInput[]): ExerciseDay[] {
  const days: ExerciseDay[] = [];
  for (const input of inputs) {
    const best = bestSet(input.sets);
    if (!best) continue;
    days.push({ date: input.date, exerciseId: input.exerciseId, muscles: input.muscles, best });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

/* ── Comparison with the previous workout ───────────────────────────────── */

export type ProgressKind = 'noBaseline' | 'improved' | 'unchanged' | 'declined';

export interface ExerciseComparison {
  exerciseId: string;
  date: DateKey;
  kind: ProgressKind;
  /** This day's best-set score. */
  current: number;
  /** The previous recorded day's, or `null` when there is no baseline. */
  previous: number | null;
  /** The day that baseline came from, however long ago it was. */
  previousDate: DateKey | null;
  /** `current / previous`, or `null` with no usable baseline. 1 is unchanged. */
  ratio: number | null;
  /** `current − previous`, or `null`. */
  delta: number | null;
}

/**
 * How a day compares with the last day this exercise was actually done.
 *
 * Four states, and the first of them is why this returns a kind rather than a
 * number. A first-ever workout has nothing to compare against, and reporting
 * that as +0 % or −100 % would be inventing a baseline out of an absence.
 * `noBaseline` says so, and the interface can show it as the start of a
 * history rather than as a result.
 *
 * Two absences are deliberately not failures either:
 *
 * - **A skipped exercise is not a zero.** The baseline is the previous day
 *   the exercise was *recorded*, whether that was last Tuesday or in March.
 * - **A long gap is not a decline.** Time does not enter the comparison at
 *   all. Coming back after two months and matching your old best is
 *   `unchanged`, because that is what happened.
 */
export function compareExerciseDays(days: readonly ExerciseDay[]): ExerciseComparison[] {
  const byExercise = new Map<string, ExerciseDay[]>();
  for (const day of days) {
    const list = byExercise.get(day.exerciseId);
    if (list) list.push(day);
    else byExercise.set(day.exerciseId, [day]);
  }

  const comparisons: ExerciseComparison[] = [];
  for (const [exerciseId, list] of byExercise) {
    const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date));
    let previous: ExerciseDay | null = null;
    for (const day of ordered) {
      comparisons.push(compareOne(exerciseId, day, previous));
      previous = day;
    }
  }
  return comparisons.sort(
    (a, b) => a.date.localeCompare(b.date) || a.exerciseId.localeCompare(b.exerciseId),
  );
}

function compareOne(
  exerciseId: string,
  day: ExerciseDay,
  previous: ExerciseDay | null,
): ExerciseComparison {
  const current = day.best.score;
  // A previous score of zero cannot be divided by, and cannot have been a
  // real performance either — a scorable set has positive reps and weight.
  if (previous === null || previous.best.score <= 0) {
    return {
      exerciseId,
      date: day.date,
      kind: 'noBaseline',
      current,
      previous: null,
      previousDate: null,
      ratio: null,
      delta: null,
    };
  }

  const before = previous.best.score;
  const ratio = current / before;
  return {
    exerciseId,
    date: day.date,
    kind: current > before ? 'improved' : current < before ? 'declined' : 'unchanged',
    current,
    previous: before,
    previousDate: previous.date,
    ratio,
    delta: current - before,
  };
}

/** The latest comparison per exercise, which is what a list wants to show. */
export function latestComparisons(days: readonly ExerciseDay[]): Map<string, ExerciseComparison> {
  const latest = new Map<string, ExerciseComparison>();
  for (const comparison of compareExerciseDays(days)) latest.set(comparison.exerciseId, comparison);
  return latest;
}

/* ── Muscle groups ──────────────────────────────────────────────────────── */

/**
 * Why a muscle group has no number, when it has none.
 *
 * These are three different things and the interface has to be able to say
 * which: a group nobody has trained is not a group that got worse.
 */
export type MuscleStatus = 'noData' | 'insufficientBaseline' | 'measured';

export interface MusclePerformance {
  muscle: MuscleGroup;
  status: MuscleStatus;
  /**
   * The group's progress ratio, or `null` unless `status` is `measured`.
   * 1 means it held; above 1 means it improved.
   */
  ratio: number | null;
  /** Exercises in the group with a recorded day in the window. */
  exercises: number;
  /** Of those, how many had a previous performance to compare against. */
  compared: number;
  /** Its most recent best-set score, whether or not it could be compared. */
  latestScore: number | null;
}

/**
 * One value per muscle group, from the exercises that reach it.
 *
 * **The rule, written down.** An exercise's progress ratio is the ratio for
 * its most recent comparable day. Every group the exercise is mapped to
 * receives that ratio, and a group's value is the plain mean of the ratios it
 * received. Groups are then equal-weighted above (`gymPerformance`), so:
 *
 * - a group with five exercises does not outweigh a group with one;
 * - an exercise in two groups counts once *in each*, which is what "it trains
 *   both" means, and cannot amplify itself, because within each group it is
 *   one voice among that group's exercises and the groups are equal above.
 *   Deadlift raises back and hamstrings; it does not raise the Gym score
 *   twice for being one movement.
 *
 * A group with recorded work but no exercise that has a baseline yet is
 * `insufficientBaseline` — it has data and no progress, which is not the same
 * as no data and is emphatically not a decline.
 */
export function musclePerformance(days: readonly ExerciseDay[]): MusclePerformance[] {
  const comparisons = latestComparisons(days);

  /** Latest score per exercise, for the groups that cannot be compared yet. */
  const latestScore = new Map<string, number>();
  const musclesOf = new Map<string, MuscleGroup[]>();
  for (const day of days) {
    latestScore.set(day.exerciseId, day.best.score);
    musclesOf.set(day.exerciseId, day.muscles);
  }

  const byMuscle = new Map<MuscleGroup, { ratios: number[]; exercises: Set<string>; best: number | null }>();
  const bucket = (muscle: MuscleGroup) => {
    let entry = byMuscle.get(muscle);
    if (!entry) {
      entry = { ratios: [], exercises: new Set(), best: null };
      byMuscle.set(muscle, entry);
    }
    return entry;
  };

  for (const [exerciseId, muscles] of musclesOf) {
    const comparison = comparisons.get(exerciseId);
    const score = latestScore.get(exerciseId) ?? null;
    for (const muscle of muscles) {
      const entry = bucket(muscle);
      entry.exercises.add(exerciseId);
      if (score !== null) entry.best = Math.max(entry.best ?? 0, score);
      if (comparison && comparison.ratio !== null) entry.ratios.push(comparison.ratio);
    }
  }

  return MUSCLE_GROUPS.map((muscle) => {
    const entry = byMuscle.get(muscle);
    if (!entry || entry.exercises.size === 0) {
      return {
        muscle,
        status: 'noData' as const,
        ratio: null,
        exercises: 0,
        compared: 0,
        latestScore: null,
      };
    }
    if (entry.ratios.length === 0) {
      return {
        muscle,
        status: 'insufficientBaseline' as const,
        ratio: null,
        exercises: entry.exercises.size,
        compared: 0,
        latestScore: entry.best,
      };
    }
    return {
      muscle,
      status: 'measured' as const,
      ratio: entry.ratios.reduce((sum, value) => sum + value, 0) / entry.ratios.length,
      exercises: entry.exercises.size,
      compared: entry.ratios.length,
      latestScore: entry.best,
    };
  });
}

export interface GymPerformance {
  /** The equal-weighted mean of the measured groups' ratios, or `null`. */
  ratio: number | null;
  /** Every group, whatever its status — the body renderer draws all ten. */
  muscles: MusclePerformance[];
  /** The groups that actually entered the mean. */
  measured: MuscleGroup[];
  /** Trained, but with nothing to compare against yet. */
  awaitingBaseline: MuscleGroup[];
  /** Never trained in the window. */
  untrained: MuscleGroup[];
}

/**
 * The Gym aggregate: **the equal-weighted mean over muscle groups.**
 *
 * Chest with five exercises and legs with two do not become five sevenths and
 * two sevenths. Each group produces one value and each value counts once.
 *
 * Only `measured` groups enter the denominator. A group nobody has trained is
 * not an earned zero — the app has never treated absence as failure, and
 * doing it here would mean a user who trains chest hard and has not yet
 * touched calves is scored as though they had failed at calves. A group that
 * has been trained but has no baseline is likewise excluded until it has one:
 * it has produced no progress to average.
 *
 * With no measured group at all the ratio is `null`, and every screen above
 * says "not started yet" rather than drawing a zero.
 */
export function gymPerformance(days: readonly ExerciseDay[]): GymPerformance {
  const muscles = musclePerformance(days);
  const measured = muscles.filter((entry) => entry.status === 'measured');

  return {
    ratio:
      measured.length === 0
        ? null
        : measured.reduce((sum, entry) => sum + (entry.ratio ?? 0), 0) / measured.length,
    muscles,
    measured: measured.map((entry) => entry.muscle),
    awaitingBaseline: muscles
      .filter((entry) => entry.status === 'insufficientBaseline')
      .map((entry) => entry.muscle),
    untrained: muscles.filter((entry) => entry.status === 'noData').map((entry) => entry.muscle),
  };
}

/**
 * The same aggregation over a longer window — a year, or everything.
 *
 * The only difference is which comparison each exercise contributes: over a
 * long window it is the exercise's **whole span**, its most recent recorded
 * best against its first, rather than day against previous day. That is what
 * stops training frequency from becoming structural weight. Someone who
 * benches twice a week produces more comparisons than someone who benches
 * fortnightly, and if those were averaged the frequent trainer's chest would
 * speak more loudly than their legs. One span per exercise, one value per
 * group, equal weight per group: frequency changes how much evidence there
 * is, never how much a muscle counts.
 */
export function gymPerformanceOverSpan(days: readonly ExerciseDay[]): GymPerformance {
  const byExercise = new Map<string, ExerciseDay[]>();
  for (const day of days) {
    const list = byExercise.get(day.exerciseId);
    if (list) list.push(day);
    else byExercise.set(day.exerciseId, [day]);
  }

  /* Reduce each exercise to its first and last recorded day, then run the
     ordinary pipeline over those two — one comparison per exercise. */
  const spans: ExerciseDay[] = [];
  for (const list of byExercise.values()) {
    const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const first = ordered[0]!;
    const last = ordered[ordered.length - 1]!;
    spans.push(first);
    if (last !== first) spans.push(last);
  }

  return gymPerformance(spans);
}

/** A ratio as a percentage change: 1.2 → +20. `null` stays `null`. */
export function percentChange(ratio: number | null): number | null {
  return ratio === null ? null : (ratio - 1) * 100;
}
