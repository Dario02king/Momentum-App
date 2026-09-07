import { nowIso } from '../../core/clock';
import { createId } from '../../core/ids';
import type { DomainRecord, DomainSettingsFor, StoredDomainType } from '../../core/model';
import { STORES } from '../db';
import { createRepository } from './base';

const repo = createRepository<DomainRecord>(STORES.domains);

function byOrder(a: DomainRecord, b: DomainRecord): number {
  return a.order - b.order;
}

export const domainsRepository = {
  async list(): Promise<DomainRecord[]> {
    return (await repo.getAll()).sort(byOrder);
  },

  async listEnabled(): Promise<DomainRecord[]> {
    return (await domainsRepository.list()).filter((domain) => domain.enabled);
  },

  async findByType(type: StoredDomainType): Promise<DomainRecord | undefined> {
    const matches = await repo.queryIndex('by_type', type);
    return matches[0];
  },

  /**
   * Domains are records, so enabling one is an insert — not a code change.
   * A version 3 food domain arrives through exactly this function.
   */
  async ensure<T extends StoredDomainType>(
    type: T,
    order: number,
    settings: DomainSettingsFor<T>,
  ): Promise<DomainRecord> {
    const existing = await domainsRepository.findByType(type);
    if (existing) return existing;
    const stamp = nowIso();
    const record = {
      id: createId('dom'),
      type,
      enabled: true,
      order,
      settings,
      createdAt: stamp,
      updatedAt: stamp,
    } as DomainRecord;
    await repo.put(record);
    return record;
  },

  /**
   * Changing domain settings is scoring-relevant: callers must append a config
   * snapshot afterwards so past weeks keep being judged by the old target.
   */
  async updateSettings<T extends StoredDomainType>(
    id: string,
    settings: DomainSettingsFor<T>,
  ): Promise<DomainRecord | undefined> {
    const domain = await repo.get(id);
    if (!domain) return undefined;
    const next = { ...domain, settings, updatedAt: nowIso() } as DomainRecord;
    await repo.put(next);
    return next;
  },

  async setEnabled(id: string, enabled: boolean): Promise<DomainRecord | undefined> {
    const domain = await repo.get(id);
    if (!domain) return undefined;
    const next: DomainRecord = { ...domain, enabled, updatedAt: nowIso() };
    await repo.put(next);
    return next;
  },

  async replaceAll(records: DomainRecord[]): Promise<void> {
    await repo.clear();
    await repo.putMany(records);
  },
};
