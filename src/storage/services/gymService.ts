import { nowIso, today } from '../../core/clock';
import { isSameWeek, type DateKey } from '../../core/dates';
import { catalogueRecords } from '../../core/gym/catalogue';
import {
  exerciseDays,
  gymPerformance,
  gymPerformanceOverSpan,
  latestComparisons,
  type ExerciseComparison,
  type ExerciseDay,
  type ExerciseDayInput,
  type GymPerformance,
  type SetInput,
} from '../../core/gym/performance';
import { createId } from '../../core/ids';
import type { ExerciseRecord, GymSessionRecord, GymSetRecord, MuscleGroup } from '../../core/model';
import { ensureCurrentSnapshot } from '../configService';
import { exercisesRepository, gymSessionsRepository, gymSetsRepository } from '../repositories';
import { EditWindowError } from './checkInService';

/**
 * Everything the Gym screens read and write.
 *
 * The rules that are not the UI's to know live here: which exercises exist,
 * what a session contains, and when a set may still be changed. The
 * arithmetic lives one layer further down in `core/gym/performance.ts` and
 * touches no storage at all.
 */

/* ── The catalogue ──────────────────────────────────────────────────────── */

/**
 * Seeds the built-in exercises the first time Gym is opened.
 *
 * Idempotent, and it never overwrites: an exercise the user has renamed keeps
 * its name, because the record belongs to them once it exists. Only genuinely
 * missing ids are written, which is also how a later release adds one.
 */
export async function ensureExerciseCatalogue(): Promise<ExerciseRecord[]> {
  const existing = await exercisesRepository.getAll();
  const known = new Set(existing.map((exercise) => exercise.id));
  const missing = catalogueRecords(nowIso()).filter((record) => !known.has(record.id));
  if (missing.length > 0) await exercisesRepository.putMany(missing);
  return [...existing, ...missing].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listExercises(): Promise<ExerciseRecord[]> {
  return (await exercisesRepository.getAll()).sort((a, b) => a.name.localeCompare(b.name));
}

export interface NewExerciseInput {
  name: string;
  muscles: MuscleGroup[];
}

/** A user's own exercise. Its id is generated once and never changes. */
export async function createExercise(input: NewExerciseInput): Promise<ExerciseRecord> {
  const stamp = nowIso();
  const record: ExerciseRecord = {
    id: createId('ex'),
    name: input.name.trim(),
    muscles: input.muscles,
    builtIn: false,
    bodyweightBased: false,
    addedWeightKg: null,
    durationSeconds: null,
    attributes: {},
    createdAt: stamp,
    updatedAt: stamp,
  };
  await exercisesRepository.put(record);
  return record;
}

/* ── A session and what it contains ─────────────────────────────────────── */

export interface SessionExercise {
  exercise: ExerciseRecord;
  sets: GymSetRecord[];
  /** The best set of this exercise on this day, if any set is scorable. */
  bestScore: number | null;
}

export interface GymSessionView {
  session: GymSessionRecord;
  exercises: SessionExercise[];
  /** Whether the session may still be changed, by the app's existing rule. */
  editable: boolean;
}

/**
 * The same rule sessions already follow, applied to what is inside them.
 *
 * A training session is a diary entry rather than a daily check-in, so it is
 * editable for the week it belongs to — `checkInService` established that and
 * a set is part of a session, not a thing with a policy of its own.
 */
function assertEditable(date: DateKey, reference: DateKey): void {
  if (!isSameWeek(date, reference)) throw new EditWindowError(date, 'closed');
}

export async function loadSession(
  sessionId: string,
  reference: DateKey = today(),
): Promise<GymSessionView | null> {
  const session = await gymSessionsRepository.get(sessionId);
  if (!session) return null;
  const [sets, exercises] = await Promise.all([
    gymSetsRepository.listBySession(sessionId),
    listExercises(),
  ]);
  return {
    session,
    exercises: groupSets(sets, exercises),
    editable: isSameWeek(session.date, reference),
  };
}

function groupSets(sets: GymSetRecord[], exercises: ExerciseRecord[]): SessionExercise[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const order: string[] = [];
  const grouped = new Map<string, GymSetRecord[]>();
  for (const set of [...sets].sort((a, b) => a.order - b.order)) {
    const list = grouped.get(set.exerciseId);
    if (list) list.push(set);
    else {
      grouped.set(set.exerciseId, [set]);
      order.push(set.exerciseId);
    }
  }

  return order.map((exerciseId) => {
    const list = grouped.get(exerciseId)!;
    const best = bestScoreOf(list);
    return {
      exercise:
        byId.get(exerciseId) ??
        /* An exercise that has been deleted still has to render its history:
           the sets know their own muscles, so nothing is lost but the name. */
        ({
          id: exerciseId,
          name: exerciseId,
          muscles: list[0]?.muscles ?? [],
          builtIn: false,
          bodyweightBased: false,
          addedWeightKg: null,
          durationSeconds: null,
          attributes: {},
          createdAt: '',
          updatedAt: '',
        } satisfies ExerciseRecord),
      sets: list,
      bestScore: best,
    };
  });
}

const toSetInput = (set: GymSetRecord): SetInput => ({
  id: set.id,
  reps: set.reps,
  weightGrams: set.weightGrams,
  order: set.order,
});

function bestScoreOf(sets: GymSetRecord[]): number | null {
  let best: number | null = null;
  for (const set of sets) {
    const input = toSetInput(set);
    if (input.reps <= 0 || input.weightGrams <= 0) continue;
    const score = input.reps * input.weightGrams;
    if (best === null || score > best) best = score;
  }
  return best;
}

export interface AddSetInput {
  sessionId: string;
  exerciseId: string;
  reps: number;
  weightGrams: number;
}

/**
 * Adds one set.
 *
 * The muscle groups are copied from the exercise **now** and stored on the
 * set, so remapping an exercise later changes what it counts towards from
 * that point forward and cannot reach into a workout already done.
 */
export async function addSet(
  input: AddSetInput,
  reference: DateKey = today(),
): Promise<GymSetRecord> {
  const session = await gymSessionsRepository.get(input.sessionId);
  if (!session) throw new Error(`Unknown session ${input.sessionId}`);
  assertEditable(session.date, reference);

  const [exercise, existing] = await Promise.all([
    exercisesRepository.get(input.exerciseId),
    gymSetsRepository.listBySession(input.sessionId),
  ]);

  const record: GymSetRecord = {
    id: createId('set'),
    sessionId: input.sessionId,
    exerciseId: input.exerciseId,
    date: session.date,
    weightGrams: Math.max(0, Math.round(input.weightGrams)),
    reps: Math.max(0, Math.round(input.reps)),
    order: existing.length,
    muscles: exercise?.muscles ?? [],
    createdAt: nowIso(),
  };
  await gymSetsRepository.put(record);
  return record;
}

export async function updateSet(
  id: string,
  patch: { reps?: number; weightGrams?: number },
  reference: DateKey = today(),
): Promise<GymSetRecord | undefined> {
  const set = await gymSetsRepository.get(id);
  if (!set) return undefined;
  assertEditable(set.date, reference);
  const next: GymSetRecord = {
    ...set,
    reps: patch.reps === undefined ? set.reps : Math.max(0, Math.round(patch.reps)),
    weightGrams:
      patch.weightGrams === undefined ? set.weightGrams : Math.max(0, Math.round(patch.weightGrams)),
  };
  await gymSetsRepository.put(next);
  return next;
}

export async function removeSet(id: string, reference: DateKey = today()): Promise<void> {
  const set = await gymSetsRepository.get(id);
  if (!set) return;
  assertEditable(set.date, reference);
  await gymSetsRepository.remove(id);
}

/** Removes an exercise and every set of it, within the session's own week. */
export async function removeExerciseFromSession(
  sessionId: string,
  exerciseId: string,
  reference: DateKey = today(),
): Promise<void> {
  const sets = await gymSetsRepository.listBySession(sessionId);
  for (const set of sets.filter((entry) => entry.exerciseId === exerciseId)) {
    assertEditable(set.date, reference);
    await gymSetsRepository.remove(set.id);
  }
}

/**
 * Opens today's session, creating one if there is not already one.
 *
 * Several sessions on one day are legitimate — the weekly quota counts them —
 * but tapping "log a session" twice in a minute means one workout, so the
 * most recent session for the day is reused rather than doubled.
 */
export async function openSessionForDay(
  date: DateKey = today(),
  reference: DateKey = today(),
): Promise<GymSessionRecord> {
  const existing = await gymSessionsRepository.listByDate(date);
  const last = existing[existing.length - 1];
  if (last) return last;
  assertEditable(date, reference);
  const snapshot = await ensureCurrentSnapshot();
  return gymSessionsRepository.create({ date, configSnapshotId: snapshot.id });
}

/* ── Performance, replayed ──────────────────────────────────────────────── */

export interface GymHistory {
  /** Every exercise-day in the window, oldest first. */
  days: ExerciseDay[];
  /** The latest comparison per exercise. */
  comparisons: Map<string, ExerciseComparison>;
  /** Recent progress: day against previous day. */
  recent: GymPerformance;
  /** The long view: each exercise across its whole span in the window. */
  overall: GymPerformance;
  /** Names for whatever the screens need to label, by exercise id. */
  names: Map<string, string>;
}

/**
 * The Gym pipeline, run over a date range.
 *
 * Replayed from sets on every load, like everything else derived in this app.
 * Nothing about a past workout is stored as a score, so an edit inside the
 * edit window simply produces a different answer next time — and an edit is
 * the only thing that can.
 */
export async function loadGymHistory(
  from: DateKey,
  to: DateKey,
): Promise<GymHistory> {
  const [sets, exercises] = await Promise.all([
    gymSetsRepository.listByDateRange(from, to),
    listExercises(),
  ]);

  const names = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));

  /** One bucket per exercise per day. */
  const buckets = new Map<string, ExerciseDayInput>();
  for (const set of sets) {
    const key = `${set.date}#${set.exerciseId}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        date: set.date,
        exerciseId: set.exerciseId,
        // The set carries the mapping it was logged under; the catalogue is
        // consulted only when a legacy row has none.
        muscles: set.muscles.length > 0 ? set.muscles : (names.has(set.exerciseId) ? exercises.find((entry) => entry.id === set.exerciseId)!.muscles : []),
        sets: [],
      };
      buckets.set(key, bucket);
    }
    (bucket.sets as SetInput[]).push(toSetInput(set));
  }

  const days = exerciseDays([...buckets.values()]);
  return {
    days,
    comparisons: latestComparisons(days),
    recent: gymPerformance(days),
    overall: gymPerformanceOverSpan(days),
    names,
  };
}

/** Every recorded day of one exercise, newest first, for its detail screen. */
export function exerciseHistory(history: GymHistory, exerciseId: string): ExerciseDay[] {
  return history.days
    .filter((day) => day.exerciseId === exerciseId)
    .sort((a, b) => b.date.localeCompare(a.date));
}
