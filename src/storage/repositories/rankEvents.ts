import { nowIso } from '../../core/clock';
import type { DateKey } from '../../core/dates';
import { createId } from '../../core/ids';
import type { RankEventRecord } from '../../core/model';
import { STORES } from '../db';
import { createRepository } from './base';

const repo = createRepository<RankEventRecord>(STORES.rankEvents);

function byDate(a: RankEventRecord, b: RankEventRecord): number {
  return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
}

export const rankEventsRepository = {
  async list(): Promise<RankEventRecord[]> {
    return (await repo.getAll()).sort(byDate);
  },

  async latest(): Promise<RankEventRecord | undefined> {
    const all = await rankEventsRepository.list();
    return all[all.length - 1];
  },

  async listByDate(date: DateKey): Promise<RankEventRecord[]> {
    return (await repo.queryIndex('by_date', date)).sort(byDate);
  },

  async append(event: Omit<RankEventRecord, 'id' | 'createdAt'>): Promise<RankEventRecord> {
    const record: RankEventRecord = { ...event, id: createId('rank'), createdAt: nowIso() };
    await repo.put(record);
    return record;
  },

  /** A promotion reveal plays once; acknowledging it is what stops a replay. */
  async acknowledge(id: string): Promise<void> {
    const event = await repo.get(id);
    if (!event) return;
    await repo.put({ ...event, acknowledgedAt: nowIso() });
  },

  async replaceAll(records: RankEventRecord[]): Promise<void> {
    await repo.clear();
    await repo.putMany(records);
  },
};
