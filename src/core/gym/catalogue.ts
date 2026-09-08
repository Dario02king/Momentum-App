import type { ExerciseLoadType, ExerciseRecord, MuscleGroup } from '../model';

/**
 * The exercises Momentum ships with.
 *
 * Three properties matter more than the list itself:
 *
 * 1. **The ids are permanent.** `ex_bench_press` is what a two-year-old set
 *    row points at, so a rename is a rename rather than the start of a new
 *    history. Never renumber one, never reuse one.
 * 2. **The muscle groups are written down.** Nothing here is inferred from a
 *    name — "Row" is not parsed for the word "back". A mapping is a product
 *    decision, and a wrong guess would quietly redistribute a user's Gym
 *    score across the wrong parts of the body.
 * 3. **It is code, not data.** Like the demo foods, the catalogue ships with
 *    the app rather than living in a backup. What is stored is the user's
 *    own exercises and the mapping each *set* was logged under.
 *
 * 4. **Roles are stated, not positional.** `primary` names the groups that
 *    share 70 % of the exercise; everything else in `muscles` shares 30 %
 *    (D92). Phase 4 relied on "primary first" as a display convention, which
 *    was fine while every group counted the same and is not fine now that
 *    they do not — an ordering convention is exactly the kind of implicit
 *    fact that becomes wrong the first time someone sorts a list.
 * 5. **The load type is stated too.** A pull-up is not a lift of zero
 *    kilograms, and an assisted pull-up is not a lift of the assistance. See
 *    `core/gym/load.ts`.
 */
export interface CatalogueExercise {
  id: string;
  name: string;
  /** Every group the exercise counts towards. */
  muscles: MuscleGroup[];
  /** Those of them that are primary. Always a subset of `muscles`. */
  primary: MuscleGroup[];
  /** Omitted for the ordinary case, `external`. */
  loadType?: ExerciseLoadType;
}

export const EXERCISE_CATALOGUE: CatalogueExercise[] = [
  { id: 'ex_bench_press', name: 'Bench Press', muscles: ['chest', 'triceps', 'shoulders'], primary: ['chest'] },
  { id: 'ex_incline_press', name: 'Incline Dumbbell Press', muscles: ['chest', 'shoulders', 'triceps'], primary: ['chest'] },
  { id: 'ex_chest_fly', name: 'Cable Fly', muscles: ['chest'], primary: ['chest'] },
  { id: 'ex_push_up', name: 'Push-Up', muscles: ['chest', 'triceps', 'core'], primary: ['chest'], loadType: 'bodyweight' },

  { id: 'ex_lat_pulldown', name: 'Lat Pulldown', muscles: ['back', 'biceps'], primary: ['back'] },
  { id: 'ex_barbell_row', name: 'Barbell Row', muscles: ['back', 'biceps', 'forearms'], primary: ['back'] },
  // Both halves of a deadlift are the point of it, so both are primary and
  // share the 70 % between them. Nothing else about the rule changes.
  { id: 'ex_deadlift', name: 'Deadlift', muscles: ['back', 'hamstringsGlutes', 'forearms'], primary: ['back', 'hamstringsGlutes'] },
  { id: 'ex_pull_up', name: 'Pull-Up', muscles: ['back', 'biceps'], primary: ['back'], loadType: 'bodyweight' },
  { id: 'ex_assisted_pull_up', name: 'Assisted Pull-Up', muscles: ['back', 'biceps'], primary: ['back'], loadType: 'assisted' },

  { id: 'ex_overhead_press', name: 'Overhead Press', muscles: ['shoulders', 'triceps', 'core'], primary: ['shoulders'] },
  { id: 'ex_lateral_raise', name: 'Lateral Raise', muscles: ['shoulders'], primary: ['shoulders'] },

  { id: 'ex_biceps_curl', name: 'Biceps Curl', muscles: ['biceps'], primary: ['biceps'] },
  { id: 'ex_hammer_curl', name: 'Hammer Curl', muscles: ['biceps', 'forearms'], primary: ['biceps'] },

  { id: 'ex_triceps_pushdown', name: 'Triceps Pushdown', muscles: ['triceps'], primary: ['triceps'] },
  { id: 'ex_skullcrusher', name: 'Skullcrusher', muscles: ['triceps'], primary: ['triceps'] },
  { id: 'ex_dip', name: 'Dip', muscles: ['triceps', 'chest', 'shoulders'], primary: ['triceps'], loadType: 'bodyweight' },
  { id: 'ex_assisted_dip', name: 'Assisted Dip', muscles: ['triceps', 'chest', 'shoulders'], primary: ['triceps'], loadType: 'assisted' },

  { id: 'ex_squat', name: 'Back Squat', muscles: ['quadriceps', 'hamstringsGlutes', 'core'], primary: ['quadriceps'] },
  { id: 'ex_leg_press', name: 'Leg Press', muscles: ['quadriceps', 'hamstringsGlutes'], primary: ['quadriceps'] },
  { id: 'ex_leg_extension', name: 'Leg Extension', muscles: ['quadriceps'], primary: ['quadriceps'] },

  { id: 'ex_romanian_deadlift', name: 'Romanian Deadlift', muscles: ['hamstringsGlutes', 'back'], primary: ['hamstringsGlutes'] },
  { id: 'ex_hip_thrust', name: 'Hip Thrust', muscles: ['hamstringsGlutes'], primary: ['hamstringsGlutes'] },
  { id: 'ex_leg_curl', name: 'Leg Curl', muscles: ['hamstringsGlutes'], primary: ['hamstringsGlutes'] },

  { id: 'ex_calf_raise', name: 'Calf Raise', muscles: ['calves'], primary: ['calves'] },

  { id: 'ex_plank', name: 'Plank', muscles: ['core'], primary: ['core'], loadType: 'bodyweight' },
  { id: 'ex_cable_crunch', name: 'Cable Crunch', muscles: ['core'], primary: ['core'] },
  { id: 'ex_hanging_leg_raise', name: 'Hanging Leg Raise', muscles: ['core', 'forearms'], primary: ['core'], loadType: 'bodyweight' },

  { id: 'ex_wrist_curl', name: 'Wrist Curl', muscles: ['forearms'], primary: ['forearms'] },
  { id: 'ex_farmers_carry', name: "Farmer's Carry", muscles: ['forearms', 'core'], primary: ['forearms'] },
];

/** The catalogue as records, for seeding the store on first use. */
export function catalogueRecords(now: string): ExerciseRecord[] {
  return EXERCISE_CATALOGUE.map((entry) => ({
    id: entry.id,
    name: entry.name,
    muscles: entry.muscles,
    primaryMuscles: entry.primary,
    builtIn: true,
    loadType: entry.loadType ?? ('external' as const),
    durationSeconds: null,
    attributes: {},
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * Every catalogue entry names primaries that are actually in its `muscles`,
 * and names at least one. Exported so a test can assert it over the whole
 * table rather than over the three entries someone remembered to check.
 */
export function catalogueRolesAreWellFormed(): boolean {
  return EXERCISE_CATALOGUE.every(
    (entry) =>
      entry.primary.length > 0 &&
      entry.primary.every((muscle) => entry.muscles.includes(muscle)),
  );
}

/** Every muscle group at least one built-in exercise covers. */
export function cataloguedMuscles(): MuscleGroup[] {
  const seen = new Set<MuscleGroup>();
  for (const entry of EXERCISE_CATALOGUE) for (const muscle of entry.muscles) seen.add(muscle);
  return [...seen];
}
