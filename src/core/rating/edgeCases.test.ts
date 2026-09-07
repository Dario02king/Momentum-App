import { describe, expect, it } from 'vitest';
import { RANKS, RATING } from '../config/constants';
import { addDays } from '../dates';
import { rankHistory } from '../ranks';
import { computeRating, decayForDay, smoothingFactor, type DayState } from './index';

/**
 * Two ways §13 could be undermined without any screen looking wrong.
 *
 * Both were reproduced against the engine before being fixed, and both are
 * pinned here because the failure mode is a slow drift in incentives rather
 * than anything a screenshot would reveal.
 */

const START = '2025-01-01';

function day(index: number, overrides: Partial<DayState> = {}): DayState {
  const score = overrides.score ?? 100;
  return {
    date: addDays(START, index),
    status: 'scored',
    score,
    recordedScore: score,
    dueItems: 3,
    answeredItems: 3,
    recorded: true,
    complete: true,
    ...overrides,
  };
}

const LEGEND = RANKS.find((rank) => rank.id === 'legend')!.min;

describe('one bad day, counting its whole tail', () => {
  /**
   * The rule is about the total downstream effect of a day, not the next
   * frame: a bad day must not be able to demote the user several days later
   * through after-effects while performance has already recovered.
   */
  function sequence(badDay: Partial<DayState>) {
    const settle = Array.from({ length: 220 }, (_, index) => day(index, { score: 97 }));
    const bad = day(220, badDay);
    const after = Array.from({ length: 20 }, (_, index) => day(221 + index, { score: 97 }));
    return computeRating([...settle, ...bad ? [bad] : [], ...after]);
  }

  it('settles a strong user just inside the top rank', () => {
    const result = sequence({ score: 97 });
    expect(result.points[219]!.rating).toBeGreaterThan(LEGEND);
  });

  it('takes its hit on the day itself, not over the days that follow', () => {
    const result = sequence({ score: 40, complete: false, recordedScore: 40 });
    const before = result.points[219]!.rating;
    const onTheDay = result.points[220]!.rating;
    const afterwards = result.points.slice(221, 241).map((point) => point.rating);
    const trough = Math.min(...afterwards);

    expect(onTheDay).toBeLessThan(before);

    /*
     * Under the previous model the unwinding streak bonus kept pulling the
     * rating down for three more days — about thirty-five further points —
     * while every one of those days was perfect. What is left is the carried
     * bonus lapsing for a single day, worth a fraction of a point.
     */
    expect(onTheDay - trough).toBeLessThan(1);
    for (let index = 222; index < 241; index += 1) {
      expect(result.points[index]!.rating).toBeGreaterThan(result.points[index - 1]!.rating);
    }
  });

  it('does not cost the rank, on the day or in the days that follow', () => {
    const result = sequence({ score: 40, complete: false, recordedScore: 40 });
    const { changes } = rankHistory(
      result.points.map((point) => ({ date: point.date, rating: point.rating })),
    );
    expect(changes.filter((change) => change.kind === 'demotion')).toEqual([]);
  });

  it('still demotes when performance genuinely stays down', () => {
    // The protection must not become an inability to ever fall.
    const settle = Array.from({ length: 220 }, (_, index) => day(index, { score: 97 }));
    const poor = Array.from({ length: 90 }, (_, index) =>
      day(220 + index, { score: 30, recordedScore: 30 }),
    );
    const result = computeRating([...settle, ...poor]);
    const { changes, current } = rankHistory(
      result.points.map((point) => ({ date: point.date, rating: point.rating })),
    );
    expect(changes.some((change) => change.kind === 'demotion')).toBe(true);
    expect(current.index).toBeLessThan(RANKS.length - 1);
  });
});

describe('reporting part of a day is never worse than reporting none of it', () => {
  /**
   * An unrecorded day is treated forgivingly by §13 so a holiday cannot cost
   * several tiers. That forgiveness must not turn into a reason to stay
   * silent when the day went partly well.
   */
  const settled = () => Array.from({ length: 200 }, (_, index) => day(index, { score: 90 }));

  function move(next: Partial<DayState>) {
    const history = [...settled(), day(200, next)];
    const result = computeRating(history);
    return result.points[200]!.rating - result.points[199]!.rating;
  }

  const silenceOnFirstDay = move({
    score: 0,
    recordedScore: null,
    answeredItems: 0,
    recorded: false,
    complete: false,
  });

  it('costs nothing to be absent for a day, by design', () => {
    expect(silenceOnFirstDay).toBe(0);
  });

  it('rewards logging the part of the day that went well', () => {
    // One of three questions answered "yes". Dividing by items due would
    // have called this a 33% day and taken about 27 points off.
    expect(move({ score: 100 / 3, recordedScore: 100, answeredItems: 1, complete: false }))
      .toBeGreaterThan(silenceOnFirstDay);
  });

  it('rewards it more as more of the day is logged', () => {
    const one = move({ score: 100 / 3, recordedScore: 100, answeredItems: 1, complete: false });
    const two = move({ score: 200 / 3, recordedScore: 100, answeredItems: 2, complete: false });
    const all = move({ score: 100, recordedScore: 100, answeredItems: 3, complete: true });
    expect(two).toBeGreaterThan(one);
    expect(all).toBeGreaterThan(two);
  });

  it('never makes a good partial day worse than staying silent', () => {
    // Reporting part of a day that went as well as usual is at least as good
    // as reporting nothing, however little of it was reported.
    for (const answered of [1, 2, 3]) {
      expect(
        move({
          score: (90 * answered) / 3,
          recordedScore: 90,
          answeredItems: answered,
          complete: answered === 3,
        }),
      ).toBeGreaterThanOrEqual(silenceOnFirstDay);
    }
  });

  it('scales the cost of a bad day with how much of it was reported', () => {
    const one = move({ score: 0, recordedScore: 0, answeredItems: 1, complete: false });
    const two = move({ score: 0, recordedScore: 0, answeredItems: 2, complete: false });
    const three = move({ score: 0, recordedScore: 0, answeredItems: 3, complete: false });
    // Strictly proportional to how much was said, with no cliff at the last
    // answer — a cliff there would make it worth leaving one question
    // permanently blank.
    expect(one).toBeGreaterThan(two);
    expect(two).toBeGreaterThan(three);
    expect(Math.abs(one - two)).toBeCloseTo(Math.abs(two - three), 5);
  });

  it('keeps the residual gap between an honest "no" and silence bounded', () => {
    /*
     * Reporting a failure is real information and does cost more than saying
     * nothing — that difference is inherent to §13's protection for days the
     * user was simply away, and cannot be removed without either punishing
     * holidays or ignoring reported failure.
     *
     * What matters is that it stays small next to a tier, and that it shrinks
     * as less of the day is reported, meeting silence continuously.
     */
    const worst = Math.abs(move({ score: 0, recordedScore: 0, answeredItems: 1, complete: false }));
    const narrowestTier = Math.min(
      ...RANKS.slice(1).map((rank, index) => rank.min - RANKS[index]!.min),
    );
    expect(worst).toBeLessThan(narrowestTier / 5);
    expect(worst).toBeLessThan(smoothingFactor() * RATING.MAX * 0.4);
  });

  it('does not make a long silence cheaper than a long honest slump', () => {
    // Over time the forgiving treatment is bounded by the episode cap, so
    // sustained absence still costs — it simply costs less than sustained,
    // reported failure, which is the intended ordering.
    const absent = computeRating([
      ...settled(),
      ...Array.from({ length: 40 }, (_, index) =>
        day(200 + index, {
          score: 0,
          recordedScore: null,
          answeredItems: 0,
          recorded: false,
          complete: false,
        }),
      ),
    ]);
    const failing = computeRating([
      ...settled(),
      ...Array.from({ length: 40 }, (_, index) =>
        day(200 + index, { score: 0, recordedScore: 0 }),
      ),
    ]);
    expect(absent.current).toBeLessThan(absent.points[199]!.rating);
    expect(failing.current).toBeLessThan(absent.current);
    expect(decayForDay(RATING.DECAY.GRACE_DAYS + 1)).toBeGreaterThan(0);
  });
});
