import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { BACKUP_FORMAT_VERSION } from '../../core/backup/format';
import { addDays } from '../../core/dates';
import { SCHEMA_VERSION } from '../../core/model';
import { closeDatabase, deleteDatabase } from '../db';
import { answersRepository, questionsRepository, settingsRepository } from '../repositories';
import {
  addQuestion,
  applyOnboarding,
  archiveQuestion,
  loadConfiguration,
  setSportsTarget,
} from './configurationService';
import { logSession, saveAnswer } from './checkInService';
import { loadHistory } from './historyService';
import { loadProgression } from './ratingService';
import { exportBackup, exportBackupFile, importBackup, inspectBackup } from './backupService';

function freezeAt(day: string, hour = 9): void {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  setClock({ now: () => new Date(y, m - 1, d, hour, 0, 0) });
}

const ORIGIN = '2025-01-06'; // a Monday

beforeEach(async () => {
  await deleteDatabase();
  freezeAt(ORIGIN);
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

const text = async () => JSON.stringify(await exportBackup());

/** Wipes the profile the way a new device or cleared browser would. */
async function wipe() {
  await deleteDatabase();
}

async function recordDays(count: number, from = ORIGIN) {
  const questions = await questionsRepository.listActive();
  for (let index = 0; index < count; index += 1) {
    const date = addDays(from, index);
    freezeAt(date);
    for (const question of questions) {
      await saveAnswer(date, question.id, question.type === 'scale' ? 8 : true);
    }
    if (index % 3 === 0) await logSession(date).catch(() => undefined);
  }
}

describe('the exported file', () => {
  it('is named for the day and is readable JSON', async () => {
    await applyOnboarding({ questions: [{ text: 'A', type: 'boolean' }], sportsTargetPerWeek: 3 });
    const file = await exportBackupFile();
    expect(file.fileName).toBe('momentum-backup-2025-01-06.json');
    expect(() => JSON.parse(file.contents)).not.toThrow();
    expect(file.contents.endsWith('\n')).toBe(true);
  });

  it('states both versions it depends on', async () => {
    await applyOnboarding({ questions: [], sportsTargetPerWeek: null });
    const backup = await exportBackup();
    expect(backup.format).toBe('momentum-backup');
    expect(backup.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('carries source data and no derived values', async () => {
    await applyOnboarding({ questions: [{ text: 'A', type: 'boolean' }], sportsTargetPerWeek: 2 });
    await recordDays(5);
    const backup = await exportBackup();
    expect(Object.keys(backup.data).sort()).toEqual([
      'answers',
      'configSnapshots',
      'domains',
      'questions',
      'rankEvents',
      'settings',
      'sportsSessions',
    ]);
    // Ratings, ranks, streaks and scores are replayed, never stored.
    expect(JSON.stringify(backup.data)).not.toContain('"rating"');
    expect(JSON.stringify(backup.data)).not.toContain('"lifetimeXp"');
  });
});

describe('round trips', () => {
  async function roundTrip() {
    const before = await text();
    await wipe();
    const result = await importBackup(before);
    expect(result.ok).toBe(true);
    const after = await text();
    return { before, after };
  }

  it('restores an empty, freshly onboarded profile', async () => {
    await applyOnboarding({ questions: [], sportsTargetPerWeek: null });
    const { before, after } = await roundTrip();
    expect(JSON.parse(after).data).toEqual(JSON.parse(before).data);
  });

  it('restores a Mental-only profile', async () => {
    await applyOnboarding({
      questions: [
        { text: 'A', type: 'boolean' },
        { text: 'B', type: 'scale' },
      ],
      sportsTargetPerWeek: null,
    });
    await recordDays(10);
    const { before, after } = await roundTrip();
    expect(JSON.parse(after).data).toEqual(JSON.parse(before).data);
  });

  it('restores a Sports-only profile', async () => {
    await applyOnboarding({ questions: [], sportsTargetPerWeek: 4 });
    for (const offset of [0, 2, 4, 8, 9]) {
      freezeAt(addDays(ORIGIN, offset));
      await logSession(addDays(ORIGIN, offset));
    }
    const { before, after } = await roundTrip();
    expect(JSON.parse(after).data).toEqual(JSON.parse(before).data);
  });

  it('restores a long-running mixed profile', async () => {
    await applyOnboarding({
      questions: [
        { text: 'A', type: 'boolean' },
        { text: 'B', type: 'scale' },
      ],
      sportsTargetPerWeek: 3,
    });
    await recordDays(60);
    const { before, after } = await roundTrip();
    expect(JSON.parse(after).data).toEqual(JSON.parse(before).data);
  });

  it('restores archived questions and changed targets', async () => {
    await applyOnboarding({
      questions: [{ text: 'A', type: 'boolean' }],
      sportsTargetPerWeek: 2,
    });
    await recordDays(6);
    freezeAt(addDays(ORIGIN, 10));
    const added = await addQuestion({ text: 'B', type: 'scale' });
    await setSportsTarget(5);
    freezeAt(addDays(ORIGIN, 14));
    await archiveQuestion(added.id);

    const { before, after } = await roundTrip();
    expect(JSON.parse(after).data).toEqual(JSON.parse(before).data);

    const configuration = await loadConfiguration();
    expect(configuration.questions.some((question) => question.status === 'archived')).toBe(true);
    expect(configuration.sports?.type === 'sports' && configuration.sports.settings.targetPerWeek)
      .toBe(5);
  });

  it('exporting twice around an import gives the same file', async () => {
    await applyOnboarding({ questions: [{ text: 'A', type: 'boolean' }], sportsTargetPerWeek: 3 });
    await recordDays(20);
    const first = await exportBackup();
    await wipe();
    await importBackup(JSON.stringify(first));
    const second = await exportBackup();
    // The envelope carries the moment of export; the data must not differ.
    expect(second.data).toEqual(first.data);
  });
});

describe('historical integrity survives a restore', () => {
  it('replays exactly the same ratings after export, wipe and import', async () => {
    await applyOnboarding({
      questions: [
        { text: 'A', type: 'boolean' },
        { text: 'B', type: 'scale' },
      ],
      sportsTargetPerWeek: 3,
    });
    await recordDays(45);
    freezeAt(addDays(ORIGIN, 50));

    const before = await loadProgression();
    const beforeHistory = await loadHistory(ORIGIN, addDays(ORIGIN, 49));
    const file = await text();

    await wipe();
    freezeAt(addDays(ORIGIN, 50));
    await importBackup(file);

    const after = await loadProgression();
    const afterHistory = await loadHistory(ORIGIN, addDays(ORIGIN, 49));

    expect(after.points.map((point) => point.rating)).toEqual(
      before.points.map((point) => point.rating),
    );
    expect(after.current).toBe(before.current);
    expect(after.peak).toBe(before.peak);
    expect(after.lifetimeXp).toBe(before.lifetimeXp);
    expect(after.rank.id).toBe(before.rank.id);
    expect(after.peakRank.id).toBe(before.peakRank.id);
    expect(after.checkInStreak).toEqual(before.checkInStreak);
    expect(afterHistory.overall).toEqual(beforeHistory.overall);
  });
});

describe('a bad file changes nothing', () => {
  async function existingProfile() {
    await applyOnboarding({ questions: [{ text: 'A', type: 'boolean' }], sportsTargetPerWeek: 3 });
    await recordDays(5);
    return text();
  }

  async function expectUnchanged(before: string, attempt: string) {
    const result = await importBackup(attempt);
    expect(result.ok).toBe(false);
    expect(await text()).toBe(before);
  }

  it('rejects text that is not JSON', async () => {
    const before = await existingProfile();
    expect(inspectBackup('not a backup').ok).toBe(false);
    await expectUnchanged(before, 'not a backup');
  });

  it('rejects JSON that is not a Momentum backup', async () => {
    const before = await existingProfile();
    await expectUnchanged(before, JSON.stringify({ hello: 'world' }));
  });

  it('rejects a backup with missing sections', async () => {
    const before = await existingProfile();
    const broken = JSON.parse(before);
    delete broken.data.questions;
    await expectUnchanged(before, JSON.stringify(broken));
  });

  it('rejects records with missing fields', async () => {
    const before = await existingProfile();
    const broken = JSON.parse(before);
    delete broken.data.answers[0].date;
    await expectUnchanged(before, JSON.stringify(broken));
  });

  it('rejects a backup from a newer app', async () => {
    const before = await existingProfile();
    const future = JSON.parse(before);
    future.formatVersion = BACKUP_FORMAT_VERSION + 1;
    const result = inspectBackup(JSON.stringify(future));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toBe('newerFormat');
    await expectUnchanged(before, JSON.stringify(future));
  });

  it('rejects data from a newer schema', async () => {
    const before = await existingProfile();
    const future = JSON.parse(before);
    future.schemaVersion = SCHEMA_VERSION + 1;
    const result = inspectBackup(JSON.stringify(future));
    if (!result.ok) expect(result.problem).toBe('newerSchema');
    await expectUnchanged(before, JSON.stringify(future));
  });

  it('rejects a file whose answers point at missing questions', async () => {
    const before = await existingProfile();
    const broken = JSON.parse(before);
    broken.data.questions = [];
    await expectUnchanged(before, JSON.stringify(broken));
  });

  it('rejects duplicated records', async () => {
    const before = await existingProfile();
    const broken = JSON.parse(before);
    broken.data.answers.push(broken.data.answers[0]);
    await expectUnchanged(before, JSON.stringify(broken));
  });

  it('reports every problem it found, not only the first', async () => {
    const before = await existingProfile();
    const broken = JSON.parse(before);
    delete broken.data.answers[0].date;
    delete broken.data.questions[0].text;
    const result = inspectBackup(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.details.length).toBeGreaterThan(1);
    await expectUnchanged(before, JSON.stringify(broken));
  });
});

describe('importing over an existing profile', () => {
  it('replaces rather than merges', async () => {
    await applyOnboarding({ questions: [{ text: 'Alt', type: 'boolean' }], sportsTargetPerWeek: 3 });
    await recordDays(4);
    const saved = await text();

    await wipe();
    freezeAt(addDays(ORIGIN, 30));
    await applyOnboarding({ questions: [{ text: 'Neu', type: 'scale' }], sportsTargetPerWeek: 6 });
    await recordDays(3, addDays(ORIGIN, 30));

    await importBackup(saved);
    const configuration = await loadConfiguration();
    // Nothing of the replaced profile survives.
    expect(configuration.questions.map((question) => question.text)).toEqual(['Alt']);
    expect(configuration.sports?.type === 'sports' && configuration.sports.settings.targetPerWeek)
      .toBe(3);
  });

  it('is idempotent when the same backup is imported twice', async () => {
    await applyOnboarding({ questions: [{ text: 'A', type: 'boolean' }], sportsTargetPerWeek: 3 });
    await recordDays(8);
    const saved = await text();

    await importBackup(saved);
    const once = await text();
    await importBackup(saved);
    const twice = await text();

    expect(twice).toBe(once);
    expect(JSON.parse(twice).data).toEqual(JSON.parse(saved).data);
    // No duplicated rows from importing on top of itself.
    expect((await answersRepository.getAll()).length).toBe(JSON.parse(saved).data.answers.length);
  });

  it('restores the settings that were in the backup', async () => {
    await applyOnboarding({ questions: [{ text: 'A', type: 'boolean' }], sportsTargetPerWeek: null });
    await settingsRepository.setLanguage('en');
    const saved = await text();

    await wipe();
    await applyOnboarding({ questions: [], sportsTargetPerWeek: null });
    await settingsRepository.setLanguage('de');

    await importBackup(saved);
    const settings = await settingsRepository.get();
    expect(settings?.language).toBe('en');
    expect(settings?.firstUseDate).toBe(ORIGIN);
  });
});
