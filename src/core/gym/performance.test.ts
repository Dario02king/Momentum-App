import { describe, expect, it } from 'vitest';
import type { DateKey } from '../dates';
import { MUSCLE_GROUPS, type MuscleGroup } from '../model';
import {
  bestSet,
  compareExerciseDays,
  exerciseDays,
  gymPerformance,
  gymPerformanceInWindow,
  gymPerformanceOverSpan,
  isScorableSet,
  latestComparisons,
  musclePerformance,
  percentChange,
  setScore,
  type ExerciseDayInput,
  type SetInput,
} from './performance';

/** kg to the grams the store keeps, so the cases read in real weights. */
const kg = (value: number) => Math.round(value * 1000);

const set = (reps: number, weightKg: number, order = 0, id = `s${order}`): SetInput => ({
  id,
  reps,
  weightGrams: kg(weightKg),
  order,
});

const day = (
  date: DateKey,
  exerciseId: string,
  sets: SetInput[],
  muscles: MuscleGroup[] = ['chest'],
  primaryMuscles?: MuscleGroup[],
): ExerciseDayInput => ({
  date,
  exerciseId,
  muscles,
  ...(primaryMuscles === undefined ? {} : { primaryMuscles }),
  sets,
});

describe('the exercise-day metric', () => {
  it('is the best set, by the numbers the decision names', () => {
    // 10 × 10 = 100, 8 × 15 = 120, 6 × 20 = 120.
    const sets = [set(10, 10, 0), set(8, 15, 1), set(6, 20, 2)];
    const best = bestSet(sets);
    expect(best?.score).toBe(kg(15) * 8);
    expect(best!.score / 1000).toBe(120);
  });

  it('is not the total volume, the average, or the heaviest weight', () => {
    const sets = [set(10, 10, 0), set(8, 15, 1), set(6, 20, 2)];
    const score = bestSet(sets)!.score / 1000;
    expect(score).toBe(120);
    // 100 + 120 + 120 = 340.
    expect(score).not.toBe(340);
    // (100 + 120 + 120) / 3 = 113.333…
    expect(score).not.toBeCloseTo(113.3333, 3);
    // The heaviest weight on its own.
    expect(score).not.toBe(20);
    // The mean weight, and the mean reps, for good measure.
    expect(score).not.toBeCloseTo(15, 3);
    expect(score).not.toBeCloseTo(8, 3);
  });

  it('handles one set', () => {
    expect(bestSet([set(5, 40)])!.score).toBe(kg(40) * 5);
  });

  it('finds the best set whether it is first or last', () => {
    expect(bestSet([set(10, 30, 0), set(5, 20, 1)])!.score).toBe(kg(30) * 10);
    expect(bestSet([set(5, 20, 0), set(10, 30, 1)])!.score).toBe(kg(30) * 10);
  });

  it('reports the same number whichever tied set is picked', () => {
    // 10 × 12 and 12 × 10 are both 120.
    const a = bestSet([set(10, 12, 0), set(12, 10, 1)]);
    const b = bestSet([set(12, 10, 0), set(10, 12, 1)]);
    expect(a!.score).toBe(b!.score);
    // The representative is deterministic — earliest by order — but the
    // number never depends on it.
    expect(a!.set.order).toBe(0);
    expect(b!.set.order).toBe(0);
  });

  it('takes decimal weights without drifting', () => {
    // 2.5 kg micro-plates, in grams, are exact.
    expect(bestSet([set(8, 22.5)])!.score).toBe(22_500 * 8);
    expect(bestSet([set(3, 0.5)])!.score).toBe(500 * 3);
    // Repeating the same arithmetic a thousand times cannot drift, because
    // there is no floating point in it.
    const scores = new Set(Array.from({ length: 1000 }, () => setScore(set(7, 62.5))));
    expect(scores.size).toBe(1);
  });

  it('drops a set that describes no work rather than scoring it zero', () => {
    expect(isScorableSet(set(0, 40))).toBe(false);
    expect(isScorableSet(set(8, 0))).toBe(false);
    expect(isScorableSet({ id: 'x', reps: -1, weightGrams: 1000, order: 0 })).toBe(false);
    expect(isScorableSet({ id: 'x', reps: 8, weightGrams: Number.NaN, order: 0 })).toBe(false);
    expect(bestSet([set(0, 40, 0), set(8, 0, 1)])).toBeNull();
    // And an empty row next to a real one leaves the real one alone.
    expect(bestSet([set(0, 0, 0), set(8, 20, 1)])!.score).toBe(kg(20) * 8);
  });

  it('follows an edit, because nothing is stored', () => {
    // 8 × 20 is 160; 6 × 22.5 is 135, so the first set is the best one.
    const before = bestSet([set(8, 20, 0), set(6, 22.5, 1)])!.score;
    expect(before).toBe(kg(20) * 8);
    // The user corrects the second set: it was 30 kg, not 22.5. Now 6 × 30
    // is 180 and the day's number moves with it, because it was never stored.
    const after = bestSet([set(8, 20, 0), set(6, 30, 1)])!.score;
    expect(after).toBe(kg(30) * 6);
  });

  it('produces nothing at all for an exercise with no scorable set', () => {
    expect(exerciseDays([day('2026-01-01', 'ex_a', [set(0, 0)])])).toEqual([]);
  });
});

describe('comparing with the previous workout', () => {
  const compare = (inputs: ExerciseDayInput[]) => compareExerciseDays(exerciseDays(inputs));

  it('has no baseline the first time, rather than a made-up zero', () => {
    const [first] = compare([day('2026-01-01', 'ex_a', [set(8, 20)])]);
    expect(first?.kind).toBe('noBaseline');
    expect(first?.ratio).toBeNull();
    expect(first?.delta).toBeNull();
    expect(first?.previous).toBeNull();
    expect(percentChange(first?.ratio ?? null)).toBeNull();
  });

  it('reports an improvement', () => {
    const result = compare([
      day('2026-01-01', 'ex_a', [set(8, 20)]),
      day('2026-01-08', 'ex_a', [set(8, 22.5)]),
    ]);
    expect(result[1]?.kind).toBe('improved');
    expect(result[1]?.ratio).toBeCloseTo(22.5 / 20, 10);
  });

  it('reports a decline', () => {
    const result = compare([
      day('2026-01-01', 'ex_a', [set(8, 25)]),
      day('2026-01-08', 'ex_a', [set(8, 20)]),
    ]);
    expect(result[1]?.kind).toBe('declined');
    expect(result[1]?.ratio).toBeCloseTo(0.8, 10);
  });

  it('reports holding as unchanged, not as either direction', () => {
    const result = compare([
      day('2026-01-01', 'ex_a', [set(8, 20)]),
      day('2026-01-08', 'ex_a', [set(10, 16)]),
    ]);
    expect(result[1]?.kind).toBe('unchanged');
    expect(result[1]?.ratio).toBe(1);
  });

  it('compares against the last day the exercise was actually done', () => {
    // Skipped on the 8th and the 15th; the baseline is still the 1st.
    const result = compare([
      day('2026-01-01', 'ex_a', [set(8, 20)]),
      day('2026-01-08', 'ex_b', [set(8, 20)]),
      day('2026-01-15', 'ex_b', [set(8, 20)]),
      day('2026-01-22', 'ex_a', [set(8, 21)]),
    ]);
    const latest = result.find((entry) => entry.date === '2026-01-22' && entry.exerciseId === 'ex_a');
    expect(latest?.previousDate).toBe('2026-01-01');
    expect(latest?.kind).toBe('improved');
  });

  it('does not read a long absence as a decline', () => {
    const result = compare([
      day('2026-01-01', 'ex_a', [set(8, 20)]),
      day('2026-11-01', 'ex_a', [set(8, 20)]),
    ]);
    expect(result[1]?.kind).toBe('unchanged');
    expect(result[1]?.previousDate).toBe('2026-01-01');
  });

  it('keeps two exercises apart even when they are displayed the same', () => {
    // Same name on screen, different stable ids: two histories, not one.
    const result = compare([
      day('2026-01-01', 'ex_gym_press', [set(8, 20)]),
      day('2026-01-08', 'ex_home_press', [set(8, 60)]),
    ]);
    expect(result.every((entry) => entry.kind === 'noBaseline')).toBe(true);
  });

  it('keeps one exercise together when its name changes', () => {
    // The id is what joins history; the name is a label on top of it.
    const result = compare([
      day('2026-01-01', 'ex_bench_press', [set(8, 20)]),
      day('2026-01-08', 'ex_bench_press', [set(8, 25)]),
    ]);
    expect(result[1]?.kind).toBe('improved');
    expect(result[1]?.previousDate).toBe('2026-01-01');
  });

  it('never divides by a baseline it cannot divide by', () => {
    const days = exerciseDays([day('2026-01-01', 'ex_a', [set(8, 20)])]);
    // A hand-built zero baseline, which a scorable set can never produce.
    const forced = [{ ...days[0]!, best: { score: 0, set: set(1, 0) } }, days[0]!];
    const result = compareExerciseDays(forced);
    expect(result.every((entry) => Number.isFinite(entry.ratio ?? 0))).toBe(true);
    expect(result[1]?.kind).toBe('noBaseline');
  });

  it('reports the latest state per exercise', () => {
    const latest = latestComparisons(
      exerciseDays([
        day('2026-01-01', 'ex_a', [set(8, 20)]),
        day('2026-01-08', 'ex_a', [set(8, 25)]),
        day('2026-01-15', 'ex_a', [set(8, 22.5)]),
      ]),
    );
    expect(latest.get('ex_a')?.kind).toBe('declined');
    expect(latest.get('ex_a')?.date).toBe('2026-01-15');
  });
});

describe('muscle groups', () => {
  const build = (inputs: ExerciseDayInput[]) => musclePerformance(exerciseDays(inputs));
  const of = (inputs: ExerciseDayInput[], muscle: MuscleGroup) =>
    build(inputs).find((entry) => entry.muscle === muscle)!;

  it('takes one exercise in one group', () => {
    const chest = of(
      [
        day('2026-01-01', 'ex_a', [set(8, 20)], ['chest']),
        day('2026-01-08', 'ex_a', [set(8, 25)], ['chest']),
      ],
      'chest',
    );
    expect(chest.status).toBe('measured');
    expect(chest.ratio).toBeCloseTo(1.25, 10);
    expect(chest.exercises).toBe(1);
  });

  it('means the exercises inside a group', () => {
    const chest = of(
      [
        day('2026-01-01', 'ex_a', [set(10, 10)], ['chest']),
        day('2026-01-08', 'ex_a', [set(10, 20)], ['chest']), // ×2
        day('2026-01-01', 'ex_b', [set(10, 10)], ['chest']),
        day('2026-01-08', 'ex_b', [set(10, 10)], ['chest']), // ×1
      ],
      'chest',
    );
    expect(chest.ratio).toBeCloseTo(1.5, 10);
    expect(chest.exercises).toBe(2);
  });

  it('says a group with nothing logged has no data, not a zero', () => {
    const calves = of([day('2026-01-01', 'ex_a', [set(8, 20)], ['chest'])], 'calves');
    expect(calves.status).toBe('noData');
    expect(calves.ratio).toBeNull();
    expect(calves.latestScore).toBeNull();
  });

  it('says a group with one observation is awaiting a baseline', () => {
    const chest = of([day('2026-01-01', 'ex_a', [set(8, 20)], ['chest'])], 'chest');
    expect(chest.status).toBe('insufficientBaseline');
    expect(chest.ratio).toBeNull();
    // It has a score, though — the interface can show what was lifted.
    expect(chest.latestScore).toBe(kg(20) * 8);
  });

  it('lets a group start later without disturbing the others', () => {
    const days = [
      day('2026-01-01', 'ex_a', [set(8, 20)], ['chest']),
      day('2026-01-08', 'ex_a', [set(8, 25)], ['chest']),
      // Calves begin in February.
      day('2026-02-01', 'ex_c', [set(15, 40)], ['calves']),
    ];
    expect(of(days, 'chest').status).toBe('measured');
    expect(of(days, 'calves').status).toBe('insufficientBaseline');
    // And the Gym aggregate is chest alone, not chest averaged with a zero.
    expect(gymPerformance(exerciseDays(days)).ratio).toBeCloseTo(1.25, 10);
  });

  it('gives a two-muscle exercise a voice in each group and no extra weight', () => {
    const days = exerciseDays([
      // Deadlift improves 2×, and reaches back and hamstrings.
      day('2026-01-01', 'ex_dl', [set(5, 100)], ['back', 'hamstringsGlutes']),
      day('2026-01-08', 'ex_dl', [set(5, 200)], ['back', 'hamstringsGlutes']),
      // A chest exercise that holds.
      day('2026-01-01', 'ex_bp', [set(8, 60)], ['chest']),
      day('2026-01-08', 'ex_bp', [set(8, 60)], ['chest']),
    ]);
    const muscles = musclePerformance(days);
    const ratioOf = (muscle: MuscleGroup) =>
      muscles.find((entry) => entry.muscle === muscle)!.ratio;
    expect(ratioOf('back')).toBeCloseTo(2, 10);
    expect(ratioOf('hamstringsGlutes')).toBeCloseTo(2, 10);
    expect(ratioOf('chest')).toBeCloseTo(1, 10);
    // Three measured groups, equal weight: (2 + 2 + 1) / 3.
    expect(gymPerformance(days).ratio).toBeCloseTo(5 / 3, 10);
  });

  it('returns every group, so the body renderer can draw all ten', () => {
    expect(build([day('2026-01-01', 'ex_a', [set(8, 20)], ['chest'])])).toHaveLength(
      MUSCLE_GROUPS.length,
    );
  });
});

describe('groups are equal-weighted, whatever the exercise counts', () => {
  /**
   * The case the decision is about. Chest has four exercises, legs one, and
   * they move in opposite directions — so a flat mean over exercises and a
   * mean over groups give materially different answers.
   */
  const days = exerciseDays([
    // Four chest exercises, each doubling: ratio 2 apiece.
    ...['ex_c1', 'ex_c2', 'ex_c3', 'ex_c4'].flatMap((id) => [
      day('2026-01-01', id, [set(10, 10)], ['chest']),
      day('2026-01-08', id, [set(10, 20)], ['chest']),
    ]),
    // One quadriceps exercise, halving: ratio 0.5.
    day('2026-01-01', 'ex_q1', [set(10, 100)], ['quadriceps']),
    day('2026-01-08', 'ex_q1', [set(10, 50)], ['quadriceps']),
  ]);

  it('is the mean of the two group values', () => {
    const performance = gymPerformance(days);
    const chest = performance.muscles.find((entry) => entry.muscle === 'chest')!.ratio!;
    const quads = performance.muscles.find((entry) => entry.muscle === 'quadriceps')!.ratio!;
    expect(chest).toBeCloseTo(2, 10);
    expect(quads).toBeCloseTo(0.5, 10);
    expect(performance.ratio).toBeCloseTo((chest + quads) / 2, 10);
    expect(performance.ratio).toBeCloseTo(1.25, 10);
  });

  it('is not the flat mean over the five exercises', () => {
    // (2 + 2 + 2 + 2 + 0.5) / 5 = 1.7 — chest would carry four fifths of it.
    expect(gymPerformance(days).ratio).not.toBeCloseTo(1.7, 3);
  });

  it('counts each group once in the denominator', () => {
    const performance = gymPerformance(days);
    expect(performance.measured.sort()).toEqual(['chest', 'quadriceps']);
  });
});

describe('the longer view', () => {
  it('compares each exercise across its whole span, once', () => {
    // Bench is trained weekly, squat monthly. Both double over the window.
    const inputs: ExerciseDayInput[] = [];
    for (let week = 0; week < 8; week += 1) {
      const date = `2026-0${1 + Math.floor(week / 4)}-${String(1 + (week % 4) * 7).padStart(2, '0')}` as DateKey;
      inputs.push(day(date, 'ex_bp', [set(10, 10 + week * 1.5)], ['chest']));
    }
    inputs.push(day('2026-01-01', 'ex_sq', [set(10, 100)], ['quadriceps']));
    inputs.push(day('2026-02-22', 'ex_sq', [set(10, 200)], ['quadriceps']));

    const span = gymPerformanceOverSpan(exerciseDays(inputs));
    const chest = span.muscles.find((entry) => entry.muscle === 'chest')!;
    const quads = span.muscles.find((entry) => entry.muscle === 'quadriceps')!;
    // Bench: 10 → 20.5 kg. Squat: 100 → 200 kg.
    expect(chest.ratio).toBeCloseTo(20.5 / 10, 10);
    expect(quads.ratio).toBeCloseTo(2, 10);
    // Two groups, equal weight — the eight bench sessions do not outvote the
    // two squat sessions.
    expect(span.ratio).toBeCloseTo((20.5 / 10 + 2) / 2, 10);
    expect(chest.compared).toBe(1);
    expect(quads.compared).toBe(1);
  });

  it('excludes a group that has only ever been trained once', () => {
    const span = gymPerformanceOverSpan(
      exerciseDays([
        day('2026-01-01', 'ex_a', [set(8, 20)], ['chest']),
        day('2026-02-01', 'ex_a', [set(8, 30)], ['chest']),
        day('2026-02-01', 'ex_c', [set(15, 40)], ['calves']),
      ]),
    );
    expect(span.measured).toEqual(['chest']);
    expect(span.awaitingBaseline).toEqual(['calves']);
    expect(span.ratio).toBeCloseTo(1.5, 10);
  });

  it('has nothing to say before anything has been compared', () => {
    const span = gymPerformanceOverSpan(
      exerciseDays([day('2026-01-01', 'ex_a', [set(8, 20)], ['chest'])]),
    );
    expect(span.ratio).toBeNull();
    expect(span.measured).toEqual([]);
  });
});

/* ── The trend and year-to-date windows (Phase 4.1) ─────────────────────── */

describe('performance over an explicit window', () => {
  const build = (entries: [string, string, number][]) =>
    exerciseDays(
      entries.map(([date, exerciseId, weight]) =>
        day(date, exerciseId, [set(5, weight)], ['chest']),
      ),
    );

  it('compares the first and last observation inside the window', () => {
    const days = build([
      ['2026-01-01', 'ex_a', 100],
      ['2026-02-01', 'ex_a', 150],
      ['2026-03-01', 'ex_a', 200],
    ]);
    // Whole span: 100 → 200.
    expect(gymPerformanceInWindow(days, '2026-01-01', '2026-03-01').ratio).toBeCloseTo(2, 10);
    // February onwards: 150 → 200.
    expect(gymPerformanceInWindow(days, '2026-02-01', '2026-03-01').ratio).toBeCloseTo(4 / 3, 10);
  });

  it('has no baseline with only one observation in the window', () => {
    const days = build([
      ['2026-01-01', 'ex_a', 100],
      ['2026-03-01', 'ex_a', 200],
    ]);
    const window = gymPerformanceInWindow(days, '2026-02-01', '2026-03-01');
    expect(window.ratio).toBeNull();
    expect(window.awaitingBaseline).toContain('chest');
    // And emphatically not a decline, or a zero.
    expect(window.measured).toEqual([]);
  });

  it('excludes everything outside the window at both ends', () => {
    const days = build([
      ['2025-12-31', 'ex_a', 50],
      ['2026-01-01', 'ex_a', 100],
      ['2026-03-01', 'ex_a', 200],
      ['2026-03-02', 'ex_a', 400],
    ]);
    // Neither the day before nor the day after is in the answer.
    expect(gymPerformanceInWindow(days, '2026-01-01', '2026-03-01').ratio).toBeCloseTo(2, 10);
  });

  it('takes a rolling 60-day window inclusive of both ends', () => {
    const days = build([
      ['2026-01-01', 'ex_a', 100],
      ['2026-03-01', 'ex_a', 200],
    ]);
    // 2026-01-01 to 2026-03-01 is 60 days inclusive: the anchor is in.
    expect(gymPerformanceInWindow(days, '2026-01-01', '2026-03-01').ratio).toBeCloseTo(2, 10);
    // One day later and the anchor has rolled out; nothing left to compare.
    expect(gymPerformanceInWindow(days, '2026-01-02', '2026-03-02').ratio).toBeNull();
  });

  it('anchors year-to-date at January the first, not at the first-ever session', () => {
    const days = build([
      ['2025-06-01', 'ex_a', 50],
      ['2026-01-05', 'ex_a', 100],
      ['2026-06-01', 'ex_a', 120],
    ]);
    // This year: 100 → 120, and not 50 → 120 from where the user started.
    expect(gymPerformanceInWindow(days, '2026-01-01', '2026-06-01').ratio).toBeCloseTo(1.2, 10);
    expect(gymPerformanceInWindow(days, '2026-01-01', '2026-06-01').ratio).not.toBeCloseTo(2.4, 3);
  });

  it('leaves last year out of this year entirely', () => {
    const days = build([
      ['2025-11-01', 'ex_a', 100],
      ['2025-12-31', 'ex_a', 300],
      ['2026-01-02', 'ex_a', 310],
    ]);
    // One observation this year, so no baseline yet — December is not it.
    expect(gymPerformanceInWindow(days, '2026-01-01', '2026-01-02').ratio).toBeNull();
  });

  it('gives each exercise one voice however often it was trained', () => {
    const days = exerciseDays([
      // Bench eight times, squat twice. Both double.
      ...Array.from({ length: 8 }, (_, index) =>
        day(`2026-02-0${index + 1}`, 'ex_bp', [set(5, 100 + index * 10)], ['chest'], ['chest']),
      ),
      day('2026-02-01', 'ex_sq', [set(5, 100)], ['quadriceps'], ['quadriceps']),
      day('2026-02-08', 'ex_sq', [set(5, 200)], ['quadriceps'], ['quadriceps']),
    ]);
    const window = gymPerformanceInWindow(days, '2026-02-01', '2026-02-28');
    // Chest 170/100, quads 2. Two groups, equal weight — frequency is
    // evidence, not weight.
    expect(window.measured).toEqual(['chest', 'quadriceps']);
    expect(window.ratio).toBeCloseTo((1.7 + 2) / 2, 10);
  });

  it('says nothing at all about an empty window', () => {
    const days = build([['2026-01-01', 'ex_a', 100]]);
    const window = gymPerformanceInWindow(days, '2026-05-01', '2026-05-31');
    expect(window.ratio).toBeNull();
    expect(window.measured).toEqual([]);
    expect(window.untrained).toHaveLength(MUSCLE_GROUPS.length);
  });
});
