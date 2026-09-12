import { describe, expect, it } from 'vitest';
import { RANKS, RANK_DEMOTION_HYSTERESIS, RANK_PROMOTION_CONFIRMATION_DAYS } from '../config/constants';
import { addDays, type DateKey } from '../dates';
import { rankById, rankHistory } from './index';
import {
  canonicalConfirmation,
  confirmationIndicator,
  confirmedRankHistory,
  serialiseConfirmation,
  thresholdReached,
  type ConfirmationDay,
} from './confirmation';

/**
 * The promotion confirmation fold (D126), case by case.
 *
 * Every scenario is built from dated days with a rating, a scored flag and a
 * paused flag — the same three facts the Boss replay hands the fold — so
 * what is asserted here is exactly what the app computes.
 */

const D0: DateKey = '2026-03-02'; // a Monday
const day = (index: number) => addDays(D0, index);

interface Spec {
  rating: number;
  scored?: boolean;
  paused?: boolean;
}

function days(specs: Spec[]): ConfirmationDay[] {
  return specs.map((spec, index) => ({
    date: day(index),
    rating: spec.rating,
    scored: spec.scored ?? true,
    paused: spec.paused ?? false,
  }));
}

/** Three legacy days at 300 (Contender), then the era begins on day 3. */
const LEGACY: Spec[] = [{ rating: 300 }, { rating: 300 }, { rating: 300 }];
const FROM = day(3);
const ELITE = rankById('elite').min; // 410
const ABOVE = ELITE + 10;
const BELOW = ELITE - 10;

const fold = (specs: Spec[], today: DateKey) =>
  confirmedRankHistory(days(specs), { from: FROM, today });

const repeat = (spec: Spec, count: number): Spec[] => Array.from({ length: count }, () => ({ ...spec }));

describe('basic confirmation', () => {
  it('1 — seven qualifying past days promote on the seventh', () => {
    const specs = [...LEGACY, ...repeat({ rating: ABOVE }, 7)];
    const result = fold(specs, day(10));
    expect(result.current.id).toBe('elite');
    expect(result.changes).toEqual([
      { date: day(9), kind: 'promotion', from: 'contender', to: 'elite', rating: ABOVE },
    ]);
    expect(result.pending).toEqual({ targetRankId: 'veteran', eligibleDates: [], required: 7 });
  });

  it('2 — a scored day below the threshold resets the set', () => {
    const specs = [...LEGACY, ...repeat({ rating: ABOVE }, 3), { rating: BELOW }, ...repeat({ rating: ABOVE }, 3)];
    const result = fold(specs, day(10));
    expect(result.current.id).toBe('contender');
    expect(result.pending?.eligibleDates).toEqual([day(7), day(8), day(9)]);
  });

  it('3 — paused days freeze: neither count nor reset', () => {
    const specs = [...LEGACY, ...repeat({ rating: ABOVE }, 3), { rating: ABOVE, paused: true }, { rating: BELOW, paused: true }, ...repeat({ rating: ABOVE }, 2)];
    const result = fold(specs, day(10));
    expect(result.pending?.eligibleDates).toEqual([day(3), day(4), day(5), day(8), day(9)]);
  });

  it('4 — a scored rest day needs no rule: its rating counts as produced', () => {
    // A rest day inside a trained week is `scored` by the ordinary scoring;
    // the fold sees a scored day and uses the rating it was given.
    const specs = [...LEGACY, { rating: ABOVE }, { rating: ABOVE, scored: true }, { rating: ABOVE }];
    expect(fold(specs, day(6)).pending?.eligibleDates).toEqual([day(3), day(4), day(5)]);
  });

  it('5 — the current day above the threshold shows 0/7 and does not count', () => {
    const specs = [...LEGACY, { rating: ABOVE }];
    const result = fold(specs, day(3));
    expect(result.pending?.eligibleDates).toEqual([]);
    expect(confirmationIndicator(ABOVE, result.pending)).toEqual({ targetRankId: 'elite', count: 0, required: 7 });
  });

  it('6 — the same day counts once it has become yesterday', () => {
    const specs = [...LEGACY, { rating: ABOVE }, { rating: ABOVE }];
    expect(fold(specs, day(4)).pending?.eligibleDates).toEqual([day(3)]);
    expect(fold(specs, day(5)).pending?.eligibleDates).toEqual([day(3), day(4)]);
  });

  it('7 — a neutral past day freezes', () => {
    const specs = [...LEGACY, { rating: ABOVE }, { rating: ABOVE, scored: false }, { rating: ABOVE }];
    expect(fold(specs, day(6)).pending?.eligibleDates).toEqual([day(3), day(5)]);
  });

  it('8 — an open past day freezes, even with its carried rating below the threshold', () => {
    const specs = [...LEGACY, { rating: ABOVE }, { rating: BELOW, scored: false }, { rating: ABOVE }];
    expect(fold(specs, day(6)).pending?.eligibleDates).toEqual([day(3), day(5)]);
  });

  it('counts strictly past days: a future day is ignored', () => {
    const specs = [...LEGACY, { rating: ABOVE }, { rating: ABOVE }, { rating: ABOVE }];
    expect(fold(specs, day(4)).pending?.eligibleDates).toEqual([day(3)]);
  });
});

describe('the set and its serialisation', () => {
  it('9 — the same date handed in twice is counted once', () => {
    const list = days([...LEGACY, { rating: ABOVE }, { rating: ABOVE }]);
    list.push({ ...list[4]! });
    const result = confirmedRankHistory(list, { from: FROM, today: day(6) });
    expect(result.pending?.eligibleDates).toEqual([day(3), day(4)]);
  });

  it('12 — replaying twice is byte-identical', () => {
    const specs = [...LEGACY, ...repeat({ rating: ABOVE }, 9), { rating: BELOW }, ...repeat({ rating: ABOVE }, 4)];
    const a = JSON.stringify(fold(specs, day(17)));
    const b = JSON.stringify(fold(specs, day(17)));
    expect(a).toBe(b);
  });

  it('13 — the canonical state is always sorted and unique, in one key order', () => {
    const canonical = canonicalConfirmation(FROM, {
      targetRankId: 'elite',
      eligibleDates: [day(5), day(3), day(5), day(4)],
      required: 7,
    });
    expect(canonical).toEqual({ from: FROM, targetRankId: 'elite', eligibleDates: [day(3), day(4), day(5)] });
    expect(Object.keys(canonical)).toEqual(['from', 'targetRankId', 'eligibleDates']);
    expect(serialiseConfirmation({ eligibleDates: [day(5), day(3)], targetRankId: 'elite', from: FROM } as never)).toBe(
      JSON.stringify({ from: FROM, targetRankId: 'elite', eligibleDates: [day(3), day(5)] }),
    );
  });
});

describe('editing a counted day', () => {
  it('14 — a counted day edited below the threshold corrects the sequence', () => {
    const before = [...LEGACY, ...repeat({ rating: ABOVE }, 3)];
    expect(fold(before, day(6)).pending?.eligibleDates).toEqual([day(3), day(4), day(5)]);
    const after = [...LEGACY, { rating: BELOW }, { rating: ABOVE }, { rating: ABOVE }];
    expect(fold(after, day(6)).pending?.eligibleDates).toEqual([day(4), day(5)]);
  });

  it('15 — a below-threshold day edited above rebuilds the sequence', () => {
    const before = [...LEGACY, { rating: ABOVE }, { rating: BELOW }, { rating: ABOVE }];
    expect(fold(before, day(6)).pending?.eligibleDates).toEqual([day(5)]);
    const after = [...LEGACY, { rating: ABOVE }, { rating: ABOVE }, { rating: ABOVE }];
    expect(fold(after, day(6)).pending?.eligibleDates).toEqual([day(3), day(4), day(5)]);
  });

  it('16 — the legacy prefix is walked by the legacy rule, verbatim', () => {
    // A prefix with a promotion, a dip and a sustained demotion in it.
    const prefix: Spec[] = [
      { rating: 300 }, { rating: 430 }, { rating: 600 }, { rating: 500 }, { rating: 380 }, { rating: 380 }, { rating: 380 },
    ];
    const tail: Spec[] = repeat({ rating: ABOVE }, 4);
    const from = day(prefix.length);
    const result = confirmedRankHistory(days([...prefix, ...tail]), { from, today: day(prefix.length + 4) });
    const legacy = rankHistory(days(prefix).map((d) => ({ date: d.date, rating: d.rating })));
    expect(result.legacyPoints).toBe(prefix.length);
    expect(result.changes.slice(0, legacy.changes.length)).toEqual(legacy.changes);
    expect(result.peak.id).toBe(legacy.peak.id);
    // And the tail starts from the legacy result, not from scratch.
    expect(result.pending?.targetRankId).toBe(rankById(legacy.current.id).id === 'contender' ? 'elite' : 'veteran');
  });
});

describe('the era boundary', () => {
  it('17 — a legacy promotion on the activation day is kept', () => {
    // The activation day is the last legacy day: it promotes immediately.
    const specs = [{ rating: 300 }, { rating: 300 }, { rating: ABOVE }, { rating: ABOVE }];
    const result = fold(specs, day(3));
    expect(result.current.id).toBe('elite');
    expect(result.changes).toEqual([
      { date: day(2), kind: 'promotion', from: 'contender', to: 'elite', rating: ABOVE },
    ]);
  });

  it('18 — activation itself awards nothing', () => {
    const result = fold(LEGACY, day(2));
    expect(result.changes).toEqual([]);
    expect(result.current.id).toBe('contender');
    expect(result.pending).toEqual({ targetRankId: 'elite', eligibleDates: [], required: 7 });
  });

  it('21 — history before the boundary never seeds the set', () => {
    // Days above the Elite threshold before the boundary: the legacy rule
    // opens at Elite, and the new era starts empty towards Veteran. The two
    // new-era days at the same rating are below *that* threshold and reset.
    const specs = [...repeat({ rating: ABOVE }, 3), ...repeat({ rating: ABOVE }, 2)];
    const result = fold(specs, day(5));
    expect(result.current.id).toBe('elite');
    expect(result.changes).toEqual([]);
    expect(result.pending).toEqual({ targetRankId: 'veteran', eligibleDates: [], required: 7 });
    // Above Veteran from the boundary on: only the new-era days are counted.
    const climbing = [...repeat({ rating: ABOVE }, 3), ...repeat({ rating: rankById('veteran').min + 5 }, 2)];
    expect(fold(climbing, day(5)).pending?.eligibleDates).toEqual([day(3), day(4)]);
  });

  it('opens a profile with no legacy prefix at Rookie and counts its first day once it is past', () => {
    const high = rankById('veteran').min + 5;
    const result = confirmedRankHistory(
      days([{ rating: ABOVE }, { rating: high }, { rating: high }]),
      { from: D0, today: day(3) },
    );
    // No earned standing to keep: Rookie, 3/7 towards Challenger, no promotion.
    expect(result.legacyPoints).toBe(0);
    expect(result.current.id).toBe('rookie');
    expect(result.changes).toEqual([]);
    expect(result.pending).toEqual({ targetRankId: 'challenger', eligibleDates: [day(0), day(1), day(2)], required: 7 });
    // On day one itself: 0/7, shown, because the rating is already past 120.
    const dayOne = confirmedRankHistory(days([{ rating: ABOVE }]), { from: D0, today: D0 });
    expect(dayOne.current.id).toBe('rookie');
    expect(confirmationIndicator(ABOVE, dayOne.pending)).toEqual({ targetRankId: 'challenger', count: 0, required: 7 });
  });

  it('with the boundary in the future everything is legacy and the pending state is empty', () => {
    const result = confirmedRankHistory(days(LEGACY), { from: day(10), today: day(2) });
    expect(result.legacyPoints).toBe(3);
    expect(result.pending).toEqual({ targetRankId: 'elite', eligibleDates: [], required: 7 });
  });
});

describe('rank transitions', () => {
  it('22 — the promotion fires exactly on the seventh qualifying day', () => {
    const six = fold([...LEGACY, ...repeat({ rating: ABOVE }, 6)], day(9));
    expect(six.changes).toEqual([]);
    expect(six.pending?.eligibleDates).toHaveLength(6);
    const seven = fold([...LEGACY, ...repeat({ rating: ABOVE }, 7)], day(10));
    expect(seven.changes.map((c) => c.date)).toEqual([day(9)]);
  });

  it('23 — the next target starts empty', () => {
    const result = fold([...LEGACY, ...repeat({ rating: ABOVE }, 7)], day(10));
    expect(result.pending).toEqual({ targetRankId: 'veteran', eligibleDates: [], required: 7 });
  });

  it('24 — a rating two thresholds up still advances one rank per confirmation', () => {
    const high = rankById('veteran').min + 20; // above Elite and Veteran
    const one = fold([...LEGACY, ...repeat({ rating: high }, 7)], day(10));
    expect(one.current.id).toBe('elite');
    expect(one.pending).toEqual({ targetRankId: 'veteran', eligibleDates: [], required: 7 });
    const two = fold([...LEGACY, ...repeat({ rating: high }, 14)], day(17));
    expect(two.current.id).toBe('veteran');
    expect(two.changes.map((c) => [c.to, c.date])).toEqual([['elite', day(9)], ['veteran', day(16)]]);
    expect(two.peak.id).toBe('veteran');
  });

  it('25 — the top rank has no pending confirmation', () => {
    const top = rankById('legend').min + 10;
    const result = confirmedRankHistory(days(repeat({ rating: top }, 5)), { from: day(2), today: day(5) });
    expect(result.current.id).toBe('legend');
    expect(result.pending).toBeNull();
    expect(confirmationIndicator(top, result.pending)).toBeNull();
  });

  it('never creates a duplicate promotion for one target and date', () => {
    const result = fold([...LEGACY, ...repeat({ rating: ABOVE }, 20)], day(23));
    const ids = result.changes.map((c) => `${c.to}@${c.date}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.changes.filter((c) => c.to === 'elite')).toHaveLength(1);
  });
});

describe('demotion, strictly isolated', () => {
  it('26 — every series without a promotion opportunity walks identically to the legacy rule', () => {
    // A fixed generator: starts as Master and never rises above it, so the
    // legacy rule can never promote, and the two walks must agree exactly.
    let seed = 20260302;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let run = 0; run < 40; run += 1) {
      const specs: Spec[] = [{ rating: 700 }];
      let rating = 700;
      for (let i = 0; i < 120; i += 1) {
        rating = Math.min(699, Math.max(560, rating + (rand() - 0.55) * 40));
        specs.push({ rating, scored: rand() > 0.2, paused: rand() < 0.1 });
      }
      const list = days(specs);
      const legacy = rankHistory(list.map((d) => ({ date: d.date, rating: d.rating })));
      // Any boundary after the first point: the prefix opens where the
      // rating is, exactly as the legacy walk does, and the tail's demotions
      // land on the same days.
      for (const from of [day(1), day(30), day(121)]) {
        const confirmed = confirmedRankHistory(list, { from, today: day(121) });
        expect(confirmed.changes).toEqual(legacy.changes);
        expect(confirmed.current.id).toBe(legacy.current.id);
        expect(confirmed.peak.id).toBe(legacy.peak.id);
      }
      // With no prefix at all the profile is a fresh install: it opens at
      // Rookie rather than at Master, which is the one intended difference.
      const fresh = confirmedRankHistory(list, { from: day(0), today: day(121) });
      expect(fresh.legacyPoints).toBe(0);
      expect(fresh.changes[0]?.from ?? 'rookie').toBe('rookie');
    }
  });

  it('27 — a pending confirmation neither delays nor accelerates a demotion', () => {
    const dip = rankById('contender').min - RANK_DEMOTION_HYSTERESIS - 1; // 244
    // Three qualifying days, then a sustained dip.
    const withPending = [...LEGACY, ...repeat({ rating: ABOVE }, 3), ...repeat({ rating: dip }, 4)];
    // The same tail after three ordinary days, where the legacy rule has
    // nothing to promote either.
    const plain = [...LEGACY, ...repeat({ rating: 300 }, 3), ...repeat({ rating: dip }, 4)];
    const confirmed = fold(withPending, day(11));
    const legacy = rankHistory(days(plain).map((d) => ({ date: d.date, rating: d.rating })));
    expect(confirmed.changes.filter((c) => c.kind === 'demotion')).toEqual(legacy.changes);
    expect(confirmed.changes.filter((c) => c.kind === 'demotion')[0]!.date).toBe(day(8));
  });

  it('28 — a demotion re-targets the confirmation with an empty set', () => {
    const dip = rankById('contender').min - RANK_DEMOTION_HYSTERESIS - 1;
    const specs = [...LEGACY, ...repeat({ rating: ABOVE }, 3), ...repeat({ rating: dip }, 3)];
    const result = fold(specs, day(10));
    expect(result.current.id).toBe('challenger');
    expect(result.pending).toEqual({ targetRankId: 'contender', eligibleDates: [], required: 7 });
  });

  it('runs the demotion step on today and on unscored points, exactly as before', () => {
    const dip = rankById('contender').min - RANK_DEMOTION_HYSTERESIS - 1;
    // Two unscored dips and today's dip: three points below the buffer.
    const specs = [...LEGACY, { rating: dip, scored: false }, { rating: dip, scored: false }, { rating: dip }];
    const confirmed = fold(specs, day(5));
    const legacy = rankHistory(days(specs).map((d) => ({ date: d.date, rating: d.rating })));
    expect(confirmed.changes).toEqual(legacy.changes);
    expect(confirmed.current.id).toBe('challenger');
  });
});

describe('the indicator', () => {
  const pending = (dates: DateKey[]) => ({ targetRankId: 'elite' as const, eligibleDates: dates, required: RANK_PROMOTION_CONFIRMATION_DAYS });

  it('29 — below the threshold with nothing collected: none', () => {
    expect(confirmationIndicator(BELOW, pending([]))).toBeNull();
  });

  it('30 — threshold reached today: 0/7', () => {
    expect(confirmationIndicator(ELITE, pending([]))).toEqual({ targetRankId: 'elite', count: 0, required: 7 });
  });

  it('31 — pending: N/7, even if the rating dipped today', () => {
    expect(confirmationIndicator(BELOW, pending([day(3), day(4)]))).toEqual({ targetRankId: 'elite', count: 2, required: 7 });
  });

  it('32 — after a promotion the indicator follows the next target, or disappears at the top', () => {
    const promoted = fold([...LEGACY, ...repeat({ rating: ABOVE }, 7)], day(10));
    expect(confirmationIndicator(ABOVE, promoted.pending)).toBeNull(); // below Veteran, nothing collected
    const top = rankById('legend').min + 1;
    const legend = confirmedRankHistory(days(repeat({ rating: top }, 9)), { from: day(1), today: day(9) });
    expect(legend.pending).toBeNull();
  });

  it('reports the threshold as reached only at or above it, and never without a target', () => {
    expect(thresholdReached(ELITE, pending([]))).toBe(true);
    expect(thresholdReached(ELITE + 100, pending([day(3)]))).toBe(true);
    expect(thresholdReached(BELOW, pending([day(3), day(4)]))).toBe(false);
    expect(thresholdReached(ELITE, null)).toBe(false);
  });

  it('covers every threshold on the ladder', () => {
    for (const [index, rank] of RANKS.entries()) {
      const next = RANKS[index + 1];
      if (!next) continue;
      const result = confirmedRankHistory(
        days([{ rating: rank.min }, { rating: rank.min }, ...repeat({ rating: next.min }, 7)]),
        { from: day(2), today: day(9) },
      );
      expect(result.current.id).toBe(next.id);
      expect(result.changes.map((c) => c.date)).toEqual([day(8)]);
    }
  });
});
