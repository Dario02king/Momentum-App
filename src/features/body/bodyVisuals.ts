import type { MuscleGroup } from '../../core/model';
import { percentChange, type MusclePerformance } from '../../core/gym/performance';
import { muscleStateOf } from '../gym/muscleState';
import { BODY_REGIONS } from './muscleMeshMap';
import { STATE_COLOR, stateIntensity, type MuscleState } from './tokens';
import type { MuscleVisual } from './useMuscleHighlight';

/**
 * What the 3D body needs per muscle, from what the Gym domain already
 * derived.
 *
 * A pure mapping: the state is `muscleStateOf()`, the delta is
 * `percentChange()`, the tint is the state's model colour and the intensity is the
 * approved curve in tokens.ts. Nothing here reads history, chooses a range,
 * finds a baseline or computes a ratio — it receives `MusclePerformance`
 * values from whichever window the screen already loaded and translates
 * them. Every one of the ten regions is present in the result, so an
 * untrained group arrives as `noData` at intensity 0 rather than as a hole.
 */
export interface BodyMuscleVisual {
  id: MuscleGroup;
  state: MuscleState;
  /** Percentage change, or `null` where the domain has no ratio. */
  delta: number | null;
  /** The state's model colour — what the region is tinted with. */
  tint: string;
  /** 0–1, the magnitude of the change; 0 keeps the region base grey. */
  intensity: number;
}

export function toBodyVisuals(muscles: readonly MusclePerformance[]): BodyMuscleVisual[] {
  const byMuscle = new Map(muscles.map((entry) => [entry.muscle, entry]));
  return BODY_REGIONS.map((id) => {
    const entry = byMuscle.get(id);
    const state: MuscleState = entry ? muscleStateOf(entry) : 'noData';
    const delta = entry ? percentChange(entry.ratio) : null;
    return {
      id,
      state,
      delta,
      tint: STATE_COLOR[state].model,
      intensity: stateIntensity(state, delta ?? 0),
    };
  });
}

/** The same visuals in the shape `BodyViewer`'s `visuals` prop takes. */
export function visualsByMuscle(
  visuals: readonly BodyMuscleVisual[],
): Partial<Record<MuscleGroup, MuscleVisual>> {
  const out: Partial<Record<MuscleGroup, MuscleVisual>> = {};
  for (const visual of visuals) out[visual.id] = { tint: visual.tint, intensity: visual.intensity };
  return out;
}
