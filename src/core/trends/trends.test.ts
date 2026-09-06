import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import { buildTrend, rollingAverage, type SeriesPoint } from './index';

function series(values: (number | null)[], start = '2025-03-01'): SeriesPoint[] {
  return values.map((value, index) => ({ date: addDays(start, index), value }));
}

describe('rolling average', () => {
  it('averages a trailing window', () => {
    expect(rollingAverage([10, 20, 30], 3)).toEqual([10, 15, 20]);
  });

  it('skips missing days rather than treating them as zero', () => {
    // A gap must not drag the line to the floor.
    expect(rollingAverage([100, null, 100], 3)).toEqual([100, 100, 100]);
  });

  it('stays null while a window holds no data at all', () => {
    expect(rollingAverage([null, null], 2)).toEqual([null, null]);
  });

  it('uses only the window, not the whole history', () => {
    const values = [0, 0, 0, 100, 100];
    expect(rollingAverage(values, 2)).toEqual([0, 0, 0, 50, 100]);
  });
});

describe('direction', () => {
  it('reads a sustained climb as rising', () => {
    const trend = buildTrend(series([30, 35, 40, 50, 60, 70, 80]), { window: 3 });
    expect(trend.direction).toBe('rising');
    expect(trend.delta).toBeGreaterThan(0);
  });

  it('reads a sustained decline as falling', () => {
    const trend = buildTrend(series([80, 75, 70, 60, 50, 40, 30]), { window: 3 });
    expect(trend.direction).toBe('falling');
    expect(trend.delta).toBeLessThan(0);
  });

  it('calls a small wobble steady rather than a direction', () => {
    const trend = buildTrend(series([60, 61, 59, 60, 61, 60, 60]), { window: 3 });
    expect(trend.direction).toBe('steady');
  });

  it('reports current and previous from the smoothed line', () => {
    const trend = buildTrend(series([50, 50, 50, 80, 80, 80]), { window: 3 });
    expect(trend.previous).toBe(50);
    expect(trend.current).toBe(80);
    expect(trend.delta).toBe(30);
  });
});

describe('not enough data', () => {
  it('states no trend rather than drawing one through nothing', () => {
    const trend = buildTrend(series([70, null, null, 60]));
    expect(trend.scoredDays).toBe(2);
    expect(trend.hasTrend).toBe(false);
    expect(trend.direction).toBe('unknown');
    expect(trend.annotations).toEqual([]);
  });

  it('has no trend at all for an empty range', () => {
    const trend = buildTrend(series([null, null, null]));
    expect(trend.current).toBeNull();
    expect(trend.previous).toBeNull();
    expect(trend.delta).toBeNull();
    expect(trend.hasTrend).toBe(false);
  });

  it('starts stating a direction once enough days are scored', () => {
    const trend = buildTrend(series([40, 45, 50, 60, 70]), { window: 3 });
    expect(trend.hasTrend).toBe(true);
    expect(trend.direction).toBe('rising');
  });
});

describe('annotations, used sparingly', () => {
  it('marks a peak that is not simply today', () => {
    const trend = buildTrend(series([50, 90, 90, 90, 40, 40, 40]), { window: 2 });
    const peak = trend.annotations.find((a) => a.kind === 'peak');
    expect(peak).toBeDefined();
    expect(peak?.date).not.toBe('2025-03-07');
  });

  it('does not mark a peak when the best day is the latest one', () => {
    const trend = buildTrend(series([40, 50, 60, 70, 80, 90]), { window: 2 });
    expect(trend.annotations.find((a) => a.kind === 'peak')).toBeUndefined();
  });

  it('marks a long run of missing days', () => {
    const trend = buildTrend(series([60, 60, 60, null, null, null, null, 60, 60]), { window: 3 });
    const gap = trend.annotations.find((a) => a.kind === 'inactivity');
    expect(gap?.days).toBe(4);
    expect(gap?.date).toBe('2025-03-04');
    expect(gap?.endDate).toBe('2025-03-07');
  });

  it('ignores a short gap', () => {
    const trend = buildTrend(series([60, 60, 60, null, null, 60, 60, 60]), { window: 3 });
    expect(trend.annotations.find((a) => a.kind === 'inactivity')).toBeUndefined();
  });

  it('counts missed days as inactivity even though they score zero', () => {
    // A closed day with nothing answered scores zero rather than being
    // excluded, so a run of them looks like data to every average. The
    // caller marks them, and only then are they named as a gap.
    const points = series([70, 70, 70, 0, 0, 0, 0, 70]).map((point, index) => ({
      ...point,
      inactive: index >= 3 && index <= 6,
    }));
    const trend = buildTrend(points, { window: 3 });
    const gap = trend.annotations.find((a) => a.kind === 'inactivity');
    expect(gap?.days).toBe(4);
    expect(gap?.date).toBe('2025-03-04');
  });

  it('does not call a run of low-but-recorded days inactivity', () => {
    const points = series([70, 70, 70, 10, 10, 10, 10, 70]).map((point) => ({
      ...point,
      inactive: false,
    }));
    const trend = buildTrend(points, { window: 3 });
    expect(trend.annotations.find((a) => a.kind === 'inactivity')).toBeUndefined();
  });
});
