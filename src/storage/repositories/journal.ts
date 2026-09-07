import type { DateKey } from '../../core/dates';
import type {
  PausePeriodRecord,
  RestDayRecord,
  TombstoneUnlockRecord,
} from '../../core/model';
import { STORES } from '../db';
import { createRepository } from './base';

const restDays = createRepository<RestDayRecord>(STORES.restDays);
const pauses = createRepository<PausePeriodRecord>(STORES.pausePeriods);
const tombstones = createRepository<TombstoneUnlockRecord>(STORES.tombstones);

/**
 * Rest days (D42), pause periods (D43) and tombstone unlocks (D38).
 *
 * All three are the same kind of fact: something the user declared about a
 * date, which the replay reads and which nothing derives. A rest day is why a
 * gap is not absence; a pause is why a fortnight away is not a collapse; an
 * unlock is the day an achievement was first reached, and it is stored rather
 * than replayed precisely because "when did this first happen" must not move
 * when the rule that awarded it is tuned.
 */
export const restDaysRepository = {
  getAll: () => restDays.getAll(),
  listByDate: (date: DateKey) => restDays.queryIndex('by_date', date),

  async listByDateRange(from: DateKey, to: DateKey): Promise<RestDayRecord[]> {
    if (to < from) return [];
    return restDays.queryIndex('by_date', IDBKeyRange.bound(from, to));
  },

  put: (record: RestDayRecord) => restDays.put(record),
  remove: (id: string) => restDays.remove(id),

  replaceAll: async (records: RestDayRecord[]) => {
    await restDays.clear();
    await restDays.putMany(records);
  },
};

export const pausePeriodsRepository = {
  getAll: () => pauses.getAll(),

  /** Every pause that overlaps the range, including one still open-ended. */
  async listOverlapping(from: DateKey, to: DateKey): Promise<PausePeriodRecord[]> {
    const all = await pauses.getAll();
    return all.filter((pause) => pause.from <= to && (pause.to === null || pause.to >= from));
  },

  put: (record: PausePeriodRecord) => pauses.put(record),
  remove: (id: string) => pauses.remove(id),

  replaceAll: async (records: PausePeriodRecord[]) => {
    await pauses.clear();
    await pauses.putMany(records);
  },
};

export const tombstonesRepository = {
  getAll: () => tombstones.getAll(),
  get: (id: string) => tombstones.get(id),
  put: (record: TombstoneUnlockRecord) => tombstones.put(record),

  replaceAll: async (records: TombstoneUnlockRecord[]) => {
    await tombstones.clear();
    await tombstones.putMany(records);
  },
};
