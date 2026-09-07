import { describe, expect, it } from 'vitest';
import { RANKS, RATING } from '../config/constants';
import { addDays } from '../dates';
import { computeRating, decayForDay, smoothingFactor, streakBonus, type DayState } from './index';

const START = '2025-01-01';

function days(
  count: number,
  build: (index: number) => Partial<DayState>,
  start = START,
): DayState[] {
  return Array.from({ length: count }, (_, index) => {
    const overrides = build(index);
    const score = overrides.score ?? 0;
    return {
      date: addDays(start, index),
      status: 'scored' as const,
      score,
      // Fully reported unless a test says otherwise.
      recordedScore: score,
      dueItems: 3,
      answeredItems: 3,
      recorded: true,
      complete: true,
      ...overrides,
    };
  });
}

/** A run of perfect, fully answered days. */
const perfect = (count: number) => days(count, () => ({ score: 100 }));
/** A run of days on which nothing at all was recorded. */
const absent = (count: number, start = START) =>
  days(
    count,
    () => ({ score: 0, recordedScore: null, answeredItems: 0, recorded: false, complete: false }),
    start,
  );

describe('starting position', () => {
  it('starts at 250, not at zero and not at the midpoint', () => {
    expect(RATING.START).toBe(250);
    expect(computeRating([]).current).toBe(250);
  });

  it('puts a new user in the second rank rather than the worst one', () => {
    const rookie = RANKS[0];
    const challenger = RANKS[1];
    expect(RATING.START).toBeGreaterThan(rookie.min);
    expect(RATING.START).toBeGreaterThan(challenger.min);
  });
});

describe('core movement', () => {
  it('closes about half the gap to the target over one half-life', () => {
    const alpha = smoothingFactor(14);
    expect(alpha).toBeCloseTo(0.0483, 3);
    const result = computeRating(perfect(14));
    // From 250 towards 1000, half the gap is roughly 625 before the bonus.
    const settled = result.points[13]!.rating;
    expect(settled).toBeGreaterThan(590);
    expect(settled).toBeLessThan(680);
  });

  it('rises towards a sustained score and settles near it', () => {
    const result = computeRating(days(400, () => ({ score: 80 })));
    expect(result.current).toBeGreaterThan(795);
    expect(result.current).toBeLessThan(860); // 800 plus the capped bonus
  });

  it('never leaves the 0 to 1000 range', () => {
    const result = computeRating([...perfect(200), ...days(200, () => ({ score: 0 }))]);
    for (const point of result.points) {
      expect(point.rating).toBeGreaterThanOrEqual(0);
      expect(point.rating).toBeLessThanOrEqual(1000);
    }
  });

  it('a single bad day cannot cost a rank tier', () => {
    // Build a settled rating, then have one catastrophic day.
    const history = [...days(120, () => ({ score: 70 })), ...days(1, () => ({ score: 0 }))];
    const result = computeRating(history);
    const before = result.points[119]!.rating;
    const after = result.points[120]!.rating;
    const narrowestTier = Math.min(
      ...RANKS.slice(1).map((rank, index) => rank.min - RANKS[index]!.min),
    );
    expect(before - after).toBeLessThan(narrowestTier);
    expect(before - after).toBeLessThan(60);
  });
});

describe('the calibration period', () => {
  it('lets the rating rise but never fall for the first fourteen days', () => {
    const history = days(RATING.CALIBRATION_DAYS, (index) => ({
      score: index % 2 === 0 ? 90 : 0,
    }));
    const result = computeRating(history);
    let previous = 0;
    for (const point of result.points) {
      expect(point.rating).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(point.calibrating).toBe(true);
      previous = point.rating;
    }
  });

  it('never drops below the starting value while calibrating', () => {
    const result = computeRating(days(RATING.CALIBRATION_DAYS, () => ({ score: 0 })));
    // Fourteen days of answering everything badly. The moving average is held
    // at the starting value, and the rating sits above it only because the
    // check-ins themselves were completed — a streak counts turning up, not
    // the answers given.
    expect(result.current).toBe(RATING.START);
    expect(result.currentStreak).toBe(RATING.CALIBRATION_DAYS);
  });

  it('allows the rating to fall once calibration has passed', () => {
    const history = days(RATING.CALIBRATION_DAYS + 20, (index) => ({
      score: index < RATING.CALIBRATION_DAYS ? 90 : 0,
    }));
    const result = computeRating(history);
    const atEndOfCalibration = result.points[RATING.CALIBRATION_DAYS - 1]!.rating;
    expect(result.current).toBeLessThan(atEndOfCalibration);
  });

  it('counts only days that actually score towards calibration', () => {
    // Neutral days are not days of use, so they do not burn the window.
    const history = [
      ...days(30, () => ({ status: 'neutral' as const, score: null, recorded: false })),
      ...days(3, () => ({ score: 0 }), addDays(START, 30)),
    ];
    const result = computeRating(history);
    expect(result.points[32]!.calibrating).toBe(true);
    expect(result.points[32]!.rating).toBe(RATING.START);
  });
});

describe('the streak bonus', () => {
  it('adds roughly the per-day amount on the first day', () => {
    expect(streakBonus(1)).toBeCloseTo(RATING.STREAK_BONUS_PER_DAY, 0);
  });

  it('decays with the streak instead of accumulating', () => {
    const first = streakBonus(2) - streakBonus(1);
    const later = streakBonus(30) - streakBonus(29);
    expect(later).toBeLessThan(first);
  });

  it('never exceeds the cap, however long the streak', () => {
    for (const streak of [10, 50, 500, 5000]) {
      expect(streakBonus(streak)).toBeLessThanOrEqual(RATING.STREAK_BONUS_CAP);
    }
    expect(streakBonus(0)).toBe(0);
  });

  it('resets the streak on a day that was not completed', () => {
    const history = [
      ...perfect(10),
      ...days(2, () => ({ score: 50, complete: false }), addDays(START, 10)),
    ];
    const result = computeRating(history);
    expect(result.points[9]!.streak).toBe(10);
    expect(result.points[10]!.streak).toBe(0);
    expect(result.points[10]!.streakBonus).toBe(0);
  });

  it('gives up a lost streak gradually, never in one step', () => {
    /*
     * The streak is part of what the average tracks, not a figure added on
     * top, so losing one costs at most `alpha` of its worth per day.
     */
    const history = [
      ...days(200, () => ({ score: 60 })),
      ...days(1, () => ({ score: 60, complete: false }), addDays(START, 200)),
    ];
    const result = computeRating(history);
    const drop = result.points[199]!.rating - result.points[200]!.rating;
    expect(drop).toBeLessThan(smoothingFactor() * RATING.STREAK_BONUS_CAP + 1);
  });

  it('remembers the best streak after the current one breaks', () => {
    const history = [
      ...perfect(12),
      ...days(1, () => ({ score: 0, recorded: false, complete: false }), addDays(START, 12)),
    ];
    const result = computeRating(history);
    expect(result.currentStreak).toBe(0);
    expect(result.bestStreak).toBe(12);
  });
});

describe('inactivity', () => {
  it('costs nothing for the first two days', () => {
    expect(decayForDay(1)).toBe(0);
    expect(decayForDay(2)).toBe(0);
    expect(decayForDay(3)).toBeGreaterThan(0);
  });

  it('decays gradually, then a little faster', () => {
    expect(decayForDay(7)).toBeLessThan(decayForDay(8));
    expect(decayForDay(30)).toBe(decayForDay(8));
  });

  it('never lets a week away cost several tiers', () => {
    const settled = days(120, () => ({ score: 85 }));
    const holiday = absent(7, addDays(START, 120));
    const result = computeRating([...settled, ...holiday]);
    const before = result.points[119]!.rating;
    const after = result.points[126]!.rating;
    const narrowestTier = Math.min(
      ...RANKS.slice(1).map((rank, index) => rank.min - RANKS[index]!.min),
    );
    expect(before - after).toBeLessThan(narrowestTier);
  });

  it('caps the decay for a single long absence', () => {
    const settled = days(120, () => ({ score: 85 }));
    const result = computeRating([...settled, ...absent(120, addDays(START, 120))]);
    const before = result.points[119]!.rating;
    const after = result.points[239]!.rating;
    expect(before - after).toBeLessThanOrEqual(RATING.DECAY.MAX_PER_EPISODE + 1e-9);
  });

  it('stops decaying once the episode cap is spent', () => {
    const settled = days(60, () => ({ score: 85 }));
    const result = computeRating([...settled, ...absent(120, addDays(START, 60))]);
    const spent = result.points.slice(60).reduce((sum, point) => sum + point.decay, 0);
    expect(spent).toBeCloseTo(RATING.DECAY.MAX_PER_EPISODE, 6);
    // The last day of a long absence costs nothing more.
    expect(result.points[179]!.decay).toBe(0);
  });

  it('starts a fresh allowance after the user comes back', () => {
    const history = [
      ...days(60, () => ({ score: 85 })),
      ...absent(40, addDays(START, 60)),
      ...days(10, () => ({ score: 85 }), addDays(START, 100)),
      ...absent(40, addDays(START, 110)),
    ];
    const result = computeRating(history);

    // The first episode spends its whole allowance and then stops.
    const first = result.points.slice(60, 100).reduce((sum, point) => sum + point.decay, 0);
    expect(first).toBeCloseTo(RATING.DECAY.MAX_PER_EPISODE, 6);
    expect(result.points[99]!.decay).toBe(0);

    // The second is capped in its own right rather than continuing a running
    // total: it observes the grace days again and then decays afresh.
    expect(result.points[110]!.decay).toBe(0);
    expect(result.points[111]!.decay).toBe(0);
    expect(result.points[112]!.decay).toBeGreaterThan(0);
    const second = result.points.slice(110).reduce((sum, point) => sum + point.decay, 0);
    expect(second).toBeCloseTo(RATING.DECAY.MAX_PER_EPISODE, 6);
  });

  it('leaves the peak untouched', () => {
    const settled = days(200, () => ({ score: 95 }));
    const result = computeRating([...settled, ...absent(60, addDays(START, 200))]);
    expect(result.peak).toBeGreaterThan(result.current);
    expect(result.peak).toBe(Math.max(...result.points.map((point) => point.rating)));
  });

  it('does not decay on days when nothing was due', () => {
    const settled = days(60, () => ({ score: 85 }));
    const quiet = days(30, () => ({ status: 'neutral' as const, score: null, recorded: false }), addDays(START, 60));
    const result = computeRating([...settled, ...quiet]);
    expect(result.points[89]!.rating).toBe(result.points[59]!.rating);
  });

  it('does not decay while a day is still open', () => {
    const settled = days(60, () => ({ score: 85 }));
    const open = days(3, () => ({ status: 'open' as const, score: null, recorded: false }), addDays(START, 60));
    const result = computeRating([...settled, ...open]);
    expect(result.points[62]!.rating).toBe(result.points[59]!.rating);
  });
});

describe('determinism', () => {
  it('produces the same result every time it is replayed', () => {
    const history = days(90, (index) => ({
      score: (index * 17) % 101,
      recorded: index % 9 !== 0,
      complete: index % 3 === 0,
    }));
    const a = computeRating(history);
    const b = computeRating(history);
    expect(a.points.map((point) => point.rating)).toEqual(b.points.map((point) => point.rating));
  });

  it('does not let later days change an earlier one', () => {
    // The fold only ever reads backwards, which is what makes a past rating
    // stable when the user carries on using the app.
    const history = days(40, (index) => ({ score: (index * 13) % 101 }));
    const short = computeRating(history.slice(0, 20));
    const long = computeRating(history);
    expect(long.points.slice(0, 20).map((point) => point.rating)).toEqual(
      short.points.map((point) => point.rating),
    );
  });
});
