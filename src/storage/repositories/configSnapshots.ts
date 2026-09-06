import { nowIso, today } from '../../core/clock';
import type { DateKey } from '../../core/dates';
import { createId } from '../../core/ids';
import type { AppConfigSnapshot, ConfigSnapshotRecord } from '../../core/model';
import { STORES } from '../db';
import { createRepository } from './base';

const repo = createRepository<ConfigSnapshotRecord>(STORES.configSnapshots);

function byEffectiveFrom(a: ConfigSnapshotRecord, b: ConfigSnapshotRecord): number {
  return a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt);
}

export const configSnapshotsRepository = {
  async list(): Promise<ConfigSnapshotRecord[]> {
    return (await repo.getAll()).sort(byEffectiveFrom);
  },

  async get(id: string): Promise<ConfigSnapshotRecord | undefined> {
    return repo.get(id);
  },

  /**
   * The configuration a given day must be scored against (§18).
   *
   * Changing the sports target in April must not rewrite January, so history
   * is always read through the snapshot that was in force on the day itself —
   * the latest one effective on or before it.
   */
  async resolveForDate(date: DateKey): Promise<ConfigSnapshotRecord | undefined> {
    const all = await configSnapshotsRepository.list();
    let match: ConfigSnapshotRecord | undefined;
    for (const snapshot of all) {
      if (snapshot.effectiveFrom <= date) match = snapshot;
      else break;
    }
    // A day before the first snapshot can only be scored against the earliest
    // configuration we ever recorded.
    return match ?? all[0];
  },

  async latest(): Promise<ConfigSnapshotRecord | undefined> {
    const all = await configSnapshotsRepository.list();
    return all[all.length - 1];
  },

  /**
   * Appends a snapshot effective today. Called whenever scoring-relevant
   * configuration changes — questions, rhythms, sports target, enabled
   * domains. Two changes on the same day collapse into one snapshot, which
   * keeps the log proportional to real change rather than to tapping.
   */
  async append(config: AppConfigSnapshot, effectiveFrom: DateKey = today()): Promise<ConfigSnapshotRecord> {
    const existing = (await configSnapshotsRepository.list()).find(
      (snapshot) => snapshot.effectiveFrom === effectiveFrom,
    );
    const record: ConfigSnapshotRecord = {
      id: existing?.id ?? createId('cfg'),
      effectiveFrom,
      createdAt: existing?.createdAt ?? nowIso(),
      config,
    };
    await repo.put(record);
    return record;
  },

  async replaceAll(records: ConfigSnapshotRecord[]): Promise<void> {
    await repo.clear();
    await repo.putMany(records);
  },
};
