import { nowIso } from '../../core/clock';
import type { DateKey } from '../../core/dates';
import {
  foodDayId,
  type FoodDayRecord,
  type FoodEntryRecord,
  type WeightEntryRecord,
} from '../../core/model';
import { STORES } from '../db';
import { createRepository } from './base';

const entries = createRepository<FoodEntryRecord>(STORES.foodEntries);
const days = createRepository<FoodDayRecord>(STORES.foodDays);
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
 *
 * The third store here is `foodDays`: the one 1–10 adherence rating per
 * calendar day. It is what Food is actually scored on, and it is kept apart
 * from the entries on purpose — an entry says what was eaten, a rating says
 * how the day went, and only the second is ever read by the scoring path.
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

export interface FoodDayWrite {
  date: DateKey;
  /** 1–10, exactly as the user chose it. */
  adherence: number;
  note: string | null;
  configSnapshotId: string;
}

export const foodDaysRepository = {
  get: (date: DateKey) => days.get(foodDayId(date)),

  async getAll(): Promise<FoodDayRecord[]> {
    return (await days.getAll()).sort((a, b) => a.date.localeCompare(b.date));
  },

  async listByDateRange(from: DateKey, to: DateKey): Promise<FoodDayRecord[]> {
    if (to < from) return [];
    return days.queryIndex('by_date', IDBKeyRange.bound(from, to));
  },

  /**
   * Writes the rating for one day.
   *
   * The id is the date, so a second rating for the same day replaces the
   * first rather than stacking: the day is rated once, and changing it
   * inside the edit window is a correction.
   */
  async save(input: FoodDayWrite): Promise<FoodDayRecord> {
    const id = foodDayId(input.date);
    const existing = await days.get(id);
    const stamp = nowIso();
    const record: FoodDayRecord = {
      id,
      date: input.date,
      adherence: input.adherence,
      note: input.note,
      // Food is one of the two domains a later social layer defaults to
      // private (D47). Nothing reads this yet.
      sensitivity: existing?.sensitivity ?? 'private',
      configSnapshotId: existing?.configSnapshotId ?? input.configSnapshotId,
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
    };
    await days.put(record);
    return record;
  },

  /** Clearing a rating returns the day to "not rated", never to a zero. */
  clear: (date: DateKey) => days.remove(foodDayId(date)),

  replaceAll: async (records: FoodDayRecord[]) => {
    await days.clear();
    await days.putMany(records);
  },
};
