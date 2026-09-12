import 'fake-indexeddb/auto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { BACKUP_FORMAT_VERSION } from '../../core/backup/format';
import { SCHEMA_VERSION, type TombstoneId, type TombstoneUnlockRecord } from '../../core/model';
import { closeDatabase, deleteDatabase } from '../db';
import { tombstonesRepository } from '../repositories';
import { exportBackup, importBackup } from './backupService';

/**
 * Tombstones are dormant, and this file is what keeps them exactly that.
 *
 * Five ids, a store, a repository and a backup collection exist; no unlock
 * rule, no writer and no screen do (D95, D121). Stage 3 of the Overall-rank
 * update verified that state rather than changing it. These tests pin what
 * was verified: the ids cannot drift, a record that does exist still round
 * trips through storage and through a backup, an older file without the
 * collection still imports, and nothing outside storage reaches the store —
 * so a second Gym achievement system cannot appear without failing here.
 *
 * Nothing here unlocks anything. There is no rule to test.
 */

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

/** The five ids, exactly. A sixth, a renamed or a missing one fails to compile. */
const idsUnchanged: Equal<
  TombstoneId,
  'firstFullWeek' | 'thirtyDayStreak' | 'hundredSets' | 'firstPromotion' | 'fiftyKilometres'
> = true;

const SRC = fileURLToPath(new URL('../..', import.meta.url));

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

const records: TombstoneUnlockRecord[] = [
  { id: 'firstFullWeek', unlockedOn: '2026-03-08', createdAt: '2026-03-08T21:00:00.000Z' },
  { id: 'hundredSets', unlockedOn: '2026-05-10', createdAt: '2026-05-10T19:30:00.000Z' },
];

beforeEach(async () => {
  await deleteDatabase();
  setClock({ now: () => new Date(2026, 8, 12, 9, 0, 0) });
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

describe('the Tombstone ids', () => {
  it('are the five that exist, and no other', () => {
    expect(idsUnchanged).toBe(true);
  });
});

describe('a Tombstone record that exists', () => {
  it('round trips through the store exactly as written', async () => {
    for (const record of records) await tombstonesRepository.put(record);
    const stored = await tombstonesRepository.getAll();
    expect(stored.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...records].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(await tombstonesRepository.get('hundredSets')).toEqual(records[1]);
    expect(await tombstonesRepository.get('firstPromotion')).toBeUndefined();
  });

  it('is exported in the backup and comes back from it unchanged', async () => {
    for (const record of records) await tombstonesRepository.put(record);
    const backup = await exportBackup();
    expect(backup.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(backup.data.tombstones).toEqual(
      [...records].sort((a, b) => a.id.localeCompare(b.id)),
    );

    const text = JSON.stringify(backup);
    await deleteDatabase();
    const result = await importBackup(text);
    expect(result.ok).toBe(true);
    const restored = await tombstonesRepository.getAll();
    expect(restored.sort((a, b) => a.id.localeCompare(b.id))).toEqual(backup.data.tombstones);
  });

  it('is absent from an RC2 file, which still imports with an empty store', async () => {
    const rc2 = readFileSync(new URL('../../../.github/fixtures/rc2-export.json', import.meta.url), 'utf8');
    expect(JSON.parse(rc2).data.tombstones).toBeUndefined();
    const result = await importBackup(rc2);
    expect(result.ok).toBe(true);
    expect(await tombstonesRepository.getAll()).toEqual([]);
  });
});

describe('what does not exist', () => {
  const files = sourceFiles(SRC);
  const readers = files.filter((path) => /tombstonesRepository|TombstoneUnlockRecord|STORES\.tombstones/.test(readFileSync(path, 'utf8')));

  it('has no writer: nothing in the app unlocks a Tombstone', () => {
    const writers = files.filter((path) => /tombstonesRepository\.(put|replaceAll)/.test(readFileSync(path, 'utf8')));
    expect(writers.map((path) => path.slice(SRC.length))).toEqual([]);
  });

  it('has no screen: nothing outside storage and the backup format reaches the store', () => {
    const outside = readers
      .map((path) => path.slice(SRC.length))
      .filter((path) => !path.startsWith('storage/') && !path.startsWith('core/backup/') && path !== 'core/model/index.ts');
    expect(outside).toEqual([]);
  });

  it('needs no schema or format change to stay this way', () => {
    expect(SCHEMA_VERSION).toBe(5);
    expect(BACKUP_FORMAT_VERSION).toBe(3);
  });
});
