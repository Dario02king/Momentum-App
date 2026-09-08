import { describe, expect, it } from 'vitest';
import { RATING } from '../config/constants';
import { rankById } from '../ranks';
import {
  applyAbstinenceDecay,
  currentAbstinence,
  decayFraction,
  decayPhaseFor,
  rankInterval,
  rankProgressOf,
  trainingAgeMonths,
} from './abstinence';

describe('training age', () => {
  it('counts completed calendar months', () => {
    expect(trainingAgeMonths('2026-01-15', '2026-01-31')).toBe(0);
    expect(trainingAgeMonths('2026-01-15', '2026-02-14')).toBe(0);
    expect(trainingAgeMonths('2026-01-15', '2026-02-15')).toBe(1);
    expect(trainingAgeMonths('2026-01-15', '2027-01-15')).toBe(12);
    expect(trainingAgeMonths('2026-01-15', '2027-01-14')).toBe(11);
  });

  it('never runs backwards', () => {
    expect(trainingAgeMonths('2026-06-01', '2026-01-01')).toBe(0);
  });
});

describe('which schedule applies', () => {
  it('puts each training age in exactly one phase', () => {
    expect(decayPhaseFor(0).perBlock).toBe(0.5);
    expect(decayPhaseFor(1).perBlock).toBe(0.5);
    expect(decayPhaseFor(2).perBlock).toBe(0.25);
    expect(decayPhaseFor(3).perBlock).toBe(0.25);
    expect(decayPhaseFor(4).perBlock).toBe(0.2);
    expect(decayPhaseFor(11).perBlock).toBe(0.2);
    expect(decayPhaseFor(12).perBlock).toBe(0.1);
    expect(decayPhaseFor(60).perBlock).toBe(0.1);
  });
});

describe('the decay schedules, at every boundary', () => {
  it('removes nothing before a whole block has passed', () => {
    for (const age of [0, 2, 4, 12]) {
      expect(decayFraction(0, age)).toBe(0);
      expect(decayFraction(1, age)).toBe(0);
      expect(decayFraction(6, age)).toBe(0);
      expect(decayFraction(13, age)).toBe(decayFraction(7, age));
      expect(decayFraction(20, age)).toBe(decayFraction(14, age));
    }
  });

  it('runs the month 1–2 schedule', () => {
    expect(decayFraction(7, 0)).toBeCloseTo(0.5, 12);
    expect(decayFraction(14, 1)).toBeCloseTo(1, 12);
    expect(decayFraction(21, 1)).toBeCloseTo(1, 12);
  });

  it('runs the months 3–4 schedule', () => {
    expect(decayFraction(7, 2)).toBeCloseTo(0.25, 12);
    expect(decayFraction(14, 2)).toBeCloseTo(0.5, 12);
    expect(decayFraction(21, 3)).toBeCloseTo(0.75, 12);
    expect(decayFraction(28, 3)).toBeCloseTo(1, 12);
    expect(decayFraction(35, 3)).toBeCloseTo(1, 12);
  });

  it('runs the months 5–12 schedule', () => {
    expect(decayFraction(7, 4)).toBeCloseTo(0.2, 12);
    expect(decayFraction(14, 5)).toBeCloseTo(0.4, 12);
    expect(decayFraction(21, 8)).toBeCloseTo(0.6, 12);
    expect(decayFraction(28, 11)).toBeCloseTo(0.8, 12);
    expect(decayFraction(35, 11)).toBeCloseTo(1, 12);
    expect(decayFraction(42, 11)).toBeCloseTo(1, 12);
  });

  it('runs the month 13 onward schedule', () => {
    for (let block = 1; block <= 10; block += 1) {
      expect(decayFraction(block * 7, 12)).toBeCloseTo(Math.min(1, block * 0.1), 12);
    }
    expect(decayFraction(70, 24)).toBeCloseTo(1, 12);
    expect(decayFraction(140, 24)).toBeCloseTo(1, 12);
  });

  it('is capped at everything, never more', () => {
    for (const age of [0, 2, 4, 12]) expect(decayFraction(3650, age)).toBe(1);
  });
});

describe('what decay does to a rating', () => {
  const veteran = rankById('veteran');

  it('takes the specification worked example exactly', () => {
    /*
     * Floor 500, next threshold 700, rating 660 → 80 % of the way through.
     * A 50 % decay leaves 40 %, which is 580.
     *
     * Those thresholds are the specification's illustration rather than a
     * rank on this ladder — Veteran runs 560 to 700 — so the interval is
     * spelled out here instead of borrowed, and the real ladder is exercised
     * by every other case in this file.
     */
    const rank = { id: 'veteran' as const, name: 'Veteran', min: 500, index: 4 };
    const result = applyAbstinenceDecay({
      baselineRating: 660,
      baselineRank: rank,
      days: 7,
      ageMonths: 0,
      max: RATING.MAX,
    });
    expect(rankProgressOf(660, { floor: 500, ceiling: 700 })).toBeCloseTo(0.8, 12);
    expect(result.progressBefore).toBeCloseTo(0.8, 12);
    expect(result.progressAfter).toBeCloseTo(0.4, 12);
    expect(result.rating).toBeCloseTo(580, 12);
  });

  it('measures progress inside the real Veteran interval', () => {
    // 560 to 700: a rating of 660 is five sevenths of the way through it.
    const interval = rankInterval(veteran, RATING.MAX);
    expect(interval).toEqual({ floor: 560, ceiling: 700 });
    expect(rankProgressOf(660, interval)).toBeCloseTo(100 / 140, 12);
  });

  it('is cumulative against the baseline, never compounded on the remainder', () => {
    // The 25 % phase over four weeks: 80 → 60 → 40 → 20 → 0, and not
    // 80 → 60 → 45 → 33.75, which is what compounding would give.
    const interval = rankInterval(veteran, RATING.MAX);
    const baseline = interval.floor + 0.8 * (interval.ceiling - interval.floor);
    const progress = [7, 14, 21, 28].map(
      (days) =>
        applyAbstinenceDecay({
          baselineRating: baseline,
          baselineRank: veteran,
          days,
          ageMonths: 2,
          max: RATING.MAX,
        }).progressAfter,
    );
    expect(progress[0]).toBeCloseTo(0.6, 12);
    expect(progress[1]).toBeCloseTo(0.4, 12);
    expect(progress[2]).toBeCloseTo(0.2, 12);
    expect(progress[3]).toBeCloseTo(0, 12);
    expect(progress[1]).not.toBeCloseTo(0.45, 3);
  });

  it('is idempotent: day 21 gives the same answer however it was reached', () => {
    const once = applyAbstinenceDecay({
      baselineRating: 640,
      baselineRank: veteran,
      days: 21,
      ageMonths: 2,
      max: RATING.MAX,
    });
    const again = applyAbstinenceDecay({
      baselineRating: 640,
      baselineRank: veteran,
      days: 21,
      ageMonths: 2,
      max: RATING.MAX,
    });
    expect(again.rating).toBe(once.rating);
  });

  it('never drops the user below the floor of the rank they hold', () => {
    const result = applyAbstinenceDecay({
      baselineRating: 700,
      baselineRank: veteran,
      days: 365,
      ageMonths: 0,
      max: RATING.MAX,
    });
    expect(result.fraction).toBe(1);
    expect(result.rating).toBe(veteran.min);
    expect(result.rating).toBeGreaterThanOrEqual(veteran.min);
  });

  it('leaves a rating already at the floor exactly where it is', () => {
    const result = applyAbstinenceDecay({
      baselineRating: veteran.min,
      baselineRank: veteran,
      days: 28,
      ageMonths: 0,
      max: RATING.MAX,
    });
    expect(result.rating).toBe(veteran.min);
  });

  it('measures Legend across the rest of the scale rather than a zero span', () => {
    const legend = rankById('legend');
    const interval = rankInterval(legend, RATING.MAX);
    expect(interval.floor).toBe(legend.min);
    expect(interval.ceiling).toBe(RATING.MAX);
    expect(rankProgressOf(975, interval)).toBeCloseTo(0.5, 12);
  });
});

describe('the abstinence run', () => {
  const dates = (list: string[]) => new Set(list);

  it('is null on a day a session was saved', () => {
    expect(currentAbstinence(dates(['2026-03-10']), '2026-03-01', '2026-03-10')).toBeNull();
  });

  it('counts back to the last session', () => {
    const episode = currentAbstinence(dates(['2026-03-01']), '2026-03-01', '2026-03-09');
    expect(episode?.days).toBe(8);
    expect(episode?.from).toBe('2026-03-02');
    expect(episode?.through).toBe('2026-03-09');
  });

  it('stops at the first day of the Gym journey rather than before it', () => {
    const episode = currentAbstinence(dates([]), '2026-03-01', '2026-03-05');
    expect(episode?.days).toBe(5);
    expect(episode?.from).toBe('2026-03-01');
  });

  it('starts a fresh run after any saved session', () => {
    const sessions = dates(['2026-03-01', '2026-03-12']);
    expect(currentAbstinence(sessions, '2026-03-01', '2026-03-11')?.days).toBe(10);
    expect(currentAbstinence(sessions, '2026-03-01', '2026-03-12')).toBeNull();
    expect(currentAbstinence(sessions, '2026-03-01', '2026-03-15')?.days).toBe(3);
  });
});
