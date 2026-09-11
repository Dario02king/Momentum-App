import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS } from '../../core/model';
import { percentChange, type MusclePerformance } from '../../core/gym/performance';
import { muscleStateOf } from '../gym/muscleState';
import { BODY_REGIONS } from './muscleMeshMap';
import { STATE_COLOR, stateIntensity } from './tokens';
import { toBodyVisuals, visualsByMuscle } from './bodyVisuals';

const measured = (muscle: MusclePerformance['muscle'], ratio: number): MusclePerformance => ({
  muscle, status: 'measured', ratio, exercises: 2, compared: 2, latestScore: 100000,
});
const awaiting = (muscle: MusclePerformance['muscle']): MusclePerformance => ({
  muscle, status: 'insufficientBaseline', ratio: null, exercises: 1, compared: 0, latestScore: 50000,
});
const untrained = (muscle: MusclePerformance['muscle']): MusclePerformance => ({
  muscle, status: 'noData', ratio: null, exercises: 0, compared: 0, latestScore: null,
});

const SAMPLE: MusclePerformance[] = [
  measured('chest', 1.12), measured('back', 0.94), measured('shoulders', 1),
  awaiting('biceps'), untrained('triceps'), measured('core', 1.07),
  measured('quadriceps', 0.98), measured('hamstringsGlutes', 1), untrained('calves'), untrained('forearms'),
];

describe('toBodyVisuals', () => {
  it('maps all ten muscle groups, in region order, even when some are absent from the input', () => {
    const visuals = toBodyVisuals(SAMPLE.slice(0, 4));
    expect(visuals.map((v) => v.id)).toEqual([...BODY_REGIONS]);
    expect(visuals.map((v) => v.id)).toEqual([...MUSCLE_GROUPS]);
    expect(visuals.slice(4).every((v) => v.state === 'noData' && v.intensity === 0 && v.delta === null)).toBe(true);
  });

  it('states are exactly muscleStateOf() and deltas exactly percentChange()', () => {
    const visuals = toBodyVisuals(SAMPLE);
    for (const entry of SAMPLE) {
      const visual = visuals.find((v) => v.id === entry.muscle)!;
      expect(visual.state).toBe(muscleStateOf(entry));
      expect(visual.delta).toBe(percentChange(entry.ratio));
    }
  });

  it('tint is the state ink and intensity the approved curve, from tokens.ts', () => {
    for (const visual of toBodyVisuals(SAMPLE)) {
      expect(visual.tint).toBe(STATE_COLOR[visual.state].ink);
      expect(visual.intensity).toBe(stateIntensity(visual.state, visual.delta ?? 0));
    }
    const chest = toBodyVisuals(SAMPLE).find((v) => v.id === 'chest')!;
    expect(chest.intensity).toBeCloseTo(1, 6); // +12 % saturates the curve
    expect(toBodyVisuals(SAMPLE).find((v) => v.id === 'calves')!.intensity).toBe(0);
  });

  it('does not mutate what it is given', () => {
    const frozen = SAMPLE.map((entry) => Object.freeze({ ...entry }));
    const snapshot = JSON.stringify(frozen);
    toBodyVisuals(frozen);
    visualsByMuscle(toBodyVisuals(frozen));
    expect(JSON.stringify(frozen)).toBe(snapshot);
  });

  it('visualsByMuscle carries tint and intensity into the viewer prop shape', () => {
    const byMuscle = visualsByMuscle(toBodyVisuals(SAMPLE));
    expect(Object.keys(byMuscle).sort()).toEqual([...MUSCLE_GROUPS].sort());
    expect(byMuscle.chest).toEqual({ tint: STATE_COLOR.improved.ink, intensity: 1 });
    expect(byMuscle.biceps).toEqual({ tint: STATE_COLOR.awaitingBaseline.ink, intensity: 0.42 });
  });
});
