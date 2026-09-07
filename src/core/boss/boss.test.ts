import { describe, expect, it } from 'vitest';
import { RANKS, RATING } from '../config/constants';
import { RANK_LIST, rankForRating } from '../ranks';
import type { AppConfigSnapshot } from '../model';
import {
  BOSS_PROGRESS_MAX,
  bossEraOf,
  bossPointFor,
  equalWeights,
  normaliseWeights,
  progressToRating,
  rankForProgress,
  ratingToProgress,
} from './index';

const snapshot = (overrides: Partial<AppConfigSnapshot> = {}): AppConfigSnapshot => ({
  domains: [
    { id: 'd1', type: 'mental', enabled: true, settings: {} },
    { id: 'd2', type: 'gym', enabled: true, settings: { targetPerWeek: 3 } },
  ],
  questions: [],
  scoring: { editWindowDays: 3, scaleMin: 1, scaleMax: 10 },
  ...overrides,
});

describe('the ladder as one continuous scale', () => {
  it('puts each rank threshold exactly on its own integer', () => {
    RANKS.forEach((rank, index) => {
      expect(ratingToProgress(rank.min)).toBeCloseTo(index, 10);
    });
  });

  it('rises without a step anywhere across the whole rating range', () => {
    let previous = -1;
    for (let rating = 0; rating <= RATING.MAX; rating += 1) {
      const progress = ratingToProgress(rating);
      expect(progress).toBeGreaterThan(previous);
      previous = progress;
    }
  });

  it('keeps counting inside Legend rather than stopping at the top rank', () => {
    // Without this, further progress after reaching Legend would stop
    // contributing to the Boss at all — one maxed domain would freeze.
    const legend = RANK_LIST[RANK_LIST.length - 1]!;
    expect(ratingToProgress(legend.min)).toBeCloseTo(legend.index, 10);
    expect(ratingToProgress(RATING.MAX)).toBeCloseTo(BOSS_PROGRESS_MAX, 10);
    expect(ratingToProgress(975)).toBeGreaterThan(ratingToProgress(legend.min));
  });

  it('round-trips through the rating the rank machinery understands', () => {
    for (let rating = 0; rating <= RATING.MAX; rating += 7) {
      expect(progressToRating(ratingToProgress(rating))).toBeCloseTo(rating, 6);
    }
  });

  it('agrees with the rank a rating falls in', () => {
    for (let rating = 0; rating <= RATING.MAX; rating += 13) {
      expect(rankForProgress(ratingToProgress(rating)).id).toBe(rankForRating(rating).id);
    }
  });
});

describe('weights', () => {
  it('shares equally over whatever is enabled', () => {
    expect(equalWeights(['mental', 'gym'])).toEqual({ mental: 0.5, gym: 0.5 });
    expect(equalWeights([])).toEqual({});
  });

  it('rescales relative importance so the user never has to make it total 100', () => {
    const weights = normaliseWeights({ mental: 3, gym: 1 }, ['mental', 'gym']);
    expect(weights.mental).toBeCloseTo(0.75, 10);
    expect(weights.gym).toBeCloseTo(0.25, 10);
  });

  it('always sums to one', () => {
    const cases = [
      { raw: { mental: 2 }, domains: ['mental', 'gym', 'running'] as const },
      { raw: {}, domains: ['mental'] as const },
      { raw: { mental: -5, gym: 0 }, domains: ['mental', 'gym'] as const },
    ];
    for (const { raw, domains } of cases) {
      const weights = normaliseWeights(raw, [...domains]);
      const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it('never lets a domain vanish because its weight was left unset or zero', () => {
    const weights = normaliseWeights({ mental: 1, gym: 0 }, ['mental', 'gym']);
    expect(weights.gym).toBeGreaterThan(0);
  });

  it('ignores weights for domains that are not enabled', () => {
    const weights = normaliseWeights({ mental: 1, food: 99 }, ['mental']);
    expect(weights).toEqual({ mental: 1 });
  });
});

describe('which era a day is scored in', () => {
  it('reads a snapshot with no Boss weights as the RC2 era', () => {
    // This is the whole grandfathering mechanism: every snapshot RC2 wrote
    // lacks the field, so every pre-upgrade day replays as RC2 scored it.
    expect(bossEraOf(snapshot()).era).toBe('legacy');
  });

  it('reads a snapshot with weights as weighted, over its enabled domains', () => {
    const era = bossEraOf(snapshot({ boss: { weights: { mental: 1, gym: 1 } } }));
    expect(era.era).toBe('weighted');
    if (era.era !== 'weighted') return;
    expect(era.domains).toEqual(['mental', 'gym']);
    expect(era.weights.mental).toBeCloseTo(0.5, 10);
  });

  it('leaves a disabled domain out of the weighting entirely', () => {
    const era = bossEraOf(
      snapshot({
        domains: [
          { id: 'd1', type: 'mental', enabled: true, settings: {} },
          { id: 'd2', type: 'gym', enabled: false, settings: { targetPerWeek: 3 } },
        ],
        boss: { weights: { mental: 1, gym: 1 } },
      }),
    );
    if (era.era !== 'weighted') throw new Error('expected the weighted era');
    expect(era.domains).toEqual(['mental']);
    expect(era.weights.mental).toBe(1);
  });
});

describe('one day of Boss progress', () => {
  const weighted = bossEraOf(snapshot({ boss: { weights: { mental: 1, gym: 1 } } }));

  it('is the legacy progression itself in the RC2 era', () => {
    const point = bossPointFor({ era: 'legacy' }, { mental: 7 }, 3.5);
    expect(point.progress).toBe(3.5);
    expect(point.era).toBe('legacy');
    // The per-domain numbers are ignored: pre-upgrade history cannot move.
    expect(point.contributions).toEqual([]);
  });

  it('is the weighted mean of the domains that have started', () => {
    const point = bossPointFor(weighted, { mental: 4, gym: 2 }, null);
    expect(point.progress).toBeCloseTo(3, 10);
  });

  it('drops a domain that has never been used, rather than counting it zero', () => {
    // Switching Food on tomorrow must not halve a year of Wellbeing.
    const point = bossPointFor(weighted, { mental: 4, gym: null }, null);
    expect(point.progress).toBeCloseTo(4, 10);
    expect(point.contributions).toHaveLength(1);
    expect(point.contributions[0]?.weight).toBeCloseTo(1, 10);
  });

  it('honours relative importance', () => {
    const era = bossEraOf(snapshot({ boss: { weights: { mental: 3, gym: 1 } } }));
    const point = bossPointFor(era, { mental: 4, gym: 0 }, null);
    expect(point.progress).toBeCloseTo(3, 10);
  });

  it('reports a rating the rank machinery can consume', () => {
    const point = bossPointFor(weighted, { mental: 4, gym: 4 }, null);
    expect(rankForRating(point.rating).index).toBe(4);
  });
});
