import { nowIso } from '../../core/clock';
import type { DateKey, WeekKey } from '../../core/dates';
import { weekKeyOf } from '../../core/dates';
import { createId } from '../../core/ids';
import type { SessionDetail, SportsSessionRecord } from '../../core/model';
import { STORES } from '../db';
import { createRepository } from './base';

const repo = createRepository<SportsSessionRecord>(STORES.sportsSessions);

export interface NewSessionInput {
  domainId: string;
  date: DateKey;
  performedAt?: string;
  activityType?: string | null;
  note?: string | null;
  durationMinutes?: number | null;
  /** Reserved for version 2 workout detail; nothing in version 1 sets it. */
  detail?: SessionDetail | null;
  configSnapshotId: string;
}

function byTime(a: SportsSessionRecord, b: SportsSessionRecord): number {
  return a.performedAt.localeCompare(b.performedAt);
}

export const sportsSessionsRepository = {
  async get(id: string): Promise<SportsSessionRecord | undefined> {
    return repo.get(id);
  },

  async listByWeek(weekKey: WeekKey): Promise<SportsSessionRecord[]> {
    return (await repo.queryIndex('by_week', weekKey)).sort(byTime);
  },

  async listByDate(date: DateKey): Promise<SportsSessionRecord[]> {
    return (await repo.queryIndex('by_date', date)).sort(byTime);
  },

  async listByDateRange(from: DateKey, to: DateKey): Promise<SportsSessionRecord[]> {
    if (to < from) return [];
    return (await repo.queryIndex('by_date', IDBKeyRange.bound(from, to))).sort(byTime);
  },

  /**
   * A session is a diary entry, not a daily checkbox: several can happen on
   * one day, and the week it counts towards is derived from its local date.
   */
  async create(input: NewSessionInput): Promise<SportsSessionRecord> {
    const stamp = nowIso();
    const record: SportsSessionRecord = {
      id: createId('ses'),
      domainId: input.domainId,
      date: input.date,
      weekKey: weekKeyOf(input.date),
      performedAt: input.performedAt ?? stamp,
      activityType: input.activityType ?? null,
      note: input.note ?? null,
      durationMinutes: input.durationMinutes ?? null,
      detail: input.detail ?? null,
      configSnapshotId: input.configSnapshotId,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await repo.put(record);
    return record;
  },

  async update(
    id: string,
    patch: Partial<
      Pick<
        SportsSessionRecord,
        'date' | 'performedAt' | 'activityType' | 'note' | 'durationMinutes' | 'detail'
      >
    >,
  ): Promise<SportsSessionRecord | undefined> {
    const current = await repo.get(id);
    if (!current) return undefined;
    const date = patch.date ?? current.date;
    const next: SportsSessionRecord = {
      ...current,
      ...patch,
      date,
      weekKey: weekKeyOf(date),
      updatedAt: nowIso(),
    };
    await repo.put(next);
    return next;
  },

  async remove(id: string): Promise<void> {
    await repo.remove(id);
  },

  async getAll(): Promise<SportsSessionRecord[]> {
    return (await repo.getAll()).sort(byTime);
  },

  async replaceAll(records: SportsSessionRecord[]): Promise<void> {
    await repo.clear();
    await repo.putMany(records);
  },
};
