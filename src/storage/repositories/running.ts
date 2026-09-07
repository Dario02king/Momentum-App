import { nowIso } from '../../core/clock';
import { weekKeyOf, type DateKey, type WeekKey } from '../../core/dates';
import { createId } from '../../core/ids';
import type { RunRecord, RunSource } from '../../core/model';
import { STORES } from '../db';
import { createRepository } from './base';

const repo = createRepository<RunRecord>(STORES.runs);

const byTime = (a: RunRecord, b: RunRecord) => a.performedAt.localeCompare(b.performedAt);

export interface NewRunInput {
  date: DateKey;
  performedAt?: string;
  source?: RunSource;
  externalId?: string | null;
  distanceMetres?: number | null;
  durationSeconds?: number | null;
  elevationMetres?: number | null;
  steps?: number | null;
  note?: string | null;
  legacyCarryOver?: boolean;
  configSnapshotId: string;
}

/**
 * Runs.
 *
 * `source` and `externalId` are the import seam (D30) and nothing more —
 * there is no Strava client, no OAuth and no backend in this iteration. What
 * they buy now is that an imported activity arriving twice is one run rather
 * than two, which is a property a later adapter cannot add retroactively.
 */
export const runsRepository = {
  get: (id: string) => repo.get(id),

  async getAll(): Promise<RunRecord[]> {
    return (await repo.getAll()).sort(byTime);
  },

  async listByDate(date: DateKey): Promise<RunRecord[]> {
    return (await repo.queryIndex('by_date', date)).sort(byTime);
  },

  async listByWeek(weekKey: WeekKey): Promise<RunRecord[]> {
    return (await repo.queryIndex('by_week', weekKey)).sort(byTime);
  },

  async listByDateRange(from: DateKey, to: DateKey): Promise<RunRecord[]> {
    if (to < from) return [];
    return (await repo.queryIndex('by_date', IDBKeyRange.bound(from, to))).sort(byTime);
  },

  /** One external activity is one run, however many times it is imported. */
  async findByExternalId(externalId: string): Promise<RunRecord | undefined> {
    const matches = await repo.queryIndex('by_external', externalId);
    return matches[0];
  },

  async create(input: NewRunInput): Promise<RunRecord> {
    const stamp = nowIso();
    const record: RunRecord = {
      id: createId('run'),
      date: input.date,
      weekKey: weekKeyOf(input.date),
      performedAt: input.performedAt ?? stamp,
      source: input.source ?? 'manual',
      externalId: input.externalId ?? null,
      distanceMetres: input.distanceMetres ?? null,
      durationSeconds: input.durationSeconds ?? null,
      elevationMetres: input.elevationMetres ?? null,
      steps: input.steps ?? null,
      note: input.note ?? null,
      legacyCarryOver: input.legacyCarryOver ?? false,
      configSnapshotId: input.configSnapshotId,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await repo.put(record);
    return record;
  },

  put: (record: RunRecord) => repo.put(record),
  putMany: (records: RunRecord[]) => repo.putMany(records),
  remove: (id: string) => repo.remove(id),

  replaceAll: async (records: RunRecord[]) => {
    await repo.clear();
    await repo.putMany(records);
  },
};
