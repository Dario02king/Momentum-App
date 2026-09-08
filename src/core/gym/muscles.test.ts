import { describe, expect, it } from 'vitest';
import { MUSCLE_ROLE_WEIGHTS } from '../config/constants';
import type { MuscleGroup } from '../model';
import { muscleWeights, totalInfluence } from './muscles';
import { exerciseDays, gymPerformance, musclePerformance, type SetInput } from './performance';

const weightOf = (weights: { muscle: MuscleGroup; weight: number }[], muscle: MuscleGroup) =>
  weights.find((entry) => entry.muscle === muscle)?.weight ?? 0;

describe('primary and secondary influence', () => {
  it('splits 70/30 across one primary and two secondaries', () => {
    // The specification's own example.
    const weights = muscleWeights({
      muscles: ['chest', 'triceps', 'shoulders'],
      primary: ['chest'],
    });
    expect(weightOf(weights, 'chest')).toBeCloseTo(0.7, 12);
    expect(weightOf(weights, 'triceps')).toBeCloseTo(0.15, 12);
    expect(weightOf(weights, 'shoulders')).toBeCloseTo(0.15, 12);
  });

  it('divides the 30 % equally however many secondaries there are', () => {
    const three = muscleWeights({
      muscles: ['back', 'biceps', 'forearms', 'core'],
      primary: ['back'],
    });
    for (const muscle of ['biceps', 'forearms', 'core'] as MuscleGroup[]) {
      expect(weightOf(three, muscle)).toBeCloseTo(MUSCLE_ROLE_WEIGHTS.SECONDARY / 3, 12);
    }
  });

  it('shares the 70 % between two primaries', () => {
    const weights = muscleWeights({
      muscles: ['back', 'hamstringsGlutes', 'forearms'],
      primary: ['back', 'hamstringsGlutes'],
    });
    expect(weightOf(weights, 'back')).toBeCloseTo(0.35, 12);
    expect(weightOf(weights, 'hamstringsGlutes')).toBeCloseTo(0.35, 12);
    expect(weightOf(weights, 'forearms')).toBeCloseTo(0.3, 12);
  });

  it('always totals exactly one exercise', () => {
    const shapes = [
      { muscles: ['chest'] as MuscleGroup[], primary: ['chest'] as MuscleGroup[] },
      { muscles: ['chest', 'triceps'] as MuscleGroup[], primary: ['chest'] as MuscleGroup[] },
      { muscles: ['a', 'b', 'c', 'd', 'e'] as unknown as MuscleGroup[], primary: ['a'] as unknown as MuscleGroup[] },
      { muscles: ['back', 'biceps'] as MuscleGroup[] },
      { muscles: ['core'] as MuscleGroup[], primary: [] as MuscleGroup[] },
    ];
    for (const shape of shapes) {
      expect(totalInfluence(muscleWeights(shape))).toBeCloseTo(1, 12);
    }
  });

  it('gives an isolation exercise the whole 100 %, not 70 % and a wasted 30 %', () => {
    const weights = muscleWeights({ muscles: ['chest'], primary: ['chest'] });
    expect(weightOf(weights, 'chest')).toBe(1);
  });

  it('shares equally when no roles were recorded, which is the pre-roles era', () => {
    const weights = muscleWeights({ muscles: ['back', 'hamstringsGlutes'] });
    expect(weightOf(weights, 'back')).toBe(0.5);
    expect(weightOf(weights, 'hamstringsGlutes')).toBe(0.5);
  });

  it('cannot be given a second share by naming a group twice', () => {
    const weights = muscleWeights({
      muscles: ['chest', 'chest', 'triceps'],
      primary: ['chest', 'chest'],
    });
    expect(weights).toHaveLength(2);
    expect(totalInfluence(weights)).toBeCloseTo(1, 12);
  });

  it('ignores a primary the exercise does not actually list', () => {
    const weights = muscleWeights({ muscles: ['chest'], primary: ['calves'] });
    expect(weightOf(weights, 'calves')).toBe(0);
    expect(weightOf(weights, 'chest')).toBe(1);
  });

  it('says nothing about an exercise that reaches nothing', () => {
    expect(muscleWeights({ muscles: [] })).toEqual([]);
  });
});

/* ── How the weighting reaches the aggregate ──────────────────────────── */

const kg = (value: number) => value * 1000;
const set = (reps: number, weight: number, order = 0): SetInput => ({
  id: `s${order}`,
  reps,
  weightGrams: kg(weight),
  order,
});
const day = (
  date: string,
  exerciseId: string,
  sets: SetInput[],
  muscles: MuscleGroup[],
  primary?: MuscleGroup[],
) => ({ date, exerciseId, muscles, ...(primary ? { primaryMuscles: primary } : {}), sets });

describe('a compound exercise gains no total influence', () => {
  it('speaks quietly in a group it only assists', () => {
    /*
     * Bench press doubles; a triceps pushdown holds. The bench lists one
     * secondary, so triceps get the whole 30 % of it, against the pushdown's
     * 100 % — and the group moves far less than the doubling suggests, which
     * is what "it is a secondary there" means.
     */
    const days = exerciseDays([
      day('2026-01-01', 'ex_bp', [set(5, 60)], ['chest', 'triceps'], ['chest']),
      day('2026-01-08', 'ex_bp', [set(5, 120)], ['chest', 'triceps'], ['chest']),
      day('2026-01-01', 'ex_pd', [set(10, 30)], ['triceps'], ['triceps']),
      day('2026-01-08', 'ex_pd', [set(10, 30)], ['triceps'], ['triceps']),
    ]);
    const muscles = musclePerformance(days);
    const ratioOf = (muscle: MuscleGroup) =>
      muscles.find((entry) => entry.muscle === muscle)!.ratio!;

    expect(ratioOf('chest')).toBeCloseTo(2, 12);
    // (0.30 × 2 + 1.0 × 1) / 1.30
    expect(ratioOf('triceps')).toBeCloseTo((0.3 * 2 + 1) / 1.3, 12);
    // Under the old equal weighting this would have been (2 + 1) / 2 = 1.5.
    expect(ratioOf('triceps')).toBeLessThan(1.5);
  });

  it('does not outrank an isolation exercise in its own group', () => {
    const compound = exerciseDays([
      day('2026-01-01', 'ex_bp', [set(5, 60)], ['chest', 'triceps', 'shoulders'], ['chest']),
      day('2026-01-08', 'ex_bp', [set(5, 120)], ['chest', 'triceps', 'shoulders'], ['chest']),
    ]);
    const weights = muscleWeights({
      muscles: ['chest', 'triceps', 'shoulders'],
      primary: ['chest'],
    });
    // Three groups reached, one exercise's worth of influence between them.
    expect(totalInfluence(weights)).toBeCloseTo(1, 12);
    // And the aggregate is still the equal-weighted mean over the groups it
    // measured, so touching three groups did not multiply the exercise.
    expect(gymPerformance(compound).measured).toHaveLength(3);
    expect(gymPerformance(compound).ratio).toBeCloseTo(2, 12);
  });

  it('replays a pre-roles set exactly as it was scored', () => {
    // No `primaryMuscles`: every group counted the same, and still does.
    const days = exerciseDays([
      day('2026-01-01', 'ex_dl', [set(5, 100)], ['back', 'hamstringsGlutes']),
      day('2026-01-08', 'ex_dl', [set(5, 200)], ['back', 'hamstringsGlutes']),
      day('2026-01-01', 'ex_bp', [set(8, 60)], ['chest']),
      day('2026-01-08', 'ex_bp', [set(8, 60)], ['chest']),
    ]);
    const muscles = musclePerformance(days);
    const ratioOf = (muscle: MuscleGroup) =>
      muscles.find((entry) => entry.muscle === muscle)!.ratio;
    expect(ratioOf('back')).toBeCloseTo(2, 12);
    expect(ratioOf('hamstringsGlutes')).toBeCloseTo(2, 12);
    expect(gymPerformance(days).ratio).toBeCloseTo(5 / 3, 12);
  });

  it('keeps groups equal-weighted above, whatever the exercises did below', () => {
    const days = exerciseDays([
      // Five chest exercises, all improving; one calf exercise holding.
      ...['a', 'b', 'c', 'd', 'e'].flatMap((id) => [
        day('2026-01-01', `ex_${id}`, [set(5, 50)], ['chest'], ['chest']),
        day('2026-01-08', `ex_${id}`, [set(5, 100)], ['chest'], ['chest']),
      ]),
      day('2026-01-01', 'ex_calf', [set(15, 40)], ['calves'], ['calves']),
      day('2026-01-08', 'ex_calf', [set(15, 40)], ['calves'], ['calves']),
    ]);
    // (2 + 1) / 2, not (2 × 5 + 1) / 6.
    expect(gymPerformance(days).ratio).toBeCloseTo(1.5, 12);
  });
});
