import type { ExerciseRecord, MuscleGroup } from '../model';

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
 * Multi-muscle entries list the primary group first. That order is used only
 * for display; the aggregation treats every listed group alike.
 */
export interface CatalogueExercise {
  id: string;
  name: string;
  muscles: MuscleGroup[];
}

export const EXERCISE_CATALOGUE: CatalogueExercise[] = [
  { id: 'ex_bench_press', name: 'Bench Press', muscles: ['chest', 'triceps'] },
  { id: 'ex_incline_press', name: 'Incline Dumbbell Press', muscles: ['chest', 'shoulders'] },
  { id: 'ex_chest_fly', name: 'Cable Fly', muscles: ['chest'] },

  { id: 'ex_lat_pulldown', name: 'Lat Pulldown', muscles: ['back', 'biceps'] },
  { id: 'ex_barbell_row', name: 'Barbell Row', muscles: ['back', 'biceps'] },
  { id: 'ex_deadlift', name: 'Deadlift', muscles: ['back', 'hamstringsGlutes'] },

  { id: 'ex_overhead_press', name: 'Overhead Press', muscles: ['shoulders', 'triceps'] },
  { id: 'ex_lateral_raise', name: 'Lateral Raise', muscles: ['shoulders'] },

  { id: 'ex_biceps_curl', name: 'Biceps Curl', muscles: ['biceps'] },
  { id: 'ex_hammer_curl', name: 'Hammer Curl', muscles: ['biceps', 'forearms'] },

  { id: 'ex_triceps_pushdown', name: 'Triceps Pushdown', muscles: ['triceps'] },
  { id: 'ex_skullcrusher', name: 'Skullcrusher', muscles: ['triceps'] },

  { id: 'ex_squat', name: 'Back Squat', muscles: ['quadriceps', 'hamstringsGlutes'] },
  { id: 'ex_leg_press', name: 'Leg Press', muscles: ['quadriceps'] },
  { id: 'ex_leg_extension', name: 'Leg Extension', muscles: ['quadriceps'] },

  { id: 'ex_romanian_deadlift', name: 'Romanian Deadlift', muscles: ['hamstringsGlutes'] },
  { id: 'ex_hip_thrust', name: 'Hip Thrust', muscles: ['hamstringsGlutes'] },
  { id: 'ex_leg_curl', name: 'Leg Curl', muscles: ['hamstringsGlutes'] },

  { id: 'ex_calf_raise', name: 'Calf Raise', muscles: ['calves'] },

  { id: 'ex_plank', name: 'Plank', muscles: ['core'] },
  { id: 'ex_cable_crunch', name: 'Cable Crunch', muscles: ['core'] },
  { id: 'ex_hanging_leg_raise', name: 'Hanging Leg Raise', muscles: ['core'] },

  { id: 'ex_wrist_curl', name: 'Wrist Curl', muscles: ['forearms'] },
  { id: 'ex_farmers_carry', name: "Farmer's Carry", muscles: ['forearms', 'core'] },
];

/** The catalogue as records, for seeding the store on first use. */
export function catalogueRecords(now: string): ExerciseRecord[] {
  return EXERCISE_CATALOGUE.map((entry) => ({
    id: entry.id,
    name: entry.name,
    muscles: entry.muscles,
    builtIn: true,
    bodyweightBased: false,
    addedWeightKg: null,
    durationSeconds: null,
    attributes: {},
    createdAt: now,
    updatedAt: now,
  }));
}

/** Every muscle group at least one built-in exercise covers. */
export function cataloguedMuscles(): MuscleGroup[] {
  const seen = new Set<MuscleGroup>();
  for (const entry of EXERCISE_CATALOGUE) for (const muscle of entry.muscles) seen.add(muscle);
  return [...seen];
}
