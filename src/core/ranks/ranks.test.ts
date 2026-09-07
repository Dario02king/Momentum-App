import { describe, expect, it } from 'vitest';
import { RANKS, RANK_DEMOTION_HYSTERESIS } from '../config/constants';
import {
  RANK_LIST,
  nextRank,
  pointsToNextRank,
  progressWithinRank,
  rankForRating,
  rankHistory,
  rankWithHysteresis,
} from './index';

describe('the ladder', () => {
  it('has eight ranks with no divisions, in ascending order', () => {
    expect(RANK_LIST).toHaveLength(8);
    for (let index = 1; index < RANK_LIST.length; index += 1) {
      expect(RANK_LIST[index]!.min).toBeGreaterThan(RANK_LIST[index - 1]!.min);
    }
  });

  it('keeps the rank names in English', () => {
    expect(RANKS.map((rank) => rank.name)).toEqual([
      'Rookie',
      'Challenger',
      'Contender',
      'Elite',
      'Veteran',
      'Master',
      'Champion',
      'Legend',
    ]);
  });

  it('places a rating in its tier', () => {
    expect(rankForRating(0).id).toBe('rookie');
    expect(rankForRating(119).id).toBe('rookie');
    expect(rankForRating(120).id).toBe('challenger');
    expect(rankForRating(409).id).toBe('contender');
    expect(rankForRating(410).id).toBe('elite');
    expect(rankForRating(949).id).toBe('champion');
    expect(rankForRating(950).id).toBe('legend');
    expect(rankForRating(1000).id).toBe('legend');
  });

  it('reports the distance to the next rank, and none at the top', () => {
    expect(pointsToNextRank(100)).toBe(20);
    expect(pointsToNextRank(950)).toBeNull();
    expect(nextRank(rankForRating(950))).toBeNull();
  });

  it('reports progress through a tier', () => {
    expect(progressWithinRank(120)).toBe(0);
    expect(progressWithinRank(190)).toBeCloseTo(0.5, 2);
    expect(progressWithinRank(1000)).toBe(1);
  });
});

describe('boundary hysteresis', () => {
  it('promotes as soon as the threshold is crossed', () => {
    expect(rankWithHysteresis(410, 'contender').id).toBe('elite');
  });

  it('holds the rank for a small dip below the threshold', () => {
    // Elite starts at 410; a few points below must not demote.
    expect(rankWithHysteresis(409, 'elite').id).toBe('elite');
    expect(rankWithHysteresis(410 - RANK_DEMOTION_HYSTERESIS, 'elite').id).toBe('elite');
  });

  it('demotes once the rating clears the buffer', () => {
    expect(rankWithHysteresis(410 - RANK_DEMOTION_HYSTERESIS - 1, 'elite').id).toBe('contender');
  });

  it('does not flicker for a rating hovering on a boundary', () => {
    let held: string = 'contender';
    for (const rating of [410, 408, 411, 405, 412, 402, 409]) {
      held = rankWithHysteresis(rating, held as never).id;
    }
    // Promoted once and stayed there, rather than swapping every day.
    expect(held).toBe('elite');
  });

  it('never claims a rank far above where the rating actually is', () => {
    expect(rankWithHysteresis(100, 'legend').id).toBe('rookie');
  });
});

describe('rank history', () => {
  const series = (ratings: number[]) =>
    ratings.map((rating, index) => ({ date: `2025-01-${String(index + 1).padStart(2, '0')}`, rating }));

  it('logs a promotion when a threshold is crossed', () => {
    // 250 is Challenger, so this series climbs two tiers.
    const { changes, current } = rankHistory(series([250, 300, 420]));
    expect(changes.map((change) => [change.from, change.to])).toEqual([
      ['challenger', 'contender'],
      ['contender', 'elite'],
    ]);
    expect(changes.every((change) => change.kind === 'promotion')).toBe(true);
    expect(current.id).toBe('elite');
  });

  it('logs a demotion only after the buffer is cleared', () => {
    const { changes } = rankHistory(series([420, 405, 400, 380]));
    expect(changes.map((change) => change.kind)).toEqual(['demotion']);
    expect(changes[0]?.to).toBe('contender');
  });

  it('keeps the peak rank when the rating falls back', () => {
    const { current, peak } = rankHistory(series([250, 720, 300, 200]));
    expect(peak.id).toBe('master');
    expect(current.index).toBeLessThan(peak.index);
  });

  it('never lets the peak decrease across a long series', () => {
    const ratings = [250, 400, 650, 300, 880, 120, 700];
    const { peak } = rankHistory(series(ratings));
    expect(peak.id).toBe('champion');

    let highest = 0;
    for (let end = 1; end <= ratings.length; end += 1) {
      const partial = rankHistory(series(ratings.slice(0, end))).peak.index;
      expect(partial).toBeGreaterThanOrEqual(highest);
      highest = partial;
    }
  });
});
