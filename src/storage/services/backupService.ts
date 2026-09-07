import { nowIso, today } from '../../core/clock';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  backupFileName,
  parseBackup,
  type BackupData,
  type BackupFile,
  type BackupSummary,
  type ValidationResult,
} from '../../core/backup/format';
import { SCHEMA_VERSION } from '../../core/model';
import { APP_VERSION } from '../../core/config/app';
import { STORES, replaceAllStores, type StoreName } from '../db';
import { createRepository } from '../repositories/base';
import type {
  AnswerRecord,
  ConfigSnapshotRecord,
  DomainRecord,
  QuestionRecord,
  RankEventRecord,
  SettingsRecord,
  SportsSessionRecord,
} from '../../core/model';

/**
 * Backup and restore (§19).
 *
 * Export writes canonical source data only; everything the app shows about
 * ranks, ratings, streaks and trends is replayed from it. Import validates
 * the whole file first and then replaces the profile in a single
 * transaction, so a rejected or failing restore leaves the existing profile
 * exactly as it was.
 */

const settingsStore = createRepository<SettingsRecord>(STORES.settings);
const domainStore = createRepository<DomainRecord>(STORES.domains);
const questionStore = createRepository<QuestionRecord>(STORES.questions);
const answerStore = createRepository<AnswerRecord>(STORES.answers);
const sessionStore = createRepository<SportsSessionRecord>(STORES.sportsSessions);
const snapshotStore = createRepository<ConfigSnapshotRecord>(STORES.configSnapshots);
const rankEventStore = createRepository<RankEventRecord>(STORES.rankEvents);

export async function collectBackupData(): Promise<BackupData> {
  const [settings, domains, questions, answers, sportsSessions, configSnapshots, rankEvents] =
    await Promise.all([
      settingsStore.getAll(),
      domainStore.getAll(),
      questionStore.getAll(),
      answerStore.getAll(),
      sessionStore.getAll(),
      snapshotStore.getAll(),
      rankEventStore.getAll(),
    ]);

  // Sorted so two exports of the same profile are byte-identical, which makes
  // "export, import, export again" comparable rather than merely equivalent.
  const byId = <T extends { id: string }>(records: T[]) =>
    [...records].sort((a, b) => a.id.localeCompare(b.id));

  return {
    settings: settings[0] ?? null,
    domains: byId(domains),
    questions: byId(questions),
    answers: byId(answers),
    sportsSessions: byId(sportsSessions),
    configSnapshots: byId(configSnapshots),
    rankEvents: byId(rankEvents),
  };
}

export async function exportBackup(): Promise<BackupFile> {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    app: { name: 'Momentum', version: APP_VERSION },
    data: await collectBackupData(),
  };
}

export interface ExportedFile {
  fileName: string;
  contents: string;
  summary: { questions: number; answers: number; sessions: number };
}

export async function exportBackupFile(): Promise<ExportedFile> {
  const backup = await exportBackup();
  return {
    fileName: backupFileName(today()),
    contents: `${JSON.stringify(backup, null, 2)}\n`,
    summary: {
      questions: backup.data.questions.length,
      answers: backup.data.answers.length,
      sessions: backup.data.sportsSessions.length,
    },
  };
}

/** Checks a file without touching storage, so the user can be asked first. */
export function inspectBackup(text: string): ValidationResult {
  return parseBackup(text);
}

/**
 * Replaces the whole profile with the backup's contents.
 *
 * Replacement, not merge: version 1 needs no conflict resolution, and
 * merging two histories would produce a profile that never existed, with
 * ratings that match neither. The caller confirms with the user first.
 */
export async function importBackup(
  text: string,
): Promise<{ ok: true; summary: BackupSummary } | { ok: false; details: string[] }> {
  const result = inspectBackup(text);
  if (!result.ok) return { ok: false, details: result.details };

  const { data } = result.backup;
  const contents: Partial<Record<StoreName, unknown[]>> = {
    [STORES.settings]: data.settings ? [{ ...data.settings, id: 'settings' }] : [],
    [STORES.domains]: data.domains,
    [STORES.questions]: data.questions,
    [STORES.answers]: data.answers,
    [STORES.sportsSessions]: data.sportsSessions,
    [STORES.configSnapshots]: data.configSnapshots,
    [STORES.rankEvents]: data.rankEvents,
  };

  // One transaction: either the profile is fully replaced or nothing changed.
  await replaceAllStores(contents);
  return { ok: true, summary: result.summary };
}
