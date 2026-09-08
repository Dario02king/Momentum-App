import { describe, expect, it } from 'vitest';
import { GYM_RATING, RATING } from '../config/constants';
import { addDays } from '../dates';
import { rankForRating } from '../ranks';
import {
  computeGymRating,
  maintenanceHolds,
  movementFactor,
  targetRating,
  type GymRatingDay,
} from './rating';
import { mapPerformanceChangeToScore, performanceScore } from './score';

/* ── The target ─────────────────────────────────────────────────────────── */

describe('the target rating', () => {
  it('is exactly 40 % attendance and 60 % performance', () => {
    expect(targetRating({ attendance: 1000, performance: 0 })).toBeCloseTo(400, 9);
    expect(targetRating({ attendance: 0, performance: 1000 })).toBeCloseTo(600, 9);
    expect(targetRating({ attendance: 1000, performance: 500 })).toBeCloseTo(700, 9);
    expect(targetRating({ attendance: 600, performance: 800 })).toBeCloseTo(720, 9);
  });

  it('is attendance alone before any comparison exists', () => {
    // Not attendance plus a neutral 500, and not attendance plus a zero.
    expect(targetRating({ attendance: 800, performance: null })).toBe(800);
    expect(targetRating({ attendance: 800, performance: null })).not.toBeCloseTo(0.4 * 800 + 0.6 * 500, 3);
    expect(targetRating({ attendance: 800, performance: null })).not.toBeCloseTo(0.4 * 800, 3);
  });

  it('stays inside the scale', () => {
    expect(targetRating({ attendance: 1000, performance: 1000 })).toBe(RATING.MAX);
    expect(targetRating({ attendance: 0, performance: 0 })).toBe(RATING.MIN);
  });
});

/* ── Movement ───────────────────────────────────────────────────────────── */

describe('how fast the rating moves', () => {
  it('closes a tenth of the gap at ordinary levels', () => {
    for (const rating of [0, 120, 250, 410, 500]) {
      expect(movementFactor(rating, 900)).toBeCloseTo(GYM_RATING.BASE_MOVEMENT, 12);
    }
  });

  it('climbs more slowly the higher the rating already is', () => {
    const low = movementFactor(300, 1000);
    const middle = movementFactor(700, 1000);
    const high = movementFactor(900, 1000);
    expect(low).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(high);
    expect(middle).toBeCloseTo(0.06, 12);
    expect(high).toBeCloseTo(0.02, 12);
  });

  it('never protects a high rating from falling', () => {
    for (const rating of [300, 700, 900, 999]) {
      expect(movementFactor(rating, 100)).toBeCloseTo(GYM_RATING.BASE_MOVEMENT, 12);
    }
  });

  it('is monotone in the rating, and never negative', () => {
    let previous = Infinity;
    for (let rating = 0; rating <= 1000; rating += 1) {
      const factor = movementFactor(rating, 1000);
      expect(factor).toBeLessThanOrEqual(previous + 1e-12);
      expect(factor).toBeGreaterThanOrEqual(0);
      previous = factor;
    }
    // The two branches of the `min` meet where the scaling starts to bite.
    expect(movementFactor(499.999, 1000)).toBeCloseTo(movementFactor(500.001, 1000), 5);
  });

  it('produces a continuous movement where climbing turns into falling', () => {
    /*
     * The factor itself steps as the target crosses the rating — 2 % up from
     * 900, 10 % down from it — but the step lands exactly where the gap is
     * zero, so the movement the rating sees has no jump in it.
     */
    const move = (target: number) => (target - 900) * movementFactor(900, target);
    expect(move(900)).toBe(0);
    // Both one-sided limits go to zero with the gap, so there is no jump.
    expect(Math.abs(move(900.001))).toBeLessThan(1e-4);
    expect(Math.abs(move(899.999))).toBeLessThan(1e-3);
    expect(Math.abs(move(900.001) - move(899.999))).toBeLessThan(1e-3);
    expect(Math.abs(move(900 + 1e-9) - move(900 - 1e-9))).toBeLessThan(1e-9);
  });

  it('does not change what a performance is worth, only how fast it banks', () => {
    // Identical performance at two ratings: the same target, reached slower.
    const target = targetRating({ attendance: 1000, performance: mapPerformanceChangeToScore(8) });
    expect(targetRating({ attendance: 1000, performance: mapPerformanceChangeToScore(8) })).toBe(target);
    expect(target).toBeGreaterThan(850);
    expect(movementFactor(300, target)).toBeCloseTo(GYM_RATING.BASE_MOVEMENT, 12);
    expect(movementFactor(800, target)).toBeCloseTo(GYM_RATING.BASE_MOVEMENT * 0.4, 12);
    expect(movementFactor(800, target)).toBeLessThan(movementFactor(300, target));
  });
});

/* ── Maintenance ────────────────────────────────────────────────────────── */

describe('the one-year Maintenance rule', () => {
  const base = {
    ageMonths: 14,
    attendanceFraction: 1,
    performanceChange: 0,
    sufficientHistory: true,
  };

  it('holds once every condition is met', () => {
    expect(maintenanceHolds(base)).toBe(true);
  });

  it('does not apply before twelve months', () => {
    expect(maintenanceHolds({ ...base, ageMonths: 11 })).toBe(false);
    expect(maintenanceHolds({ ...base, ageMonths: 12 })).toBe(true);
  });

  it('needs the attendance target actually met', () => {
    expect(maintenanceHolds({ ...base, attendanceFraction: 0.99 })).toBe(false);
    expect(maintenanceHolds({ ...base, attendanceFraction: 2 })).toBe(true);
  });

  it('needs performance to be present, not merely absent', () => {
    expect(maintenanceHolds({ ...base, performanceChange: null })).toBe(false);
    expect(maintenanceHolds({ ...base, sufficientHistory: false })).toBe(false);
  });

  it('absorbs floating-point dust and nothing larger', () => {
    expect(maintenanceHolds({ ...base, performanceChange: 1e-12 })).toBe(true);
    expect(maintenanceHolds({ ...base, performanceChange: -1e-12 })).toBe(true);
    const tolerance = GYM_RATING.MAINTENANCE_TOLERANCE_PERCENT;
    expect(maintenanceHolds({ ...base, performanceChange: tolerance })).toBe(true);
    expect(maintenanceHolds({ ...base, performanceChange: tolerance * 1.001 })).toBe(false);
    expect(maintenanceHolds({ ...base, performanceChange: -1 })).toBe(false);
    expect(maintenanceHolds({ ...base, performanceChange: 1 })).toBe(false);
  });
});

/* ── The fold ───────────────────────────────────────────────────────────── */

const day = (date: string, patch: Partial<GymRatingDay> = {}): GymRatingDay => ({
  date,
  scored: true,
  sessionsInWeek: 3,
  weeklyTarget: 3,
  sessionToday: true,
  performance: performanceScore({ trendChange: null, ytdChange: null }),
  performanceChange: null,
  abstinentDays: 0,
  ageMonths: 0,
  enduranceUnlocked: false,
  ...patch,
});

const run = (count: number, patch: (index: number) => Partial<GymRatingDay> = () => ({})) =>
  computeGymRating(
    Array.from({ length: count }, (_, index) =>
      day(addDays('2026-01-05', index), patch(index)),
    ),
  );

describe('the rating fold', () => {
  it('moves towards the target rather than becoming it', () => {
    const result = run(1, () => ({ sessionsInWeek: 3, weeklyTarget: 3 }));
    const point = result.points[0]!;
    expect(point.target).toBe(1000);
    // 250 + 0.10 × 750
    expect(point.rating).toBeCloseTo(325, 9);
    expect(point.rating).toBeLessThan(point.target!);
  });

  it('approaches the target without ever overshooting it', () => {
    const result = run(120);
    let previous: number = RATING.START;
    for (const point of result.points) {
      expect(point.rating).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(point.rating).toBeLessThanOrEqual(1000);
      previous = point.rating;
    }
    expect(result.current).toBeGreaterThan(950);
  });

  it('takes longer to climb from a high rating than from a low one', () => {
    const early = run(2);
    const gainAt250 = early.points[0]!.rating - RATING.START;

    const late = computeGymRating([day('2026-06-01')], { start: 900 });
    const gainAt900 = late.points[0]!.rating - 900;

    expect(gainAt250).toBeGreaterThan(gainAt900);
    // And the slower climb is the movement factor, not a different target.
    expect(late.points[0]!.target).toBe(1000);
    expect(late.points[0]!.movement).toBeCloseTo(0.02, 12);
  });

  it('falls at the base rate whatever the rating', () => {
    const high = computeGymRating([day('2026-06-01', { sessionsInWeek: 0, sessionToday: false })], {
      start: 900,
    });
    // 900 + 0.10 × (0 − 900)
    expect(high.points[0]!.rating).toBeCloseTo(810, 9);
    expect(high.points[0]!.movement).toBeCloseTo(GYM_RATING.BASE_MOVEMENT, 12);
  });

  it('does not move on a day that did not count', () => {
    const result = computeGymRating([
      day('2026-01-05', { scored: false }),
      day('2026-01-06', { scored: false }),
    ]);
    expect(result.current).toBe(RATING.START);
    expect(result.points.every((point) => point.skipped)).toBe(true);
  });

  it('continues from where a previous model left the rating', () => {
    // An upgrade must neither create progress nor take it away.
    const carried = computeGymRating([day('2026-06-01')], { start: 612.5 });
    // One ordinary step from 612.5 — slowed by the headroom scaling, which is
    // the point: continuing is a step, never a jump.
    const factor = movementFactor(612.5, 1000);
    expect(carried.points[0]!.rating).toBeCloseTo(612.5 + factor * (1000 - 612.5), 9);
    expect(carried.points[0]!.rating).toBeGreaterThan(612.5);
    expect(carried.points[0]!.rating).toBeLessThan(1000);
  });

  it('uses performance from the first valid comparison, not after a month', () => {
    const withPerformance = performanceScore({ trendChange: 10, ytdChange: 10 });
    const result = computeGymRating([
      day('2026-01-05', { performance: withPerformance, performanceChange: 10 }),
    ]);
    // 0.4 × 1000 + 0.6 × 800 = 880
    expect(result.points[0]!.target).toBeCloseTo(880, 9);
  });
});

describe('abstinence inside the fold', () => {
  const unlocked = { enduranceUnlocked: true, ageMonths: 2 };

  /** Trains hard for a while, then stops dead. */
  const stopAfter = (trainingDays: number, totalDays: number) =>
    computeGymRating(
      Array.from({ length: totalDays }, (_, index) => {
        const training = index < trainingDays;
        return day(addDays('2026-01-05', index), {
          ...unlocked,
          sessionsInWeek: training ? 3 : 0,
          sessionToday: training,
          abstinentDays: training ? 0 : index - trainingDays + 1,
        });
      }),
      { start: 640 },
    );

  it('does not decay before seven days', () => {
    const result = stopAfter(1, 7);
    expect(result.points.slice(1).every((point) => !point.decaying)).toBe(true);
    expect(result.points.slice(1).every((point) => point.decayFraction === 0)).toBe(true);
  });

  it('starts decaying on the seventh abstinent day', () => {
    const result = stopAfter(1, 8);
    const seventh = result.points[7]!;
    expect(seventh.decaying).toBe(true);
    expect(seventh.decayFraction).toBeCloseTo(0.25, 12);
  });

  it('sets the rating from the schedule rather than also moving the gap', () => {
    const result = stopAfter(1, 8);
    const seventh = result.points[7]!;
    expect(seventh.target).toBeNull();
    expect(seventh.movement).toBe(0);
  });

  it('never takes the user below the floor of the rank the episode began in', () => {
    /*
     * The guarantee is about the decay event, and only about it. The days
     * before an absence becomes an episode are ordinary missed attendance,
     * which is a real result and may move the rating anywhere; from the
     * seventh day the schedule takes over and the floor holds.
     */
    const result = stopAfter(1, 40);
    const first = result.points.findIndex((point) => point.decaying);
    expect(first).toBeGreaterThan(0);
    const floor = rankForRating(result.points[first - 1]!.rating).min;
    for (const point of result.points.slice(first)) {
      expect(point.decaying).toBe(true);
      expect(point.rating).toBeGreaterThanOrEqual(floor - 1e-9);
    }
    // And it really did decay rather than merely sitting still.
    expect(result.points[result.points.length - 1]!.rating).toBeLessThan(
      result.points[first - 1]!.rating,
    );
  });

  it('bottoms out at the floor and goes no further, however long the absence', () => {
    const result = stopAfter(1, 400);
    const first = result.points.findIndex((point) => point.decaying);
    const floor = rankForRating(result.points[first - 1]!.rating).min;
    // A full 100 % decay lands exactly on the floor and stays there.
    expect(result.points[result.points.length - 1]!.decayFraction).toBe(1);
    expect(result.current).toBeCloseTo(floor, 9);
    for (const point of result.points.slice(first)) {
      expect(point.rating).toBeGreaterThanOrEqual(floor - 1e-9);
    }
  });

  it('does not decay at all before the Endurance Phase is complete', () => {
    const locked = computeGymRating(
      Array.from({ length: 30 }, (_, index) =>
        day(addDays('2026-01-05', index), {
          enduranceUnlocked: false,
          sessionsInWeek: 0,
          sessionToday: false,
          abstinentDays: index + 1,
        }),
      ),
      { start: 640 },
    );
    expect(locked.points.every((point) => !point.decaying)).toBe(true);
  });

  it('stops the moment a session is saved, and does not give the loss back', () => {
    const days: GymRatingDay[] = [];
    for (let index = 0; index < 14; index += 1) {
      days.push(day(addDays('2026-01-05', index), {
        ...unlocked,
        sessionsInWeek: 0,
        sessionToday: false,
        abstinentDays: index + 1,
      }));
    }
    const decayed = computeGymRating(days, { start: 640 }).current;
    // One session on day 15 ends the episode; the rating then moves normally.
    const resumed = computeGymRating(
      [...days, day(addDays('2026-01-05', 14), { ...unlocked, sessionsInWeek: 1, abstinentDays: 0 })],
      { start: 640 },
    );
    const after = resumed.points[14]!;
    expect(after.decaying).toBe(false);
    expect(after.target).not.toBeNull();
    // It resumes from the decayed rating, not from where it was before.
    expect(after.rating).toBeLessThan(640);
    expect(decayed).toBeLessThan(640);
  });
});

describe('maintenance inside the fold', () => {
  const holding = (ageMonths: number, change: number, start: number) =>
    computeGymRating(
      [
        day('2027-06-01', {
          ageMonths,
          sessionsInWeek: 3,
          weeklyTarget: 3,
          performance: performanceScore({ trendChange: change, ytdChange: change }),
          performanceChange: change,
        }),
      ],
      { start },
    ).points[0]!;

  it('lets neutral performance hold a high rating after a year', () => {
    const point = holding(13, 0, 780);
    expect(point.maintenance).toBe(true);
    expect(point.rating).toBeCloseTo(780, 9);
  });

  it('does not hold it before a year', () => {
    const point = holding(11, 0, 780);
    expect(point.maintenance).toBe(false);
    // 0.4 × 1000 + 0.6 × 500 = 700, which is below 780, so it drags down.
    expect(point.target).toBeCloseTo(700, 9);
    expect(point.rating).toBeLessThan(780);
  });

  it('still lets positive performance raise the rating', () => {
    const point = holding(13, 10, 780);
    // 0.4 × 1000 + 0.6 × 800 = 880
    expect(point.target).toBeCloseTo(880, 9);
    expect(point.rating).toBeGreaterThan(780);
  });

  it('still lets negative performance lower it', () => {
    const point = holding(13, -10, 780);
    expect(point.maintenance).toBe(false);
    expect(point.rating).toBeLessThan(780);
  });

  it('still lets missed attendance lower it', () => {
    const point = computeGymRating(
      [
        day('2027-06-01', {
          ageMonths: 13,
          sessionsInWeek: 1,
          weeklyTarget: 3,
          sessionToday: true,
          performance: performanceScore({ trendChange: 0, ytdChange: 0 }),
          performanceChange: 0,
        }),
      ],
      { start: 780 },
    ).points[0]!;
    expect(point.maintenance).toBe(false);
    expect(point.rating).toBeLessThan(780);
  });

  it('survives floating-point noise around zero', () => {
    for (const noise of [0, 1e-14, -1e-14, 2e-9, -2e-9]) {
      expect(holding(13, noise, 780).maintenance).toBe(true);
    }
  });

  it('does not hold a rating the user has not reached', () => {
    // Maintenance is a floor under the target, never a lift above it.
    const point = holding(13, 0, 400);
    expect(point.rating).toBeGreaterThan(400);
    expect(point.target).toBeCloseTo(700, 9);
  });
});
