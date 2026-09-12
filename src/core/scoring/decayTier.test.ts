import { describe, expect, it } from 'vitest';
import { RANKS, RANK_DEMOTION_HYSTERESIS, RATING } from '../config/constants';
import { rankForRating, rankWithHysteresis } from '../ranks';
import { decayTierAt, decayTierFor, holdDecayTier, tierProgressOf } from './decayTier';

/**
 * The decay tier is an interval of the shared ladder, held with the ladder's
 * own hysteresis. It carries no name and grants nothing; these tests pin the
 * two things that matter — that its bounds are exactly the thresholds every
 * rating is measured against, and that it holds the way the fold always has.
 */
describe('decay tiers', () => {
  it('are the intervals between the ladder thresholds, and nothing else', () => {
    RANKS.forEach((rank, index) => {
      const tier = decayTierAt(index);
      expect(tier.floor).toBe(rank.min);
      expect(tier.ceiling).toBe(RANKS[index + 1]?.min ?? RATING.MAX);
    });
  });

  it('find the tier a rating falls in exactly where the ladder would', () => {
    for (let rating = 0; rating <= RATING.MAX; rating += 0.5) {
      expect(decayTierFor(rating).floor).toBe(rankForRating(rating).min);
    }
  });

  it('rise immediately and fall only past the buffer, like the held rank did', () => {
    // 700 is a threshold: cleared at 700, held down to 685, dropped at 684.
    const held = holdDecayTier(700, null);
    expect(held.floor).toBe(700);
    expect(holdDecayTier(700 - RANK_DEMOTION_HYSTERESIS, held).floor).toBe(700);
    expect(holdDecayTier(700 - RANK_DEMOTION_HYSTERESIS - 1, held).floor).toBe(560);
    expect(holdDecayTier(830, held).floor).toBe(830);
    // Dropping goes to where the rating is, never merely one step down.
    expect(holdDecayTier(100, held).floor).toBe(0);
  });

  it('agree with the ladder resolver on every rating from every held tier', () => {
    for (const rank of RANKS) {
      const held = decayTierAt(RANKS.indexOf(rank));
      for (let rating = 0; rating <= RATING.MAX; rating += 1) {
        expect(holdDecayTier(rating, held).floor).toBe(rankWithHysteresis(rating, rank.id).min);
      }
    }
  });

  it('measure progress inside the interval, clamped at both ends', () => {
    const tier = decayTierAt(4);
    expect(tierProgressOf(560, tier)).toBe(0);
    expect(tierProgressOf(630, tier)).toBeCloseTo(0.5, 12);
    expect(tierProgressOf(700, tier)).toBe(1);
    expect(tierProgressOf(540, tier)).toBe(0);
    expect(tierProgressOf(0, { index: 0, floor: 0, ceiling: 0 })).toBe(1);
  });
});
