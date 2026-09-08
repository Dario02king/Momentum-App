import { MUSCLE_ROLE_WEIGHTS } from '../config/constants';
import type { MuscleGroup } from '../model';

/**
 * How much of one exercise each muscle group it touches is worth (D92).
 *
 * **An exercise is worth 100 %, however many groups it names.** That is the
 * whole rule, and it is what phase 4 did not have: there, a ratio went to
 * every mapped group at full strength, so a bench press spoke as loudly for
 * triceps as a triceps pushdown did and a compound movement gained total
 * influence simply by touching more of the body.
 *
 * Now:
 *
 * ```
 *   primaries   share 70 %, equally
 *   secondaries share 30 %, equally
 * ```
 *
 * Bench Press with a primary of chest and secondaries of triceps and front
 * delts is chest 70 %, triceps 15 %, delts 15 % — and 0.70 + 0.15 + 0.15 is
 * 1, which is the invariant the tests assert rather than a coincidence of
 * these particular numbers.
 *
 * ## Two degenerate shapes, both of which have to keep totalling 100 %
 *
 * - **No secondaries.** The primaries take the whole exercise. Giving chest
 *   70 % of a cable fly and throwing the other 30 % away would make an
 *   isolation exercise count for less than it is, purely because nothing else
 *   is listed.
 * - **No primaries.** Whatever is listed shares the whole exercise. This is
 *   also the shape a **pre-roles record** takes, and deliberately so: a set
 *   logged by phase 4 recorded no roles, so it replays under the equal
 *   weighting it was actually logged under. Reconstructing a split from
 *   today's catalogue would be exactly the inference D87 forbids.
 */

export interface MuscleRoles {
  /** Every group the exercise counts towards. */
  muscles: readonly MuscleGroup[];
  /**
   * The subset that is primary. Absent — not merely empty — is the pre-roles
   * era and reads as equal weighting across `muscles`.
   */
  primary?: readonly MuscleGroup[];
}

export interface MuscleWeight {
  muscle: MuscleGroup;
  /** This group's share of the exercise, from 0 to 1. */
  weight: number;
}

/**
 * One exercise's influence, split across the groups it reaches.
 *
 * Duplicates in the input are collapsed, so a mapping that names a group
 * twice cannot buy it a second share. The returned weights always sum to 1
 * when anything is listed at all, and to nothing when nothing is.
 */
export function muscleWeights(roles: MuscleRoles): MuscleWeight[] {
  const all = unique(roles.muscles);
  if (all.length === 0) return [];

  // Absent roles are the pre-roles era; a role naming a group the exercise
  // does not list is ignored rather than adding one.
  const primary = roles.primary === undefined ? [] : unique(roles.primary).filter((m) => all.includes(m));
  const secondary = all.filter((muscle) => !primary.includes(muscle));

  if (primary.length === 0) return even(all);
  if (secondary.length === 0) return even(primary);

  const perPrimary = MUSCLE_ROLE_WEIGHTS.PRIMARY / primary.length;
  const perSecondary = MUSCLE_ROLE_WEIGHTS.SECONDARY / secondary.length;
  return all.map((muscle) => ({
    muscle,
    weight: primary.includes(muscle) ? perPrimary : perSecondary,
  }));
}

function even(muscles: readonly MuscleGroup[]): MuscleWeight[] {
  return muscles.map((muscle) => ({ muscle, weight: 1 / muscles.length }));
}

function unique(muscles: readonly MuscleGroup[] | undefined): MuscleGroup[] {
  return [...new Set(muscles ?? [])];
}

/** The invariant, as a function: one exercise is worth one exercise. */
export function totalInfluence(weights: readonly MuscleWeight[]): number {
  return weights.reduce((sum, entry) => sum + entry.weight, 0);
}
