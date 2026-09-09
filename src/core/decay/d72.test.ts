import { describe, expect, it } from 'vitest';
import { RATING } from '../config/constants';
import { computeRating, decayForDay as reExported, type DayState } from '../rating';
import { APPROVED_DECAY, decayForDay } from './index';

/**
 * The approved general cooling-off formula (D72), in the words of the
 * decision rather than in terms of the constants that implement it.
 *
 * The decision ratified RC2's schedule unchanged:
 *
 * - two grace days
 * - days 3 to 7 cost 1.5 rating points each
 * - every day after that costs 3
 * - one episode can never cost more than 60
 *
 * These are asserted as literals on purpose. Reading them back out of
 * `RATING.DECAY` would pass however that table were edited, which is exactly
 * the mistake that would let an approved formula drift after approval.
 */

const scored = (recorded: boolean): DayState => ({
  date: '2026-01-01',
  status: 'scored',
  score: recorded ? 90 : null,
  recordedScore: recorded ? 90 : null,
  dueItems: 1,
  answeredItems: recorded ? 1 : 0,
  recorded,
  complete: recorded,
});

/** `n` silent days after a settled run of recorded ones. */
const absence = (n: number): DayState[] => [
  ...Array.from({ length: 30 }, () => scored(true)),
  ...Array.from({ length: n }, () => scored(false)),
];

const charges = (days: DayState[]): number[] =>
  computeRating(days).points.map((point) => point.decay).filter((value) => value > 0);

describe('the approved schedule, as the decision states it', () => {
  it('costs nothing on days 0, 1 and 2', () => {
    expect(decayForDay(0)).toBe(0);
    expect(decayForDay(1)).toBe(0);
    expect(decayForDay(2)).toBe(0);
    expect(charges(absence(2))).toEqual([]);
  });

  it('costs exactly 1.5 a day from day 3 to day 7', () => {
    for (const day of [3, 4, 5, 6, 7]) expect(decayForDay(day)).toBe(1.5);
    expect(charges(absence(7))).toEqual([1.5, 1.5, 1.5, 1.5, 1.5]);
  });

  it('costs exactly 3 a day from day 8 onwards', () => {
    for (const day of [8, 9, 20, 400]) expect(decayForDay(day)).toBe(3);
    expect(charges(absence(10))).toEqual([1.5, 1.5, 1.5, 1.5, 1.5, 3, 3, 3]);
  });

  it('never lets one episode cost more than 60', () => {
    // 5 × 1.5 + 3 × n reaches 60 at day 24 and must stop dead there.
    const total = computeRating(absence(200)).points.reduce(
      (sum, point) => sum + point.decay,
      0,
    );
    expect(total).toBe(60);
    const booked = charges(absence(200));
    expect(booked[booked.length - 1]).toBeGreaterThan(0);
    // And every day beyond the cap costs nothing at all.
    const points = computeRating(absence(200)).points;
    expect(points[points.length - 1]!.decay).toBe(0);
  });

  it('starts a fresh episode, with a fresh cap, after a recorded day', () => {
    const days = [
      ...Array.from({ length: 30 }, () => scored(true)),
      ...Array.from({ length: 200 }, () => scored(false)),
      scored(true),
      ...Array.from({ length: 200 }, () => scored(false)),
    ];
    const total = computeRating(days).points.reduce((sum, point) => sum + point.decay, 0);
    // Two episodes, each capped at 60 in its own right.
    expect(total).toBe(120);
  });

  it('costs a settled rating exactly what the schedule says over ten days', () => {
    const before = computeRating(absence(0));
    const after = computeRating(absence(10));
    expect(before.current - after.current).toBeCloseTo(1.5 * 5 + 3 * 3, 10);
  });
});

describe('one source of truth', () => {
  it('is the only place the schedule exists', () => {
    /*
     * The same function object, not two that agree. `core/rating` held a
     * second copy of this arithmetic until D72 was closed, and two
     * implementations of one rule can drift — the same defect as a cached
     * score. Identity is the assertion; equal outputs would not catch a
     * re-introduced duplicate.
     */
    expect(reExported).toBe(decayForDay);
    for (let day = 0; day <= 40; day += 1) {
      expect(APPROVED_DECAY.perDay({
        consecutiveInactiveDays: day,
        episodeSoFar: 0,
        restDay: false,
        paused: false,
      })).toBe(decayForDay(day));
    }
  });

  it('reads every constant from the one table', () => {
    expect(RATING.DECAY).toEqual({
      GRACE_DAYS: 2,
      SMALL_UNTIL_DAY: 7,
      SMALL_PER_DAY: 1.5,
      LARGE_PER_DAY: 3,
      MAX_PER_EPISODE: 60,
    });
  });
});

describe('what cooling-off may never do', () => {
  it('never turns an unrecorded day into a zero score', () => {
    const result = computeRating(absence(10));
    // A zero would cost a fortnight's progress for a week away. The rating
    // moves only by the decay, which is the whole point of the rule.
    const settled = computeRating(absence(0)).current;
    expect(result.current).toBeCloseTo(settled - (1.5 * 5 + 3 * 3), 10);
    expect(result.current).toBeGreaterThan(settled * 0.8);
  });

  it('never lowers the peak', () => {
    const settled = computeRating(absence(0));
    const decayed = computeRating(absence(200));
    expect(decayed.peak).toBe(settled.peak);
    expect(decayed.peak).toBeGreaterThan(decayed.current);
  });

  it('never returns a negative charge', () => {
    for (let day = 0; day <= 400; day += 1) {
      for (const episodeSoFar of [0, 30, 60, 10_000]) {
        expect(
          APPROVED_DECAY.perDay({ consecutiveInactiveDays: day, episodeSoFar, restDay: false, paused: false }),
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
