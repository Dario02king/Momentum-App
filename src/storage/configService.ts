import { today } from '../core/clock';
import { buildConfigSnapshot, configSnapshotsEqual } from '../core/config/snapshot';
import type { DateKey } from '../core/dates';
import type { AppConfigSnapshot, ConfigSnapshotRecord } from '../core/model';
import { configSnapshotsRepository, domainsRepository, questionsRepository } from './repositories';

/**
 * Keeps the configuration log honest.
 *
 * Every write of an answer or a session references the snapshot in force at
 * the time, and every configuration change appends a new snapshot — but only
 * if something scoring-relevant actually changed.
 */

export async function currentConfigSnapshot(): Promise<AppConfigSnapshot> {
  const [domains, questions] = await Promise.all([
    domainsRepository.list(),
    questionsRepository.list(),
  ]);
  return buildConfigSnapshot(domains, questions);
}

/**
 * Returns the snapshot record that new entries should reference, appending one
 * first if configuration has drifted from the last recorded state.
 */
export async function ensureCurrentSnapshot(
  effectiveFrom: DateKey = today(),
): Promise<ConfigSnapshotRecord> {
  const [config, latest] = await Promise.all([
    currentConfigSnapshot(),
    configSnapshotsRepository.latest(),
  ]);
  if (latest && configSnapshotsEqual(latest.config, config)) return latest;
  return configSnapshotsRepository.append(config, effectiveFrom);
}

/** The configuration a past day must be scored against. */
export async function configForDate(date: DateKey): Promise<AppConfigSnapshot | undefined> {
  const record = await configSnapshotsRepository.resolveForDate(date);
  return record?.config;
}
