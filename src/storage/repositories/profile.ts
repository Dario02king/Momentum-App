import { nowIso } from '../../core/clock';
import type { ProfileRecord } from '../../core/model';
import { STORES } from '../db';
import { createRepository } from './base';

const repo = createRepository<ProfileRecord>(STORES.profile);
const PROFILE_ID = 'profile';

/**
 * The local profile (D33).
 *
 * A singleton like settings, but a separate store on purpose: this is the
 * user's own data — age, height, goal — not an app preference, and the
 * distinction decides how it is treated by a backup and by a future export.
 * It never leaves the device.
 */
export const profileRepository = {
  async get(): Promise<ProfileRecord | undefined> {
    return repo.get(PROFILE_ID);
  },

  async getOrCreate(defaults: Partial<ProfileRecord> = {}): Promise<ProfileRecord> {
    const existing = await repo.get(PROFILE_ID);
    if (existing) return existing;
    const stamp = nowIso();
    const created: ProfileRecord = {
      id: PROFILE_ID,
      birthYear: null,
      sex: 'unspecified',
      activityLevel: 'moderate',
      workType: 'mixed',
      heightCm: null,
      sleepHours: null,
      healthNotes: null,
      goal: 'balanced',
      targetWeightKg: null,
      createdAt: stamp,
      updatedAt: stamp,
      ...defaults,
    };
    await repo.put(created);
    return created;
  },

  async update(patch: Partial<Omit<ProfileRecord, 'id' | 'createdAt'>>): Promise<ProfileRecord> {
    const current = await profileRepository.getOrCreate();
    const next: ProfileRecord = { ...current, ...patch, id: PROFILE_ID, updatedAt: nowIso() };
    await repo.put(next);
    return next;
  },

  async replaceAll(record: ProfileRecord | null): Promise<void> {
    await repo.clear();
    if (record) await repo.put({ ...record, id: PROFILE_ID });
  },
};
