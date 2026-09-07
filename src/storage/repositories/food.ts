import type { DateKey } from '../../core/dates';
import type { FoodEntryRecord, WeightEntryRecord } from '../../core/model';
import { STORES } from '../db';
import { createRepository } from './base';

const entries = createRepository<FoodEntryRecord>(STORES.foodEntries);
const weights = createRepository<WeightEntryRecord>(STORES.weightEntries);

/**
 * Food entries and body weight.
 *
 * They share a file because they answer one question together: weight (D34)
 * is what the nutrition target is calculated *from*, so the two are read in
 * the same breath and it would be misleading to file weight elsewhere.
 *
 * The demo food list (D35) is deliberately not a store. It ships with the
 * app, so it is code rather than the user's data, and putting it in a store
 * would mean every backup carried a copy of our own sample content.
 */
export const foodEntriesRepository = {
  get: (id: string) => entries.get(id),
  getAll: () => entries.getAll(),
  listByDate: (date: DateKey) => entries.queryIndex('by_date', date),

  async listByDateRange(from: DateKey, to: DateKey): Promise<FoodEntryRecord[]> {
    if (to < from) return [];
    return entries.queryIndex('by_date', IDBKeyRange.bound(from, to));
  },

  put: (record: FoodEntryRecord) => entries.put(record),
  putMany: (records: FoodEntryRecord[]) => entries.putMany(records),
  remove: (id: string) => entries.remove(id),

  replaceAll: async (records: FoodEntryRecord[]) => {
    await entries.clear();
    await entries.putMany(records);
  },
};

export const weightEntriesRepository = {
  get: (id: string) => weights.get(id),

  async getAll(): Promise<WeightEntryRecord[]> {
    return (await weights.getAll()).sort((a, b) => a.date.localeCompare(b.date));
  },

  listByDate: (date: DateKey) => weights.queryIndex('by_date', date),

  async listByDateRange(from: DateKey, to: DateKey): Promise<WeightEntryRecord[]> {
    if (to < from) return [];
    return weights.queryIndex('by_date', IDBKeyRange.bound(from, to));
  },

  /** The most recent weight on or before a day — what a target is sized on. */
  async latestOnOrBefore(date: DateKey): Promise<WeightEntryRecord | undefined> {
    const all = await weightEntriesRepository.getAll();
    let match: WeightEntryRecord | undefined;
    for (const entry of all) {
      if (entry.date <= date) match = entry;
      else break;
    }
    return match;
  },

  put: (record: WeightEntryRecord) => weights.put(record),
  putMany: (records: WeightEntryRecord[]) => weights.putMany(records),
  remove: (id: string) => weights.remove(id),

  replaceAll: async (records: WeightEntryRecord[]) => {
    await weights.clear();
    await weights.putMany(records);
  },
};
