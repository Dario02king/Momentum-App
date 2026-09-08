import { describe, expect, it } from 'vitest';
import { RUNNING_BANDS } from '../config/constants';
import {
  bandOf,
  bandRange,
  distancesComparable,
  identityComparison,
  isScorableRun,
  paceChangePercent,
  runIdentities,
  runningPerformance,
  runningPerformanceInWindow,
  type RunObservation,
} from './performance';

/** A run at a given pace in minutes per kilometre. */
const run = (id: string, date: string, metres: number, minPerKm: number): RunObservation => ({
  id,
  date,
  distanceMetres: metres,
  durationSeconds: Math.round((metres / 1000) * minPerKm * 60),
});
const bands = (runs: RunObservation[]) => runIdentities(runs).map((entry) => entry.band);
const votes = (runs: RunObservation[]) => runningPerformance(runs).measured.length;

/* ── Comparability ──────────────────────────────────────────────────────── */

describe('the ±10 % comparability rule', () => {
  it('takes the approved examples exactly', () => {
    expect(distancesComparable(5000, 5200)).toBe(true);
    expect(distancesComparable(5000, 5500)).toBe(true); // exactly at the boundary
    expect(distancesComparable(5000, 6000)).toBe(false);
    expect(distancesComparable(10000, 20000)).toBe(false);
  });

  it('is inclusive at the boundary and excludes one metre past it', () => {
    expect(distancesComparable(5000, 5500)).toBe(true);
    expect(distancesComparable(5000, 5501)).toBe(false);
  });

  it('never depends on which distance is called the baseline', () => {
    for (let a = 3000; a <= 42000; a += 137) {
      for (let b = 3000; b <= 42000; b += 311) {
        expect(distancesComparable(a, b)).toBe(distancesComparable(b, a));
      }
    }
    // The pair a naive |a−b|/a rule answers differently each way round.
    expect(distancesComparable(9000, 10000)).toBe(false);
    expect(distancesComparable(10000, 9000)).toBe(false);
  });
});

/* ── Stable identity ────────────────────────────────────────────────────── */

describe('distance identity is stable', () => {
  it('depends only on the run\'s own distance', () => {
    // The same distance always yields the same band, whatever it is asked with.
    expect(bandOf(5000)).toBe(bandOf(5000));
    expect(bandOf(5000)).not.toBe(bandOf(20000));
  });

  it('has no identity below the 3 km performance minimum', () => {
    expect(bandOf(2999)).toBeNull();
    expect(bandOf(RUNNING_BANDS.MIN_PERFORMANCE_METRES)).not.toBeNull();
  });

  it('puts every member of a band within 10 % of every other', () => {
    // The invariant that makes a band a legitimate identity.
    for (let metres = 3000; metres <= 45000; metres += 7) {
      const band = bandOf(metres)!;
      const { from, toExclusive } = bandRange(band);
      expect(metres).toBeGreaterThanOrEqual(from - 1e-9);
      expect(metres).toBeLessThan(toExclusive);
      expect(distancesComparable(Math.ceil(from), Math.floor(toExclusive - 1e-9))).toBe(true);
    }
  });

  it('is half-open: the upper edge belongs to the next band', () => {
    const band = bandOf(5000)!;
    const { from, toExclusive } = bandRange(band);
    expect(bandOf(Math.ceil(from))).toBe(band);
    expect(bandOf(Math.ceil(toExclusive))).toBe(band + 1);
    expect(bandOf(Math.floor(toExclusive) - 1)).toBe(band);
  });

  it('does not change when unrelated runs are ADDED', () => {
    /*
     * The 4900/5000/5500 regression. Under the rejected dynamic partition,
     * adding a 4900 m run moved the group anchor and evicted the 5500 m run,
     * which then lost its baseline. A fixed grid cannot do that.
     */
    const before = [run('a', '2026-01-05', 5000, 5.5), run('b', '2026-01-19', 5500, 5.4)];
    const identitiesBefore = new Map(before.map((r) => [r.id, bandOf(r.distanceMetres!)]));

    const after = [...before, run('c', '2026-01-26', 4900, 5.3)];
    for (const r of after.filter((entry) => entry.id !== 'c')) {
      expect(bandOf(r.distanceMetres!)).toBe(identitiesBefore.get(r.id));
    }
  });

  it('does not change when unrelated runs EXPIRE from a window', () => {
    const all = [
      run('old', '2026-01-01', 4600, 5.6),
      run('a', '2026-03-01', 5000, 5.5),
      run('b', '2026-03-20', 5050, 5.3),
    ];
    const withOld = runningPerformance(all);
    const withoutOld = runningPerformance(all.slice(1));
    // The 5 km identity's comparison is untouched by the older run leaving.
    const pick = (p: typeof withOld) => p.comparisons.find((c) => c.status === 'measured');
    expect(pick(withoutOld)?.ratio).toBe(pick(withOld)?.ratio);
  });

  it('does not depend on the order runs are supplied in', () => {
    const base = [
      run('a', '2026-01-05', 5000, 5.5),
      run('b', '2026-01-12', 5400, 5.4),
      run('c', '2026-01-19', 10000, 6.0),
      run('d', '2026-01-26', 10500, 5.9),
      run('e', '2026-02-02', 20000, 6.4),
    ];
    const want = JSON.stringify(bands(base));
    const wantRatio = runningPerformance(base).ratio;
    for (let trial = 0; trial < 500; trial += 1) {
      const shuffled = base.slice();
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      expect(JSON.stringify(bands(shuffled))).toBe(want);
      expect(runningPerformance(shuffled).ratio).toBe(wantRatio);
    }
  });
});

/* ── The accepted split ─────────────────────────────────────────────────── */

describe('the accepted boundary split', () => {
  it('splits a route that straddles a boundary, deterministically', () => {
    const band = bandOf(5000)!;
    const { toExclusive } = bandRange(band);
    const below = Math.floor(toExclusive) - 1;
    const above = Math.ceil(toExclusive);
    expect(distancesComparable(below, above)).toBe(true); // obviously the same route
    expect(bandOf(below)).not.toBe(bandOf(above)); // and yet two identities
  });

  it('lets both halves vote when both have enough history', () => {
    const band = bandOf(5000)!;
    const { toExclusive } = bandRange(band);
    const lo = Math.floor(toExclusive) - 5;
    const hi = Math.ceil(toExclusive) + 5;
    const runs = [
      run('l1', '2026-01-05', lo, 5.5), run('l2', '2026-02-05', lo, 5.3),
      run('h1', '2026-01-12', hi, 5.5), run('h2', '2026-02-12', hi, 5.3),
    ];
    // Split-inflation, accepted: one route, two equal-weighted identities.
    expect(votes(runs)).toBe(2);
  });

  it('never tries to re-merge them, because that would read other runs', () => {
    // Adding more runs to one side cannot pull the other side back in.
    const band = bandOf(5000)!;
    const { toExclusive } = bandRange(band);
    const lo = Math.floor(toExclusive) - 5;
    const hi = Math.ceil(toExclusive) + 5;
    const two = [run('l1', '2026-01-05', lo, 5.5), run('h1', '2026-01-12', hi, 5.5)];
    expect(bandOf(lo)).not.toBe(bandOf(hi));
    const more = [...two, run('l2', '2026-02-05', lo, 5.3), run('l3', '2026-03-05', lo, 5.2)];
    expect(bandOf(hi)).toBe(bandOf(hi));
    expect(runIdentities(more).length).toBe(2);
  });

  it('keeps two genuinely different histories apart, whatever their spans', () => {
    /*
     * The 5.4/6.4 regression. A container wider than the comparability ratio
     * would hold both and then discard one, with the survivor flipping
     * depending on calendar span. There is no such container here.
     */
    expect(distancesComparable(5400, 6400)).toBe(false);
    expect(bandOf(5400)).not.toBe(bandOf(6400));

    const both = (spanA: [string, string], spanB: [string, string]) =>
      votes([
        run('a1', spanA[0], 5400, 5.6), run('a2', spanA[1], 5400, 5.2),
        run('b1', spanB[0], 6400, 5.9), run('b2', spanB[1], 6400, 5.4),
      ]);
    expect(both(['2026-01-05', '2026-09-05'], ['2026-01-12', '2026-09-12'])).toBe(2);
    expect(both(['2026-01-05', '2026-09-20'], ['2026-03-12', '2026-08-12'])).toBe(2);
    expect(both(['2026-03-05', '2026-08-05'], ['2026-01-12', '2026-09-12'])).toBe(2);
  });
});

/* ── What qualifies ─────────────────────────────────────────────────────── */

describe('what counts as a performance observation', () => {
  it('needs a measured distance of at least 3 km and a positive duration', () => {
    expect(isScorableRun(run('a', '2026-01-05', 3000, 5.5))).toBe(true);
    expect(isScorableRun(run('a', '2026-01-05', 2999, 5.5))).toBe(false);
    expect(isScorableRun({ id: 'a', date: '2026-01-05', distanceMetres: null, durationSeconds: 1800 })).toBe(false);
    expect(isScorableRun({ id: 'a', date: '2026-01-05', distanceMetres: 5000, durationSeconds: null })).toBe(false);
    expect(isScorableRun({ id: 'a', date: '2026-01-05', distanceMetres: 5000, durationSeconds: 0 })).toBe(false);
  });

  it('leaves an unusable run out of performance entirely, never as a zero', () => {
    const runs = [
      run('short', '2026-01-05', 2900, 5.0),
      { id: 'nodist', date: '2026-01-06', distanceMetres: null, durationSeconds: 1800 },
      { id: 'notime', date: '2026-01-07', distanceMetres: 5000, durationSeconds: null },
      run('ok1', '2026-01-08', 5000, 5.5),
      run('ok2', '2026-01-15', 5000, 5.4),
    ];
    const performance = runningPerformance(runs);
    expect(performance.measured).toHaveLength(1);
    expect(performance.ratio).toBeGreaterThan(1);
  });

  it('gives a legacy record with no distance no performance, for ever', () => {
    const legacy = [
      { id: 'rc2a', date: '2026-01-05', distanceMetres: null, durationSeconds: 1800 },
      { id: 'rc2b', date: '2026-01-12', distanceMetres: null, durationSeconds: 1700 },
    ];
    expect(runningPerformance(legacy).ratio).toBeNull();
  });
});

/* ── Evidence ───────────────────────────────────────────────────────────── */

describe('evidence inside one identity', () => {
  it('gives repeated 5 km runs exactly one vote', () => {
    const runs = [
      run('a', '2026-01-05', 5000, 5.5), run('b', '2026-01-12', 5050, 5.4),
      run('c', '2026-01-19', 4960, 5.3), run('d', '2026-01-26', 5100, 5.2),
      run('e', '2026-02-02', 5020, 5.1), run('f', '2026-02-09', 5000, 5.0),
    ];
    expect(votes(runs)).toBe(1);
    // 5:30 -> 5:00 is a tenth faster.
    expect(paceChangePercent(runningPerformance(runs).ratio)).toBeCloseTo(10, 6);
  });

  it('keeps 5 km and 10 km as two independent identities', () => {
    expect(votes([
      run('a', '2026-01-05', 5000, 5.5), run('b', '2026-02-09', 5100, 5.2),
      run('c', '2026-01-08', 10000, 6.0), run('d', '2026-02-12', 10200, 5.9),
    ])).toBe(2);
  });

  it('keeps 5 km and 20 km as two independent identities', () => {
    expect(votes([
      run('a', '2026-01-05', 5000, 5.5), run('b', '2026-02-09', 5000, 5.2),
      run('c', '2026-01-08', 20000, 6.4), run('d', '2026-02-12', 20000, 6.2),
    ])).toBe(2);
  });

  it('takes the fastest run of a date, not the last logged', () => {
    const comparison = identityComparison(runIdentities([
      run('slow', '2026-01-05', 5000, 6.0),
      run('fast', '2026-01-05', 5000, 5.0),
      run('later', '2026-01-19', 5000, 4.8),
    ])[0]!);
    expect(comparison.baseline?.id).toBe('fast');
    expect(comparison.current?.id).toBe('later');
  });

  it('has no baseline with only one date', () => {
    const performance = runningPerformance([
      run('a', '2026-01-05', 5000, 5.5),
      run('b', '2026-01-05', 5000, 5.4),
    ]);
    expect(performance.ratio).toBeNull();
    expect(performance.awaitingBaseline).toHaveLength(1);
  });

  it('scores faster as positive and slower as negative', () => {
    const faster = runningPerformance([run('a', '2026-01-05', 5000, 5.5), run('b', '2026-02-05', 5000, 5.0)]);
    const slower = runningPerformance([run('a', '2026-01-05', 5000, 5.0), run('b', '2026-02-05', 5000, 5.5)]);
    expect(paceChangePercent(faster.ratio)!).toBeGreaterThan(0);
    expect(paceChangePercent(slower.ratio)!).toBeLessThan(0);
  });

  it('is exactly neutral when the pace holds over a longer comparable run', () => {
    const runs = [run('a', '2026-01-05', 5000, 5.5), run('b', '2026-02-05', 5400, 5.5)];
    expect(distancesComparable(5000, 5400)).toBe(true);
    expect(paceChangePercent(runningPerformance(runs).ratio)).toBeCloseTo(0, 9);
  });

  it('never reads a longer duration alone as an improvement', () => {
    // Same pace, longer run: neutral. Slower pace: negative, whatever the duration.
    const slowerButLonger = [run('a', '2026-01-05', 5000, 5.0), run('b', '2026-02-05', 5400, 5.6)];
    expect(paceChangePercent(runningPerformance(slowerButLonger).ratio)!).toBeLessThan(0);
  });

  it('gives frequency no weight', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      run(`m${i}`, `2026-01-${String(i + 1).padStart(2, '0')}`, 5000, 5.5 - i * 0.02));
    const few = [run('t1', '2026-01-03', 10000, 6.0), run('t2', '2026-01-20', 10000, 6.0)];
    const performance = runningPerformance([...many, ...few]);
    expect(performance.measured).toHaveLength(2);
    // Twenty runs and two runs each contribute exactly one ratio to the mean.
    const [a, b] = performance.comparisons.filter((c) => c.ratio !== null);
    expect(performance.ratio).toBeCloseTo((a!.ratio! + b!.ratio!) / 2, 12);
  });
});

/* ── Windows ────────────────────────────────────────────────────────────── */

describe('windows are anchored inside themselves', () => {
  it('excludes everything outside the range at both ends', () => {
    const runs = [
      run('before', '2025-12-31', 5000, 6.0),
      run('a', '2026-01-05', 5000, 5.5),
      run('b', '2026-02-05', 5000, 5.0),
      run('after', '2026-03-05', 5000, 4.0),
    ];
    const window = runningPerformanceInWindow(runs, '2026-01-01', '2026-02-28');
    expect(window.comparisons[0]?.baseline?.id).toBe('a');
    expect(window.comparisons[0]?.current?.id).toBe('b');
  });

  it('lets a year-to-date window restart at January the first', () => {
    const runs = [run('lastYear', '2025-11-01', 5000, 6.5), run('a', '2026-01-05', 5000, 5.5), run('b', '2026-06-05', 5000, 5.0)];
    const ytd = runningPerformanceInWindow(runs, '2026-01-01', '2026-06-30');
    expect(ytd.comparisons[0]?.baseline?.id).toBe('a');
    expect(paceChangePercent(ytd.ratio)).toBeCloseTo(10, 6);
  });

  it('says nothing at all about an empty window', () => {
    const runs = [run('a', '2026-01-05', 5000, 5.5)];
    expect(runningPerformanceInWindow(runs, '2026-05-01', '2026-05-31').ratio).toBeNull();
  });
});

/* ── Aggregation order ──────────────────────────────────────────────────── */

describe('aggregation averages ratios, and maps later', () => {
  it('returns the mean of the identity ratios, not of anything mapped', () => {
    const runs = [
      run('a1', '2026-01-05', 5000, 5.0), run('a2', '2026-02-05', 5000, 4.5),   // +11.1 %
      run('b1', '2026-01-08', 10000, 6.0), run('b2', '2026-02-08', 10000, 6.0), // 0 %
    ];
    const performance = runningPerformance(runs);
    const ratios = performance.comparisons.filter((c) => c.ratio !== null).map((c) => c.ratio!);
    expect(ratios).toHaveLength(2);
    expect(performance.ratio).toBeCloseTo((ratios[0]! + ratios[1]!) / 2, 12);
  });

  it('produces a plain ratio, leaving the curve to the shared model', () => {
    const performance = runningPerformance([
      run('a', '2026-01-05', 5000, 5.5), run('b', '2026-02-05', 5000, 5.0),
    ]);
    // A ratio, not a 0-1000 score: nothing here has been through the curve.
    expect(performance.ratio).toBeGreaterThan(1);
    expect(performance.ratio).toBeLessThan(2);
  });
});
