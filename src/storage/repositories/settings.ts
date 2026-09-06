import { nowIso, today } from '../../core/clock';
import type { Language, SettingsRecord } from '../../core/model';
import { STORES } from '../db';
import { createRepository } from './base';

const repo = createRepository<SettingsRecord>(STORES.settings);
const SETTINGS_ID = 'settings';

export const settingsRepository = {
  async get(): Promise<SettingsRecord | undefined> {
    return repo.get(SETTINGS_ID);
  },

  /** Reads settings, creating the day-one record on first launch. */
  async getOrCreate(defaults: Partial<SettingsRecord> = {}): Promise<SettingsRecord> {
    const existing = await repo.get(SETTINGS_ID);
    if (existing) return existing;
    const stamp = nowIso();
    const created: SettingsRecord = {
      id: SETTINGS_ID,
      language: 'de',
      firstUseDate: today(),
      onboardingCompletedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
      ...defaults,
    };
    await repo.put(created);
    return created;
  },

  async update(patch: Partial<Omit<SettingsRecord, 'id' | 'createdAt'>>): Promise<SettingsRecord> {
    const current = await settingsRepository.getOrCreate();
    const next: SettingsRecord = { ...current, ...patch, id: SETTINGS_ID, updatedAt: nowIso() };
    await repo.put(next);
    return next;
  },

  async setLanguage(language: Language): Promise<SettingsRecord> {
    return settingsRepository.update({ language });
  },

  async completeOnboarding(): Promise<SettingsRecord> {
    return settingsRepository.update({ onboardingCompletedAt: nowIso() });
  },

  async replaceAll(record: SettingsRecord | null): Promise<void> {
    await repo.clear();
    if (record) await repo.put({ ...record, id: SETTINGS_ID });
  },
};
