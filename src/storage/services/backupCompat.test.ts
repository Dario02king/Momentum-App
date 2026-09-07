import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { BACKUP_FORMAT_VERSION } from '../../core/backup/format';
import { SCHEMA_VERSION } from '../../core/model';
import { closeDatabase, deleteDatabase } from '../db';
import {
  gymSessionsRepository,
  profileRepository,
  runsRepository,
  weightEntriesRepository,
} from '../repositories';
import { exportBackup, importBackup, inspectBackup } from './backupService';
import { applyLegacySportChoice } from './legacySportService';
import { loadProgression } from './ratingService';

/**
 * Backup compatibility across the format change.
 *
 * A user's backup is the only copy of their history that survives losing the
 * device, and they will be holding one written before this update. The rule
 * is one-directional and simple: **an older file always imports**; a newer
 * one is refused rather than guessed at.
 */

const v1File = readFileSync(
  new URL('../../../.github/fixtures/rc2-synthetic.json', import.meta.url),
  'utf8',
);

beforeEach(async () => {
  await deleteDatabase();
  setClock({ now: () => new Date(2026, 8, 1, 9, 0, 0) });
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

describe('a backup written before the update', () => {
  it('says version 1 and is accepted anyway', () => {
    const parsed = JSON.parse(v1File);
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.schemaVersion).toBe(1);
    const result = inspectBackup(v1File);
    expect(result.ok).toBe(true);
  });

  it('restores the whole profile, with the new areas simply not started', async () => {
    const result = await importBackup(v1File);
    expect(result.ok).toBe(true);
    const progression = await loadProgression();
    expect(progression.rank.id).toBe('master');
    expect(progression.lifetimeXp).toBe(4640);
    expect(await gymSessionsRepository.getAll()).toHaveLength(0);
    expect(await runsRepository.getAll()).toHaveLength(0);
    expect(await profileRepository.get()).toBeUndefined();
  });

  it('restores the same numbers a fresh export then reproduces', async () => {
    await importBackup(v1File);
    const before = await loadProgression();
    const exported = await exportBackup();
    expect(exported.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(exported.schemaVersion).toBe(SCHEMA_VERSION);

    await importBackup(`${JSON.stringify(exported)}`);
    const after = await loadProgression();
    expect(after.current).toBeCloseTo(before.current, 10);
    expect(after.rank.id).toBe(before.rank.id);
    expect(after.lifetimeXp).toBe(before.lifetimeXp);
  });
});

describe('a version 2 backup', () => {
  it('carries the new areas through a round trip', async () => {
    await importBackup(v1File);
    await applyLegacySportChoice('running');
    await weightEntriesRepository.put({
      id: 'w1',
      date: '2026-08-30',
      kg: 78.4,
      createdAt: '2026-08-30T07:00:00.000Z',
      updatedAt: '2026-08-30T07:00:00.000Z',
    });
    await profileRepository.update({ heightCm: 181, goal: 'cut' });

    const exported = await exportBackup();
    expect(exported.data.runs).toHaveLength(46);
    expect(exported.data.weightEntries).toHaveLength(1);
    expect(exported.data.profile?.heightCm).toBe(181);

    await deleteDatabase();
    const result = await importBackup(JSON.stringify(exported));
    expect(result.ok).toBe(true);
    expect(await runsRepository.getAll()).toHaveLength(46);
    expect((await weightEntriesRepository.getAll())[0]?.kg).toBe(78.4);
    expect((await profileRepository.get())?.goal).toBe('cut');
  });

  it('counts every training log in the summary, not only the legacy one', async () => {
    await importBackup(v1File);
    await applyLegacySportChoice('gym');
    const exported = await exportBackup();
    const result = inspectBackup(JSON.stringify(exported));
    if (!result.ok) throw new Error(result.details.join('; '));
    // 46 legacy sessions, kept, plus the 46 gym sessions carried from them.
    expect(result.summary.sessions).toBe(92);
  });
});

describe('a backup from a newer version', () => {
  it('is refused rather than partly understood', () => {
    const parsed = JSON.parse(v1File);
    parsed.formatVersion = BACKUP_FORMAT_VERSION + 1;
    const result = inspectBackup(JSON.stringify(parsed));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toBe('newerFormat');
  });

  it('leaves the existing profile alone when it is refused', async () => {
    await importBackup(v1File);
    const before = await loadProgression();
    const parsed = JSON.parse(v1File);
    parsed.schemaVersion = SCHEMA_VERSION + 1;
    const result = await importBackup(JSON.stringify(parsed));
    expect(result.ok).toBe(false);
    expect((await loadProgression()).current).toBeCloseTo(before.current, 10);
  });
});
