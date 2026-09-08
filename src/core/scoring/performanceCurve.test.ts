import { describe, expect, it } from 'vitest';
import { TRAINING_RATING, RATING } from '../config/constants';
import {
  attendanceScore,
  mapPerformanceChangeToScore,
  performanceChangeForScore,
  performanceScore,
  scoreForRatio,
} from './performanceCurve';

const map = mapPerformanceChangeToScore;

/**
 * The curve is one parameter and a handful of promises. These are the
 * promises, in the order the specification ranks them: `score(0) = 500`
 * first, then monotonicity, then symmetry, then diminishing returns, then
 * closeness to the approved anchors.
 */
describe('the performance curve', () => {
  it('scores no change as exactly the midpoint', () => {
    // Exact, not fitted: ODDS^0 is 1, so the denominator is 2.
    expect(map(0)).toBe(500);
  });

  it('meets the approved anchors it can meet exactly', () => {
    expect(map(10)).toBeCloseTo(800, 9);
    expect(map(-10)).toBeCloseTo(200, 9);
  });

  it('meets the ±5 % anchors within a third of a per cent of the scale', () => {
    expect(map(5)).toBeCloseTo(666.667, 3);
    expect(map(-5)).toBeCloseTo(333.333, 3);
    expect(Math.abs(map(5) - 670)).toBeLessThan(3.4);
    expect(Math.abs(map(-5) - 330)).toBeLessThan(3.4);
  });

  it('resolves the ±20 % anchors in favour of symmetry, as instructed', () => {
    /*
     * The approved table asks for −20 % → 0 and +20 % → 950, which cannot
     * both hold: symmetry about 500 requires that if +20 scores 950 then −20
     * scores 50, and an asymptotic curve cannot reach 0 at a finite input at
     * all. Symmetry outranks anchor fit, so these are the two that give.
     */
    expect(map(20)).toBeCloseTo(941.176, 3);
    expect(map(-20)).toBeCloseTo(58.824, 3);
    expect(map(20) + map(-20)).toBeCloseTo(1000, 9);
  });

  it('is symmetric about the midpoint for every change', () => {
    for (const change of [0.001, 0.5, 1, 3, 7.5, 12, 25, 60, 250, 1000]) {
      expect(map(change) + map(-change)).toBeCloseTo(1000, 9);
    }
  });

  it('is monotonic across the whole range, with no step at zero', () => {
    /*
     * Strictly increasing wherever a double can tell two values apart, which
     * is everywhere inside ±100 %. Beyond that the curve is within a
     * ten-thousandth of a point of its asymptote and consecutive values
     * become equal — saturation of the representation, not a flat spot in the
     * function, and the reason the wider range is asserted as non-decreasing.
     */
    let previous = -Infinity;
    for (let change = -100; change <= 100; change += 0.25) {
      const score = map(change);
      expect(score).toBeGreaterThan(previous);
      previous = score;
    }
    previous = -Infinity;
    for (let change = -400; change <= 400; change += 0.25) {
      const score = map(change);
      expect(score).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = score;
    }
    /*
     * And the two numerical branches meet at the join rather than stepping.
     * A hair either side of zero differs only by what the slope asks for —
     * about 69 points per per cent, so 1.4e-7 across a gap of 2e-9 — which is
     * continuity, not equality.
     */
    expect(map(1e-9) - map(-1e-9)).toBeLessThan(1e-6);
    expect(map(-1e-9)).toBeLessThan(map(0));
    expect(map(1e-9)).toBeGreaterThan(map(0));
  });

  it('rewards each further per cent less than the one before', () => {
    // Diminishing returns, stated as the second difference being negative.
    for (let change = 0; change < 60; change += 1) {
      const first = map(change + 1) - map(change);
      const second = map(change + 2) - map(change + 1);
      expect(second).toBeLessThan(first);
    }
  });

  it('does not cap the input, and approaches the bounds without reaching them', () => {
    // A beginner tripling their best set is +200 %. It keeps helping.
    expect(map(200)).toBeGreaterThan(999);
    expect(map(200)).toBeLessThan(RATING.MAX);
    expect(map(100000)).toBeLessThanOrEqual(RATING.MAX);
    expect(map(1e6)).toBeGreaterThan(map(1000) - 1e-6);
    // A total collapse is bounded too, and is never negative.
    expect(map(-99.9)).toBeGreaterThan(RATING.MIN);
    expect(map(-100000)).toBeGreaterThanOrEqual(RATING.MIN);
  });

  it('survives the numbers that break a naive exponential', () => {
    for (const change of [-1e6, -1e4, -745, 745, 1e4, 1e6]) {
      const score = map(change);
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(RATING.MIN);
      expect(score).toBeLessThanOrEqual(RATING.MAX);
    }
  });

  it('is deterministic to the last bit', () => {
    for (const change of [-17.3, -0.4, 0, 0.4, 17.3, 123.456]) {
      expect(map(change)).toBe(map(change));
    }
  });

  it('reads back the change a score implies', () => {
    for (const change of [-30, -10, 0, 10, 30]) {
      expect(performanceChangeForScore(map(change))).toBeCloseTo(change, 9);
    }
  });

  it('says nothing about a ratio it does not have', () => {
    expect(scoreForRatio(null)).toBeNull();
    expect(scoreForRatio(1)).toBe(500);
    expect(scoreForRatio(1.1)).toBeCloseTo(800, 9);
  });

  it('is one documented parameter, not a table of branches', () => {
    // Every ten points of improvement multiplies the odds by four.
    const odds = (change: number) => map(change) / (RATING.MAX - map(change));
    expect(odds(10) / odds(0)).toBeCloseTo(TRAINING_RATING.CURVE_ODDS_PER_DECADE, 9);
    expect(odds(20) / odds(10)).toBeCloseTo(TRAINING_RATING.CURVE_ODDS_PER_DECADE, 9);
  });
});

describe('attendance', () => {
  it('is the weekly fraction on the existing scale', () => {
    expect(attendanceScore(0, 3)).toBe(0);
    expect(attendanceScore(1, 3)).toBeCloseTo(1000 / 3, 9);
    expect(attendanceScore(3, 3)).toBe(1000);
  });

  it('is capped at the target, so an extra session buys nothing here', () => {
    expect(attendanceScore(4, 3)).toBe(1000);
    expect(attendanceScore(40, 3)).toBe(1000);
  });

  it('never divides by a target of zero', () => {
    expect(attendanceScore(1, 0)).toBe(1000);
  });
});

describe('composing the two windows', () => {
  it('weights trend and year-to-date equally', () => {
    const result = performanceScore({ trendChange: 10, ytdChange: -10 });
    expect(result.trendScore).toBeCloseTo(800, 9);
    expect(result.ytdScore).toBeCloseTo(200, 9);
    expect(result.score).toBeCloseTo(500, 9);
  });

  it('maps each window and then averages, rather than the other way round', () => {
    /*
     * The order is the point of the rule. Averaging the changes first and
     * mapping once would run a non-linear curve over a blended rate and lose
     * the disagreement between a good year and a bad two months.
     */
    const trendChange = 30;
    const ytdChange = 0;
    const mapThenAverage = performanceScore({ trendChange, ytdChange }).score!;
    const averageThenMap = mapPerformanceChangeToScore((trendChange + ytdChange) / 2);
    expect(mapThenAverage).toBeCloseTo((map(30) + map(0)) / 2, 9);
    expect(averageThenMap).toBeCloseTo(map(15), 9);
    // They genuinely differ, so the assertion above is not a tautology.
    expect(Math.abs(mapThenAverage - averageThenMap)).toBeGreaterThan(5);
  });

  it('uses whichever component it has when the other has no baseline', () => {
    const trendOnly = performanceScore({ trendChange: 10, ytdChange: null });
    expect(trendOnly.score).toBeCloseTo(800, 9);
    expect(trendOnly.components).toEqual(['trend']);

    const ytdOnly = performanceScore({ trendChange: null, ytdChange: -10 });
    expect(ytdOnly.score).toBeCloseTo(200, 9);
    expect(ytdOnly.components).toEqual(['ytd']);
  });

  it('never fills a missing component with a zero or a neutral 500', () => {
    const trendOnly = performanceScore({ trendChange: 10, ytdChange: null });
    // Averaging with 500 would give 650; averaging with 0 would give 400.
    expect(trendOnly.score).not.toBeCloseTo(650, 3);
    expect(trendOnly.score).not.toBeCloseTo(400, 3);
  });

  it('has nothing to say when neither window has a baseline', () => {
    const none = performanceScore({ trendChange: null, ytdChange: null });
    expect(none.score).toBeNull();
    expect(none.components).toEqual([]);
  });

  it('keeps the two weights summing to one', () => {
    expect(TRAINING_RATING.TREND_WEIGHT + TRAINING_RATING.YTD_WEIGHT).toBe(1);
    expect(TRAINING_RATING.ATTENDANCE_WEIGHT + TRAINING_RATING.PERFORMANCE_WEIGHT).toBeCloseTo(1, 12);
  });
});
