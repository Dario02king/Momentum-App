import {
  INACTIVITY_ANNOTATION_DAYS,
  TREND_MIN_SCORED_DAYS,
  TREND_SMOOTHING_DAYS,
  TREND_STEADY_BAND,
} from '../config/constants';
import type { DateKey } from '../dates';

/**
 * Trends (§12).
 *
 * The Progress screen answers a directional question — am I moving up or
 * down — not a numerical one. Everything here works on a series of daily
 * values where `null` means "no data": neutral and open days are excluded
 * from every average rather than dragging one down.
 *
 * The module is deliberately generic over the series. Stage 4 feeds it
 * overall daily scores; the rating engine can feed it ratings without any
 * change here.
 */

export interface SeriesPoint {
  date: DateKey;
  /** `null` for a day that is excluded — neutral or still open. */
  value: number | null;
  /**
   * Whether nothing was recorded that day.
   *
   * This is not the same as `value === null`. A closed day on which nothing
   * was answered scores zero rather than being excluded — correctly, since
   * it was missed — so a run of them looks like data to every average while
   * being exactly the inactivity worth naming. The caller knows which days
   * those are; the series cannot infer it from the number alone.
   */
  inactive?: boolean;
}

export interface TrendPoint extends SeriesPoint {
  /** Rolling average ending at this day, or `null` before there is data. */
  smoothed: number | null;
}

export type TrendDirection = 'rising' | 'falling' | 'steady' | 'unknown';

export type TrendAnnotationKind = 'peak' | 'inactivity';

export interface TrendAnnotation {
  kind: TrendAnnotationKind;
  date: DateKey;
  /** Last day of the run, for an inactivity annotation. */
  endDate?: DateKey;
  value?: number;
  days?: number;
}

export interface Trend {
  points: TrendPoint[];
  /** Smoothed value at the end of the range. */
  current: number | null;
  /** Smoothed value at the start of the range — what "30 days ago" reads. */
  previous: number | null;
  delta: number | null;
  direction: TrendDirection;
  /** Days in the range that actually carry a score. */
  scoredDays: number;
  /** Below the minimum there is no trend to state. */
  hasTrend: boolean;
  annotations: TrendAnnotation[];
}

/**
 * A trailing rolling average that skips missing days rather than treating
 * them as zero. A window with no data at all stays `null`, so the curve
 * simply does not exist there instead of dropping to the floor.
 */
export function rollingAverage(
  values: (number | null)[],
  window: number = TREND_SMOOTHING_DAYS,
): (number | null)[] {
  const size = Math.max(1, window);
  return values.map((_, index) => {
    const from = Math.max(0, index - size + 1);
    let total = 0;
    let count = 0;
    for (let i = from; i <= index; i += 1) {
      const value = values[i];
      if (value === null || value === undefined) continue;
      total += value;
      count += 1;
    }
    return count === 0 ? null : total / count;
  });
}

function directionOf(previous: number | null, current: number | null): TrendDirection {
  if (previous === null || current === null) return 'unknown';
  const delta = current - previous;
  if (Math.abs(delta) < TREND_STEADY_BAND) return 'steady';
  return delta > 0 ? 'rising' : 'falling';
}

/** Runs of consecutive days with nothing recorded, long enough to name. */
function inactivityRuns(points: SeriesPoint[]): TrendAnnotation[] {
  const runs: TrendAnnotation[] = [];
  let start = -1;
  for (let index = 0; index <= points.length; index += 1) {
    const point = points[index];
    const missing =
      index < points.length && (point!.inactive === true || point!.value === null);
    if (missing && start === -1) start = index;
    if (!missing && start !== -1) {
      const days = index - start;
      if (days >= INACTIVITY_ANNOTATION_DAYS) {
        runs.push({
          kind: 'inactivity',
          date: points[start]!.date,
          endDate: points[index - 1]!.date,
          days,
        });
      }
      start = -1;
    }
  }
  return runs;
}

export function buildTrend(
  series: SeriesPoint[],
  { window = TREND_SMOOTHING_DAYS }: { window?: number } = {},
): Trend {
  const smoothed = rollingAverage(
    series.map((point) => point.value),
    window,
  );
  const points: TrendPoint[] = series.map((point, index) => ({
    ...point,
    smoothed: smoothed[index] ?? null,
  }));

  const withSmoothing = points.filter((point) => point.smoothed !== null);
  const last = withSmoothing[withSmoothing.length - 1];
  const current = last?.smoothed ?? null;
  const previous = withSmoothing[0]?.smoothed ?? null;
  const scoredDays = series.filter((point) => point.value !== null).length;
  const hasTrend = scoredDays >= TREND_MIN_SCORED_DAYS;

  const annotations: TrendAnnotation[] = [];
  if (hasTrend) {
    // The peak is only worth marking when it is not simply today.
    let peak: TrendPoint | null = null;
    for (const point of withSmoothing) {
      if (peak === null || (point.smoothed ?? 0) > (peak.smoothed ?? 0)) peak = point;
    }
    if (peak && peak !== last) {
      annotations.push({ kind: 'peak', date: peak.date, value: peak.smoothed ?? 0 });
    }
    annotations.push(...inactivityRuns(series));
  }

  return {
    points,
    current,
    previous,
    delta: current !== null && previous !== null ? current - previous : null,
    direction: hasTrend ? directionOf(previous, current) : 'unknown',
    scoredDays,
    hasTrend,
    annotations,
  };
}
