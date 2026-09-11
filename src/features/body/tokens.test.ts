import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS } from '../../core/model';
import { MUSCLE_STATE_KEYS, type MuscleState as RendererMuscleState } from '../../components/BodyRenderer';
import { BODY_REGIONS, REGION_FACING } from './muscleMeshMap';
import { IDENTITY_COLOR, STATE_COLOR, type MuscleState } from './tokens';

/**
 * The handoff's ids are Momentum's ids, and its five states are the body
 * renderer's five states. Neither is looked up through a table, so the only
 * way they can drift is silently — these make that loud.
 */

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
// Compile-time: the token file's MuscleState is the renderer's, name for name.
const statesAgree: Equal<MuscleState, RendererMuscleState> = true;

describe('muscle-map tokens follow the domain', () => {
  it('the body regions are the ten muscle groups, in the same order', () => {
    expect([...BODY_REGIONS]).toEqual([...MUSCLE_GROUPS]);
  });

  it('every group has an identity colour and a facing', () => {
    expect(Object.keys(IDENTITY_COLOR).sort()).toEqual([...MUSCLE_GROUPS].sort());
    expect(Object.keys(REGION_FACING).sort()).toEqual([...MUSCLE_GROUPS].sort());
  });

  it('the five state tokens are the five states the renderer draws', () => {
    expect(statesAgree).toBe(true);
    expect(Object.keys(STATE_COLOR).sort()).toEqual(Object.keys(MUSCLE_STATE_KEYS).sort());
  });
});
