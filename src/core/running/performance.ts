import { RUNNING_BANDS } from '../config/constants';
import type { DateKey } from '../dates';

/**
 * Running performance: pace improvement at a comparable measured distance.
 *
 * ```
 *   runs → fixed distance identities → one speed ratio per identity
 *        → equal-weighted mean of ratios → one percentage change per window
 * ```
 *
 * From that percentage onwards Running is scored by exactly the same code as
 * Gym (`core/scoring/*`). What lives here is only the part that differs: what
 * counts as one comparable observation, and what makes two runs comparable.
 *
 * ## The rule the whole module exists to serve
 *
 * **A runner is rewarded for getting faster over runs that are genuinely
 * alike.** A 5 km personal best is never weighed against a 20 km endurance
 * run, and running further at the same pace is neither rewarded nor punished
 * — it is neutral, exactly.
 *
 * ## Why identity is a fixed band and not a cluster
 *
 * Two runs are directly comparable when their distances differ by no more
 * than 10 %. That relation is symmetric but **not transitive** — 5.0 km and
 * 5.4 km are comparable, 5.4 and 5.8 are comparable, 5.0 and 5.8 are not — so
 * it cannot itself define groups. Something has to.
 *
 * Every *dynamic* answer was tried and rejected during design, because each
 * one lets an unrelated run rewrite history:
 *
 * - **Anchoring each group at its lowest member.** Add a 4 900 m run to an
 *   existing 5 000/5 500 pair and the anchor moves to 4 900, whose ceiling is
 *   5 390 — the 5 500 run is evicted and loses its baseline. A run the user
 *   logged in January stops counting because of one they logged in March.
 * - **Connected components of the comparability graph.** Chains 5.0 km to
 *   6.2 km through the runs in between and then compares two runs 24 % apart,
 *   which the rule forbids outright.
 * - **A band wider than the comparability ratio, picking the best pair
 *   inside it.** A 5.4 km history and a 6.4 km history share such a band
 *   while being 18.5 % apart, so one of two legitimate histories is silently
 *   discarded — and which one survives flips depending on their calendar
 *   spans.
 *
 * So identity is a **fixed, half-open multiplicative band**, and a run's band
 * is a pure function of its own distance and two model constants:
 *
 * ```
 *   band(d) = floor( ln(d / ANCHOR) / ln(WIDTH) )        WIDTH = 1.10
 * ```
 *
 * Two properties follow, and they are the point:
 *
 * 1. **Same band ⇒ comparable.** A band spans `[a, 1.10a)`, so any two runs
 *    in one differ by less than 10 %. The comparison a band produces is legal
 *    by construction rather than by a check.
 * 2. **An existing run's identity never moves.** Adding, editing, deleting or
 *    expiring any other run cannot change it, because no other run is an
 *    input. History is never reinterpreted.
 *
 * ## The accepted cost
 *
 * A pair that *is* comparable can still straddle a fixed boundary — 5 000 and
 * 5 500 m are exactly 10 % apart and land either side of one. And a repeated
 * route whose measured distance wanders across a boundary becomes two
 * identities, each carrying equal weight, so that route is counted twice.
 *
 * Both are accepted. Detecting that two adjacent bands "probably mean the
 * same route" would require looking at the surrounding runs, which is exactly
 * the dynamic reinterpretation the fixed grid exists to prevent. A small,
 * predictable weighting artefact is the better trade than a history that
 * rewrites itself.
 */

const LN_WIDTH = Math.log(RUNNING_BANDS.WIDTH);

/** One run, as this module needs it. Metres and seconds, both whole. */
export interface RunObservation {
  id: string;
  date: DateKey;
  /** Measured, never a declared target. `null` when the user did not enter one. */
  distanceMetres: number | null;
  durationSeconds: number | null;
}

type ScorableRun = RunObservation & { distanceMetres: number; durationSeconds: number };

/**
 * Whether two distances may be compared directly, in exact integer
 * arithmetic: `max / min ≤ 1.10`.
 *
 * Written as a cross-multiplication rather than a division because distances
 * are whole metres and this keeps the boundary exact — 5 000 against 5 500 is
 * `55 000 ≤ 55 000`, comparable, with no dependence on how a quotient rounds.
 * It is symmetric in its arguments, so the answer never depends on which run
 * is called the baseline.
 */
export function distancesComparable(a: number, b: number): boolean {
  return Math.max(a, b) * 10 <= Math.min(a, b) * 11;
}

/**
 * A run's distance identity, or `null` when it has none.
 *
 * Depends only on the run's own distance and the two grid constants. Nothing
 * about the user's other runs, the scoring window, or the order rows arrive
 * in can reach it.
 */
export function bandOf(distanceMetres: number): number | null {
  if (!Number.isFinite(distanceMetres) || distanceMetres < RUNNING_BANDS.MIN_PERFORMANCE_METRES) {
    return null;
  }
  return Math.floor(Math.log(distanceMetres / RUNNING_BANDS.ANCHOR_METRES) / LN_WIDTH);
}

/** The half-open metre range a band covers, for tests and for explanation. */
export function bandRange(band: number): { from: number; toExclusive: number } {
  const from = RUNNING_BANDS.ANCHOR_METRES * Math.pow(RUNNING_BANDS.WIDTH, band);
  return { from, toExclusive: from * RUNNING_BANDS.WIDTH };
}

/**
 * Whether a run can carry performance at all.
 *
 * Needs a measured distance of at least 3 km and a positive duration. A run
 * missing either is not a bad run — it is a run the user logged lightly, and
 * it still counts in full towards attendance. Nothing is ever fabricated to
 * make it scorable, which is also why every legacy RC2 run stays
 * attendance-only for ever: RC2 never recorded a distance.
 */
export function isScorableRun(run: RunObservation): run is ScorableRun {
  return (
    run.distanceMetres !== null &&
    run.durationSeconds !== null &&
    Number.isFinite(run.distanceMetres) &&
    Number.isFinite(run.durationSeconds) &&
    run.distanceMetres >= RUNNING_BANDS.MIN_PERFORMANCE_METRES &&
    run.durationSeconds > 0
  );
}

export interface RunIdentity {
  band: number;
  /** Every scorable run in this band, oldest first. */
  runs: ScorableRun[];
}

/**
 * Groups the scorable runs of a window by distance identity.
 *
 * The sort is by date then id purely so the output reads chronologically;
 * grouping itself consults nothing but each run's own distance, so the result
 * cannot depend on the order runs are handed in.
 */
export function runIdentities(runs: readonly RunObservation[]): RunIdentity[] {
  const byBand = new Map<number, RunIdentity>();
  for (const run of runs) {
    if (!isScorableRun(run)) continue;
    const band = bandOf(run.distanceMetres);
    if (band === null) continue;
    let entry = byBand.get(band);
    if (!entry) {
      entry = { band, runs: [] };
      byBand.set(band, entry);
    }
    entry.runs.push(run);
  }
  for (const entry of byBand.values()) {
    entry.runs.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }
  return [...byBand.values()].sort((a, b) => a.band - b.band);
}

export type IdentityStatus = 'noBaseline' | 'measured';

export interface IdentityComparison {
  band: number;
  status: IdentityStatus;
  baseline: ScorableRun | null;
  current: ScorableRun | null;
  /** `speed(current) / speed(baseline)`; above 1 means faster now. */
  ratio: number | null;
  /** Distinct dates in this identity — evidence, never weight. */
  dates: number;
}

/**
 * One identity's comparison: the earliest date against the latest.
 *
 * Two rules, both mirroring Gym exactly.
 *
 * **Best of the day.** Several runs on one date collapse to the fastest of
 * them, the way an exercise-day collapses to its best set. A gentle recovery
 * run does not become a user's record of that day.
 *
 * **Earliest against latest, with no search.** Because the band already
 * guarantees comparability there is nothing to select between — the baseline
 * is simply the first day and the current is the last, and any pair the band
 * contains would have been legal anyway. Needing a rule cleverer than that
 * would have been a sign the identity was too wide.
 *
 * The ratio is one division of two integer products, so two identical runs
 * always produce exactly 1 and a longer duration alone can never read as an
 * improvement — distance sits in the numerator with it.
 */
export function identityComparison(identity: RunIdentity): IdentityComparison {
  const bestByDate = new Map<string, ScorableRun>();
  for (const run of identity.runs) {
    const held = bestByDate.get(run.date);
    // Faster means more metres per second: d1/t1 > d2/t2, cross-multiplied.
    if (!held || run.distanceMetres * held.durationSeconds > held.distanceMetres * run.durationSeconds) {
      bestByDate.set(run.date, run);
    }
  }

  const dates = [...bestByDate.keys()].sort();
  if (dates.length < 2) {
    return {
      band: identity.band,
      status: 'noBaseline',
      baseline: dates.length === 1 ? bestByDate.get(dates[0]!)! : null,
      current: null,
      ratio: null,
      dates: dates.length,
    };
  }

  const baseline = bestByDate.get(dates[0]!)!;
  const current = bestByDate.get(dates[dates.length - 1]!)!;
  const ratio =
    (current.distanceMetres * baseline.durationSeconds) /
    (current.durationSeconds * baseline.distanceMetres);

  return { band: identity.band, status: 'measured', baseline, current, ratio, dates: dates.length };
}

export interface RunningPerformance {
  /** Equal-weighted mean of the measured identities' ratios, or `null`. */
  ratio: number | null;
  comparisons: IdentityComparison[];
  /** The identities that entered the mean. */
  measured: number[];
  /** Trained in the window, but with only one date so far. */
  awaitingBaseline: number[];
}

/**
 * The window aggregate: **the equal-weighted mean of identity ratios.**
 *
 * One identity, one vote. Twenty 5 km runs and two 10 km runs weigh the same,
 * because each identity contributes exactly one ratio however many runs built
 * it — frequency is evidence, never weight.
 *
 * Ratios are averaged *here*, and the curve is applied *once* to the result
 * further up (`core/scoring`). That order matters and is the same one Gym
 * uses: mapping each identity first and averaging the scores would be a
 * different model, and having two training domains disagree about the shape
 * of their own pipeline would be a bug waiting to be found by a user.
 *
 * An identity with one date has produced no change to average and leaves the
 * denominator. It is not a zero.
 */
export function runningPerformance(runs: readonly RunObservation[]): RunningPerformance {
  const comparisons = runIdentities(runs).map(identityComparison);
  const measured = comparisons.filter((entry) => entry.ratio !== null);

  return {
    ratio:
      measured.length === 0
        ? null
        : measured.reduce((sum, entry) => sum + (entry.ratio ?? 0), 0) / measured.length,
    comparisons,
    measured: measured.map((entry) => entry.band),
    awaitingBaseline: comparisons
      .filter((entry) => entry.status === 'noBaseline' && entry.dates > 0)
      .map((entry) => entry.band),
  };
}

/**
 * The same aggregate over an explicit date window.
 *
 * Trend and year-to-date are computed by calling this twice with different
 * bounds, so each is anchored entirely inside itself: a run that has rolled
 * out of the 60-day window is not the year-to-date baseline's problem, and
 * January the first genuinely restarts the yearly question.
 */
export function runningPerformanceInWindow(
  runs: readonly RunObservation[],
  from: DateKey,
  to: DateKey,
): RunningPerformance {
  return runningPerformance(runs.filter((run) => run.date >= from && run.date <= to));
}

/** A ratio as a percentage change: 1.05 → +5. `null` stays `null`. */
export function paceChangePercent(ratio: number | null): number | null {
  return ratio === null ? null : (ratio - 1) * 100;
}

/** Seconds per kilometre, for display only. Never used in scoring. */
export function paceSecondsPerKm(distanceMetres: number, durationSeconds: number): number | null {
  if (distanceMetres <= 0 || durationSeconds <= 0) return null;
  return durationSeconds / (distanceMetres / 1000);
}
