import { describe, expect, it } from 'vitest';
import { RANKS, RATING } from '../config/constants';
import { RANK_LIST, rankById, rankForRating } from './index';
import { displayedRankProgress, rankLadder, rankProgress } from './progress';

/**
 * The bar and the sentence under it have to describe the same journey.
 *
 * Every case here is a place where they could disagree, which is every case
 * where they used to.
 */

describe('the fill and the copy agree', () => {
  it('reads empty at a rank threshold, because none of the tier is done', () => {
    for (const rank of RANK_LIST) {
      const progress = rankProgress(rank.min, rank);
      expect(progress.fraction).toBe(0);
      expect(progress.percent).toBe(0);
      if (progress.next) {
        expect(progress.remaining).toBe(progress.next.min - rank.min);
      }
    }
  });

  it('reads full just under the next threshold', () => {
    for (const rank of RANK_LIST) {
      const next = rankProgress(rank.min, rank).next;
      if (!next) continue;
      const progress = rankProgress(next.min - 0.0001, rank);
      expect(progress.fraction).toBeGreaterThan(0.999);
      expect(progress.remaining).toBe(1);
    }
  });

  it('rolls over to the next rank one point above the threshold', () => {
    for (const rank of RANK_LIST) {
      const next = rankProgress(rank.min, rank).next;
      if (!next) continue;
      // The rank the rating now falls in, which is what a promoted user sees.
      const progress = rankProgress(next.min, rankForRating(next.min));
      expect(progress.rank.id).toBe(next.id);
      expect(progress.fraction).toBe(0);
    }
  });

  it('never overflows the bar or counts below zero', () => {
    for (let value = -50; value <= RATING.MAX + 50; value += 3) {
      for (const rank of RANK_LIST) {
        const progress = rankProgress(value, rank);
        expect(progress.fraction).toBeGreaterThanOrEqual(0);
        expect(progress.fraction).toBeLessThanOrEqual(1);
        expect(progress.remaining === null || progress.remaining >= 0).toBe(true);
      }
    }
  });
});

describe('the top of the ladder', () => {
  const legend = rankById('legend');

  it('has nothing to count down to, and says so rather than counting', () => {
    const progress = rankProgress(legend.min, legend);
    expect(progress.atMax).toBe(true);
    expect(progress.next).toBeNull();
    expect(progress.remaining).toBeNull();
  });

  it('keeps filling across the rest of the range, so improving still shows', () => {
    // Otherwise a Legend's bar would sit at the same place for ever.
    expect(rankProgress(legend.min, legend).fraction).toBe(0);
    expect(rankProgress((legend.min + RATING.MAX) / 2, legend).fraction).toBeCloseTo(0.5, 6);
    expect(rankProgress(RATING.MAX, legend).fraction).toBe(1);
  });
});

describe('a rank held by hysteresis', () => {
  const master = rankById('master');

  it('reads empty rather than negative when the rating has slipped below', () => {
    const progress = rankProgress(master.min - 10, master);
    expect(progress.belowFloor).toBe(true);
    expect(progress.fraction).toBe(0);
    expect(progress.percent).toBe(0);
  });

  it('counts to the rank above, which is what the bar is measuring', () => {
    // The defect this replaces: the fill used the held rank and the sentence
    // used the rank the rating falls in, so the bar was empty while the copy
    // said "12 points to Master" — the rank the user was already holding.
    const progress = rankProgress(master.min - 10, master);
    expect(progress.next?.id).toBe('champion');
    expect(progress.remaining).toBe(rankById('champion').min - (master.min - 10));
  });

  it('describes the tier it is showing, not the one the rating falls in', () => {
    const held = rankProgress(master.min - 10, master);
    const natural = rankProgress(master.min - 10);
    expect(held.rank.id).toBe('master');
    expect(natural.rank.id).toBe('veteran');
    expect(held.remaining).not.toBe(natural.remaining);
  });
});

describe('every rank boundary, exactly', () => {
  it.each(RANKS.map((rank) => [rank.id, rank.min] as const))(
    '%s at %i, one below and one above',
    (id, min) => {
      const rank = rankById(id);
      expect(rankProgress(min, rank).percent).toBe(0);

      const below = rankProgress(min - 1, rank);
      expect(below.percent).toBe(0);
      expect(below.belowFloor).toBe(true);

      const above = rankProgress(min + 1, rank);
      if (above.next) {
        expect(above.percent).toBeGreaterThanOrEqual(0);
        expect(above.remaining).toBe(above.next.min - min - 1);
      }
    },
  );
});

describe('the ladder', () => {
  it('marks everything up to the peak as earned and nothing above it', () => {
    const ladder = rankLadder(rankById('elite'));
    expect(ladder.filter((entry) => entry.earned).map((entry) => entry.rank.id)).toEqual([
      'rookie',
      'challenger',
      'contender',
      'elite',
    ]);
    expect(ladder.filter((entry) => !entry.earned)).toHaveLength(4);
  });

  it('is the whole ladder, so an unearned rank is still browsable', () => {
    expect(rankLadder(rankById('rookie'))).toHaveLength(RANKS.length);
  });
});

describe('the number on screen and the number in the sentence', () => {
  it('agree, because everything is derived from the rounded value', () => {
    // 671.6 shows as 672. Deriving "remaining" from 671.6 gives 29, and
    // 700 − 672 is 28: two right answers that read as one wrong one.
    for (let value = 600; value < 700; value += 0.1) {
      const progress = displayedRankProgress(value, rankById('veteran'));
      const shown = Math.round(value);
      expect(progress.remaining).toBe(700 - shown);
    }
  });

  it('still clamps and still handles the top of the ladder', () => {
    expect(displayedRankProgress(RATING.MAX, rankById('legend')).remaining).toBeNull();
    expect(displayedRankProgress(0, rankById('rookie')).percent).toBe(0);
  });
});
