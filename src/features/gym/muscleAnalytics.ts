import { MUSCLE_GROUPS, type MuscleGroup } from '../../core/model';
import type { DateKey } from '../../core/dates';
import {
  gymPerformanceOverSpan,
  percentChange,
  type ExerciseDay,
} from '../../core/gym/performance';
import type { MuscleState } from '../../components/BodyRenderer';
import type { GymHistory } from '../../storage/services/gymService';
import { muscleStateOf } from './muscleState';

/**
 * The muscle rows' view model: per group, its state and delta as the row
 * shows them today, when it was last trained, which exercise that was where
 * that is unambiguous, and the compact trend the mini chart draws.
 *
 * Read-only over the history the screen already loaded. Every number comes
 * out of an existing domain helper called on existing rows; the one thing
 * this file adds is *which rows* each helper is handed.
 *
 * ## The trend
 *
 * "Performance change for this muscle since the beginning of the selected
 * range, measured at each valid training observation."
 *
 * For each day on which any exercise reaching the group was recorded, the
 * point is the group's over-span ratio — `gymPerformanceOverSpan()`, the
 * very helper the row's own delta comes from — evaluated over the history up
 * to and including that day, expressed with `percentChange()`. So the last
 * point *is* the row's delta, by construction: the chart cannot end on a
 * number the row does not show.
 *
 * A day on which the group had no exercise with a baseline yet yields
 * nothing: the helper reports `insufficientBaseline`, and an absence is not a
 * zero. Days between observations are simply not in the array — the renderer
 * decides spacing, and it must never draw a gap as a value.
 */

export type MuscleDataState =
  /** No exercise reaching the group was recorded in the range. */
  | 'no-history'
  /** Exactly one valid observation — a value, not yet a direction. */
  | 'single-observation'
  /** Trained in the range, but no exercise has a second day to compare. */
  | 'awaiting-baseline'
  /** Two or more valid observations. */
  | 'measured';

export interface MuscleTrendPoint {
  /** The local calendar day of the observation, as the set recorded it. */
  date: DateKey;
  /** Percentage change since the start of the range, as of that day. Raw. */
  value: number;
}

export interface MuscleAnalyticsView {
  id: MuscleGroup;
  state: MuscleState;
  dataState: MuscleDataState;
  /** The row's delta: `percentChange()` of the range's over-span ratio. */
  delta: number | null;
  /** The latest day an exercise reaching the group was recorded, or `null`. */
  lastTrainedAt: DateKey | null;
  /**
   * The most recent valid observations, capped for the compact chart (see
   * `SPARKLINE_POINTS`). Ascending by date; the full series is
   * `muscleTrend()`.
   */
  trend: readonly MuscleTrendPoint[];
  /** How many valid observations the range holds in all, before the cap. */
  observations: number;
  /**
   * The exercise recorded on the latest training day, when there was exactly
   * one reaching the group; `null` when there were several or none. There is
   * no domain notion of *the* exercise of a day, so none is invented.
   */
  latestExerciseLabel: string | null;
  /** Every exercise reaching the group on that day, for a later UI to count. */
  latestExerciseIds: readonly string[];
}

/**
 * How many observations the compact 80 px sparkline shows. A presentation
 * constraint, not a domain one: twelve points leave about 7 px per segment,
 * the least that still shows a shape, and a 30-day range at three sessions a
 * week holds at most thirteen training days anyway. `muscleTrend()` is
 * never capped.
 */
export const SPARKLINE_POINTS = 12;

/**
 * The one selection the 3D body, the SVG figure and the muscle rows share:
 * whichever of them selects, the host holds this and hands it to all three.
 * None of them owns a selection of its own.
 */
export type MuscleSelection = MuscleGroup | null;

const reaches = (day: ExerciseDay, muscle: MuscleGroup): boolean => day.muscles.includes(muscle);

/** The days on which the group was trained, ascending, each once. */
function trainingDays(days: readonly ExerciseDay[], muscle: MuscleGroup): DateKey[] {
  return [...new Set(days.filter((day) => reaches(day, muscle)).map((day) => day.date))].sort();
}

/**
 * The full, deterministic series for one group over the loaded range: one
 * point per training day that had a comparable observation. Same rows in,
 * same points out.
 */
export function muscleTrend(days: readonly ExerciseDay[], muscle: MuscleGroup): MuscleTrendPoint[] {
  const points: MuscleTrendPoint[] = [];
  for (const date of trainingDays(days, muscle)) {
    const asOf = gymPerformanceOverSpan(days.filter((day) => day.date <= date));
    const ratio = asOf.muscles.find((entry) => entry.muscle === muscle)?.ratio ?? null;
    const value = percentChange(ratio);
    if (value !== null) points.push({ date, value });
  }
  return points;
}

export function toMuscleAnalytics(history: GymHistory): MuscleAnalyticsView[] {
  const performance = new Map(history.overall.muscles.map((entry) => [entry.muscle, entry]));
  return MUSCLE_GROUPS.map((id) => {
    const entry = performance.get(id);
    const state: MuscleState = entry ? muscleStateOf(entry) : 'noData';
    const delta = entry ? percentChange(entry.ratio) : null;
    const series = muscleTrend(history.days, id);
    const trained = trainingDays(history.days, id);
    const lastTrainedAt = trained.length > 0 ? trained[trained.length - 1]! : null;
    const latestExerciseIds =
      lastTrainedAt === null
        ? []
        : [...new Set(history.days.filter((day) => day.date === lastTrainedAt && reaches(day, id)).map((day) => day.exerciseId))].sort();
    const only = latestExerciseIds.length === 1 ? latestExerciseIds[0]! : null;

    const dataState: MuscleDataState =
      state === 'noData'
        ? 'no-history'
        : state === 'awaitingBaseline'
          ? 'awaiting-baseline'
          : series.length <= 1
            ? 'single-observation'
            : 'measured';

    return {
      id,
      state,
      dataState,
      delta,
      lastTrainedAt,
      trend: series.slice(-SPARKLINE_POINTS),
      observations: series.length,
      latestExerciseLabel: only === null ? null : (history.names.get(only) ?? only),
      latestExerciseIds,
    };
  });
}
