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
 * Rest days, pause periods and tombstone unlocks.
 *
 * All three are the same *kind* of fact — something the user declared about a
 * date, stored rather than derived — but only one of them is currently read
 * by anything, and the difference matters more than the similarity:
 *
 * - **Pause periods are live** (D116). `loadHistory` reads them once per
 *   replay and every consumer takes the answer from there; a pause is why a
 *   fortnight away is not a collapse.
 * - **Rest days are deprecated** (D115). Nothing writes one and nothing reads
 *   one. The store stays so that backups keep round tripping, and for no
 *   other reason.
 * - **Tombstone unlocks are not implemented yet.** The benchmark values are
 *   an open product decision, so nothing writes these either. When they
 *   arrive, "when did this first happen" is stored rather than replayed
 *   precisely because it must not move when the rule that awarded it is
 *   tuned.
 *
 * An earlier version of this comment said all three were read by the replay.
 * None of them was.
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
