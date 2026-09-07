import { nowIso } from '../../core/clock';
import { weekKeyOf, type DateKey, type WeekKey } from '../../core/dates';
import { createId } from '../../core/ids';
import type {
  ExerciseRecord,
  GymPlanRecord,
  GymSessionRecord,
  GymSetRecord,
  MuscleGroup,
} from '../../core/model';
import { STORES } from '../db';
import { createRepository } from './base';

/**
 * The gym stores.
 *
 * Four stores rather than one nested record, for one reason: D24 judges
 * strength on the **best set of the day**, so every set has to survive as its
 * own row. Storing sets inside a session as an array would work until the
 * first query that asks "what is the heaviest this exercise has ever been
 * lifted", which is the query the whole domain is built on.
 */

const exercises = createRepository<ExerciseRecord>(STORES.exercises);
const plans = createRepository<GymPlanRecord>(STORES.gymPlans);
const sessions = createRepository<GymSessionRecord>(STORES.gymSessions);
const sets = createRepository<GymSetRecord>(STORES.gymSets);

const byTime = (a: { performedAt: string }, b: { performedAt: string }) =>
  a.performedAt.localeCompare(b.performedAt);

export const exercisesRepository = {
  get: (id: string) => exercises.get(id),
  getAll: () => exercises.getAll(),
  listByMuscle: (muscle: MuscleGroup) => exercises.queryIndex('by_muscle', muscle),
  put: (record: ExerciseRecord) => exercises.put(record),
  putMany: (records: ExerciseRecord[]) => exercises.putMany(records),
  remove: (id: string) => exercises.remove(id),
  replaceAll: async (records: ExerciseRecord[]) => {
    await exercises.clear();
    await exercises.putMany(records);
  },
};

export const gymPlansRepository = {
  get: (id: string) => plans.get(id),
  getAll: () => plans.getAll(),
  put: (record: GymPlanRecord) => plans.put(record),
  remove: (id: string) => plans.remove(id),
  replaceAll: async (records: GymPlanRecord[]) => {
    await plans.clear();
    await plans.putMany(records);
  },
};

export interface NewGymSessionInput {
  date: DateKey;
  performedAt?: string;
  planId?: string | null;
  note?: string | null;
  /** True only for sessions carried over from RC2's Sport log. */
  legacyCarryOver?: boolean;
  configSnapshotId: string;
}

export const gymSessionsRepository = {
  get: (id: string) => sessions.get(id),

  async getAll(): Promise<GymSessionRecord[]> {
    return (await sessions.getAll()).sort(byTime);
  },

  async listByDate(date: DateKey): Promise<GymSessionRecord[]> {
    return (await sessions.queryIndex('by_date', date)).sort(byTime);
  },

  async listByWeek(weekKey: WeekKey): Promise<GymSessionRecord[]> {
    return (await sessions.queryIndex('by_week', weekKey)).sort(byTime);
  },

  async listByDateRange(from: DateKey, to: DateKey): Promise<GymSessionRecord[]> {
    if (to < from) return [];
    return (await sessions.queryIndex('by_date', IDBKeyRange.bound(from, to))).sort(byTime);
  },

  async create(input: NewGymSessionInput): Promise<GymSessionRecord> {
    const stamp = nowIso();
    const record: GymSessionRecord = {
      id: createId('gym'),
      date: input.date,
      weekKey: weekKeyOf(input.date),
      performedAt: input.performedAt ?? stamp,
      planId: input.planId ?? null,
      note: input.note ?? null,
      legacyCarryOver: input.legacyCarryOver ?? false,
      configSnapshotId: input.configSnapshotId,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await sessions.put(record);
    return record;
  },

  put: (record: GymSessionRecord) => sessions.put(record),
  putMany: (records: GymSessionRecord[]) => sessions.putMany(records),
  remove: (id: string) => sessions.remove(id),

  replaceAll: async (records: GymSessionRecord[]) => {
    await sessions.clear();
    await sessions.putMany(records);
  },
};

export const gymSetsRepository = {
  get: (id: string) => sets.get(id),
  getAll: () => sets.getAll(),
  listBySession: (sessionId: string) => sets.queryIndex('by_session', sessionId),
  listByExercise: (exerciseId: string) => sets.queryIndex('by_exercise', exerciseId),

  async listByDateRange(from: DateKey, to: DateKey): Promise<GymSetRecord[]> {
    if (to < from) return [];
    return sets.queryIndex('by_date', IDBKeyRange.bound(from, to));
  },

  put: (record: GymSetRecord) => sets.put(record),
  putMany: (records: GymSetRecord[]) => sets.putMany(records),
  remove: (id: string) => sets.remove(id),

  replaceAll: async (records: GymSetRecord[]) => {
    await sets.clear();
    await sets.putMany(records);
  },
};
