import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RANKS, RANK_DEMOTION_HYSTERESIS, TRAINING_RATING } from '../config/constants';
import { addDays, type DateKey } from '../dates';
import { canonical, canonicalJson } from '../../testing/canonical';
import type { PerformanceScore } from './performanceCurve';
import {
  computeTrainingRating,
  type TrainingRatingDay,
  type TrainingRatingOptions,
  type TrainingRatingPoint,
} from './trainingRating';

/**
 * The decay differential (Stage 2, § C.3).
 *
 * `computeTrainingRating` measures abstinence decay inside a rating interval
 * that it holds with hysteresis. Stage 2 replaces the *rank* that interval
 * used to be named after with an internal interval that has no name, no
 * badge and no promotion — and the only acceptable outcome is that every
 * rating on every day comes out identical. This file is the proof: hand-built
 * day sequences that stand exactly on every threshold, inside and outside
 * every hysteresis buffer, through every decay phase, across a broken and
 * restarted episode, under a locked and an unlocked Endurance gate, through
 * a pause, and over a long mixed replay — folded and serialised in full.
 *
 * The fixture was written from the unmodified implementation and is never
 * regenerated to make a test pass. Equality is exact: no rounding, no epsilon.
 *
 * To (re)capture: `UPDATE_STAGE2_BASELINE=1 npx vitest run decayEquivalence`.
 */

const FIXTURE = new URL('../../../.github/fixtures/stage2/decay-equivalence.json', import.meta.url);
const ORIGIN: DateKey = '2026-01-05'; // a Monday

const perf = (score: number | null): PerformanceScore => ({
  score,
  trendScore: score,
  ytdScore: score,
  components: score === null ? [] : ['trend', 'ytd'],
});

/** The performance score that makes the 40/60 target equal `rating` at full attendance. */
const holding = (rating: number): number => (rating - 400) / 0.6;
/** The target that moves a rating from `from` to `to` in one downward step. */
const pullTo = (from: number, to: number): number => from + (to - from) / TRAINING_RATING.BASE_MOVEMENT;

interface Spec {
  name: string;
  options?: TrainingRatingOptions;
  days: TrainingRatingDay[];
}

class Builder {
  readonly days: TrainingRatingDay[] = [];
  private index = 0;

  constructor(private readonly age: number) {}

  private push(over: Partial<TrainingRatingDay>): this {
    this.days.push({
      date: addDays(ORIGIN, this.index),
      scored: true,
      sessionsInWeek: 3,
      weeklyTarget: 3,
      sessionToday: false,
      performance: perf(null),
      performanceChange: null,
      abstinentDays: 0,
      ageMonths: this.age,
      enduranceUnlocked: true,
      ...over,
    });
    this.index += 1;
    return this;
  }

  /** Trained today, full attendance, and a target that holds the rating where it is. */
  hold(rating: number, count = 1): this {
    for (let i = 0; i < count; i += 1) {
      this.push({ sessionToday: true, performance: perf(holding(rating)) });
    }
    return this;
  }

  /** Trained today, with a target that lands the rating exactly on `to` in one step. */
  pull(from: number, to: number): this {
    return this.push({ sessionToday: true, performance: perf(holding(pullTo(from, to))) });
  }

  /** `count` consecutive days with no session, the run continuing from `from`. */
  absent(count: number, from = 1, over: Partial<TrainingRatingDay> = {}): this {
    for (let i = 0; i < count; i += 1) {
      this.push({ sessionsInWeek: 0, abstinentDays: from + i, ...over });
    }
    return this;
  }

  /**
   * `count` days with no session whose target still holds the rating — the
   * week's earlier sessions keep attendance full — so the episode that begins
   * on the seventh day starts from exactly `rating`, not from six days of
   * attendance-driven falls. This is what isolates *which interval* the
   * decay is measured in from everything else the fold does.
   */
  absentHolding(count: number, rating: number, from = 1): this {
    for (let i = 0; i < count; i += 1) {
      this.push({ abstinentDays: from + i, performance: perf(holding(rating)) });
    }
    return this;
  }

  /** A saved session that ends an episode; the week has only this one. */
  session(over: Partial<TrainingRatingDay> = {}): this {
    return this.push({ sessionToday: true, sessionsInWeek: 1, abstinentDays: 0, ...over });
  }

  /** Days inside a declared pause: the clock is frozen and the day is not scored. */
  paused(count: number, frozenAt: number): this {
    for (let i = 0; i < count; i += 1) {
      this.push({ scored: false, paused: true, sessionsInWeek: 0, abstinentDays: frozenAt });
    }
    return this;
  }

  /** Days that do not count at all — before the domain, or still open. */
  unscored(count: number): this {
    for (let i = 0; i < count; i += 1) this.push({ scored: false, sessionsInWeek: 0 });
    return this;
  }
}

function specs(): Spec[] {
  const out: Spec[] = [];
  const thresholds = RANKS.map((rank) => ({ id: rank.id, min: rank.min }));

  for (const { id, min } of thresholds) {
    // Every threshold, an episode starting a hair above and a hair below it.
    for (const [side, offset] of [['above', 0.5], ['below', -0.5]] as const) {
      const start = Math.max(0.5, min + offset);
      out.push({
        name: `threshold ${id} — episode begins ${side} ${min}, attendance falling first`,
        options: { start },
        days: new Builder(3).hold(start, 3).absent(30).days,
      });
      out.push({
        name: `threshold ${id} — episode begins ${side} ${min}, target held`,
        options: { start },
        days: new Builder(3).hold(start, 3).absentHolding(30, start).days,
      });
    }
    if (min === 0) continue;
    // The demotion hysteresis buffer: held one point inside it, dropped one
    // point outside it, then an episode.
    for (const [side, drop] of [
      ['inside the buffer', RANK_DEMOTION_HYSTERESIS - 0.5],
      ['outside the buffer', RANK_DEMOTION_HYSTERESIS + 0.5],
    ] as const) {
      const start = min + 0.5;
      out.push({
        name: `hysteresis ${id} — rating ${side} when the episode begins, attendance falling first`,
        options: { start },
        days: new Builder(3).hold(start).pull(start, min - drop).hold(min - drop).absent(35).days,
      });
      out.push({
        name: `hysteresis ${id} — rating ${side} when the episode begins, target held`,
        options: { start },
        days: new Builder(3).hold(start).pull(start, min - drop).absentHolding(35, min - drop).days,
      });
    }
    // The case a naive lookup gets wrong: the interval is held from above the
    // threshold while the rating itself sits below it.
    {
      const start = min + 0.5;
      out.push({
        name: `held interval ${id} — episode begins with the rating five points below ${min}, attendance falling first`,
        options: { start },
        days: new Builder(3).hold(start).pull(start, min - 5).absent(35).days,
      });
      out.push({
        name: `held interval ${id} — episode begins with the rating five points below ${min}, target held`,
        options: { start },
        days: new Builder(3).hold(start).pull(start, min - 5).absentHolding(35, min - 5).days,
      });
    }
    // Promotion is immediate: cross the threshold on the day before the run.
    {
      const start = min - 0.5;
      out.push({
        name: `promotion ${id} — crossed on the last trained day`,
        options: { start },
        days: new Builder(3).hold(start).pull(start, min + 0.5).absentHolding(21, min + 0.5).days,
      });
    }
  }

  // Every decay phase, and an episode long enough to reach the cap in each.
  for (const age of [0, 1, 2, 3, 4, 5, 11, 12, 13, 24]) {
    out.push({
      name: `phase — training age ${age} months, eighty abstinent days from 705`,
      options: { start: 705 },
      days: new Builder(age).hold(705, 2).absent(80).days,
    });
  }

  out.push({
    name: 'an episode broken by one session and restarted from what the decay left',
    options: { start: 705 },
    days: new Builder(3).hold(705, 2).absent(20).session().absent(30).days,
  });

  out.push({
    name: 'two episodes with a trained week between them',
    options: { start: 845 },
    days: new Builder(5).hold(845, 2).absent(16).hold(700, 7).absent(24).days,
  });

  // Endurance: the gate is closed while the rating climbs through two
  // thresholds, then opens on the first day of an absence.
  {
    const b = new Builder(1);
    for (let i = 0; i < 40; i += 1) {
      b.days.push({
        date: addDays(ORIGIN, i), scored: true, sessionsInWeek: 3, weeklyTarget: 3, sessionToday: true,
        performance: perf(1000), performanceChange: 12, abstinentDays: 0, ageMonths: 1, enduranceUnlocked: false,
      });
    }
    const locked = b.days.map((day) => ({ ...day }));
    for (let i = 0; i < 40; i += 1) {
      b.days.push({
        date: addDays(ORIGIN, 40 + i), scored: true, sessionsInWeek: 0, weeklyTarget: 3, sessionToday: false,
        performance: perf(null), performanceChange: null, abstinentDays: i + 1, ageMonths: 2, enduranceUnlocked: true,
      });
    }
    out.push({ name: 'endurance — locked while climbing, unlocked as the absence begins', options: { start: 300 }, days: b.days });
    const shut = locked.concat(
      Array.from({ length: 40 }, (_, i) => ({
        date: addDays(ORIGIN, 40 + i), scored: true, sessionsInWeek: 0, weeklyTarget: 3, sessionToday: false,
        performance: perf(null), performanceChange: null, abstinentDays: i + 1, ageMonths: 2, enduranceUnlocked: false,
      })),
    );
    out.push({ name: 'endurance — still locked through the whole absence, so nothing decays', options: { start: 300 }, days: shut });
    // Unlocked in the middle of the run, with the count already past a block.
    const midway = locked.concat(
      Array.from({ length: 40 }, (_, i) => ({
        date: addDays(ORIGIN, 40 + i), scored: true, sessionsInWeek: 0, weeklyTarget: 3, sessionToday: false,
        performance: perf(null), performanceChange: null, abstinentDays: i + 1, ageMonths: 2, enduranceUnlocked: i >= 10,
      })),
    );
    out.push({ name: 'endurance — opens on the eleventh abstinent day', options: { start: 300 }, days: midway });
  }

  out.push({
    name: 'a pause inside an episode freezes the clock without resetting it',
    options: { start: 705 },
    days: new Builder(3).hold(705, 2).absent(10).paused(5, 10).absent(20, 11).days,
  });

  out.push({
    name: 'a pause before the seventh day, then the run resumes',
    options: { start: 590 },
    days: new Builder(4).hold(590, 2).absent(5).paused(14, 5).absent(20, 6).days,
  });

  {
    const b = new Builder(13);
    for (let i = 0; i < 5; i += 1) {
      b.days.push({
        date: addDays(ORIGIN, i), scored: true, sessionsInWeek: 3, weeklyTarget: 3, sessionToday: true,
        performance: { score: 500, trendScore: 500, ytdScore: 500, components: ['trend', 'ytd'] },
        performanceChange: 0, abstinentDays: 0, ageMonths: 13, enduranceUnlocked: true,
      });
    }
    b.absent(30);
    out.push({ name: 'maintenance holds the rating, then an absence decays it under the mature schedule', options: { start: 780 }, days: b.days });
  }

  out.push({
    name: 'the first counted day is already the seventh abstinent one',
    options: { start: 705 },
    days: new Builder(3).unscored(6).absent(20, 7).days,
  });

  out.push({
    name: 'unscored days interleaved with an episode',
    options: { start: 640 },
    days: new Builder(3).hold(640, 2).absent(4).unscored(3).absent(10, 5).days,
  });

  out.push({
    name: 'a carried start below a carried peak',
    options: { start: 450, peak: 800 },
    days: new Builder(6).hold(450, 3).absent(28).days,
  });

  out.push({
    name: 'no start given, so the fold begins at the default rating',
    days: new Builder(2).hold(500, 3).absent(21).days,
  });

  // A long, mixed replay driven by a fixed linear congruential generator:
  // sessions, rests, absences of every length, targets all over the scale,
  // thresholds crossed in both directions, the gate opening on day 30.
  {
    let seed = 20260105;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const days: TrainingRatingDay[] = [];
    let abstinent = 0;
    let absenceLeft = 0;
    for (let i = 0; i < 400; i += 1) {
      const age = Math.floor(i / 30);
      if (absenceLeft === 0 && rand() < 0.04) absenceLeft = 3 + Math.floor(rand() * 38);
      const trained = absenceLeft === 0 && rand() < 0.45;
      if (absenceLeft > 0) absenceLeft -= 1;
      abstinent = trained ? 0 : abstinent + 1;
      const paused = !trained && rand() < 0.03;
      const sessionsInWeek = trained ? 1 + Math.floor(rand() * 3) : Math.floor(rand() * 2);
      const score = rand() < 0.3 ? null : Math.round(rand() * 1000);
      days.push({
        date: addDays(ORIGIN, i),
        scored: !paused && rand() > 0.05,
        sessionsInWeek,
        weeklyTarget: 3,
        sessionToday: trained,
        performance: perf(score),
        performanceChange: score === null ? null : Math.round((rand() - 0.5) * 40),
        abstinentDays: abstinent,
        paused,
        ageMonths: age,
        enduranceUnlocked: i >= 30,
      });
    }
    out.push({ name: 'a long mixed replay of four hundred days', options: { start: 520 }, days });
  }

  return out;
}

const POINT_FIELDS = [
  'date', 'rating', 'target', 'attendance', 'performance', 'movement', 'decayFraction', 'decaying', 'maintenance', 'skipped',
] as const satisfies readonly (keyof TrainingRatingPoint)[];

function serialise(spec: Spec) {
  const result = computeTrainingRating(spec.days, spec.options ?? {});
  return {
    name: spec.name,
    current: result.current,
    peak: result.peak,
    fields: POINT_FIELDS,
    points: result.points.map((point) => POINT_FIELDS.map((field) => point[field])),
  };
}

describe('abstinence decay is identical before and after the domain rank left the fold', () => {
  const all = specs();

  it('covers every threshold the ladder has', () => {
    for (const rank of RANKS) {
      expect(all.some((spec) => spec.name.startsWith(`threshold ${rank.id}`))).toBe(true);
    }
  });

  it('replays the same whether folded whole or as a prefix', () => {
    const long = all.find((spec) => spec.name.startsWith('a long mixed replay'))!;
    const whole = computeTrainingRating(long.days, long.options);
    const prefix = computeTrainingRating(long.days.slice(0, 200), long.options);
    expect(canonicalJson(whole.points.slice(0, 200))).toBe(canonicalJson(prefix.points));
    expect(canonicalJson(computeTrainingRating(long.days, long.options))).toBe(canonicalJson(whole));
  });

  const actual = canonical(all.map(serialise)) as ReturnType<typeof serialise>[];

  if (process.env.UPDATE_STAGE2_BASELINE) {
    it('captures the baseline', () => {
      writeFileSync(fileURLToPath(FIXTURE), canonicalJson(actual));
    });
    return;
  }

  const path = fileURLToPath(FIXTURE);
  if (!existsSync(path)) throw new Error(`No decay baseline at ${path}; capture it from the unmodified engine first`);
  const expected = JSON.parse(readFileSync(path, 'utf8')) as ReturnType<typeof serialise>[];

  it('has a scenario for every entry in the baseline, and no more', () => {
    expect(actual.map((spec) => spec.name)).toEqual(expected.map((spec) => spec.name));
  });

  for (const [index, spec] of actual.entries()) {
    it(`${spec.name}: every day identical`, () => {
      const frozen = expected[index]!;
      expect(spec.points.length).toBe(frozen.points.length);
      for (const [day, point] of spec.points.entries()) {
        // Exact equality, field by field, so a failure names the day and the number.
        expect(point, `day ${day} (${String(point[0])})`).toEqual(frozen.points[day]);
      }
      expect(spec.current).toBe(frozen.current);
      expect(spec.peak).toBe(frozen.peak);
    });
  }

  it('matches the baseline text in full', () => {
    expect(canonicalJson(actual)).toBe(canonicalJson(expected));
  });
});
