import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { LEGACY_SPORT_CHOICES } from '../../core/migration/legacySport';
import { closeDatabase, deleteDatabase } from '../db';
import { settingsRepository } from '../repositories';
import { importBackup } from './backupService';
import { loadDay } from './checkInService';
import { applyOnboarding, loadConfiguration } from './configurationService';
import { applyLegacySportChoice } from './legacySportService';

/**
 * The one-time question, as the interface reaches it.
 *
 * `legacySport.test.ts` proves the conversion is correct. This proves it is
 * *reachable*: that a migrated profile is actually asked, that answering
 * stops the asking, and that a profile with no legacy data is never asked at
 * all. Before Phase 7 every one of these went unchecked, because nothing
 * outside `legacySportService.ts` called it — the conversion worked and no
 * user could ever trigger it.
 */

const synthetic = readFileSync(
  new URL('../../../.github/fixtures/rc2-synthetic.json', import.meta.url),
  'utf8',
);

async function seedMigrated(): Promise<void> {
  const result = await importBackup(synthetic);
  if (!result.ok) throw new Error(result.details.join('; '));
  await settingsRepository.update({ legacySportMigration: 'pending' });
}

beforeEach(async () => {
  await deleteDatabase();
  setClock({ now: () => new Date(2026, 8, 1, 9, 0, 0) });
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

describe('a migrated profile is actually asked', () => {
  beforeEach(seedMigrated);

  it('surfaces the outstanding question through the ordinary configuration load', async () => {
    const configuration = await loadConfiguration();
    expect(configuration.legacySportChoice.needed).toBe(true);
    expect(configuration.legacySportChoice.sessions).toBeGreaterThan(0);
    expect(configuration.legacySportChoice.firstDate).not.toBeNull();
    expect(configuration.legacySportChoice.lastDate).not.toBeNull();
  });

  it('flags it on the day view, so Today can point at it', async () => {
    const day = await loadDay();
    expect(day.legacySportChoicePending).toBe(true);
  });

  it.each(LEGACY_SPORT_CHOICES)('stops asking once answered: %s', async (choice) => {
    await applyLegacySportChoice(choice);

    const configuration = await loadConfiguration();
    expect(configuration.legacySportChoice.needed).toBe(false);
    expect(configuration.settings.legacySportMigration).toBe(choice);

    const day = await loadDay();
    expect(day.legacySportChoicePending).toBe(false);
  });

  it('answers nothing on its own — reloading the screen does not resolve it', async () => {
    // No default, no timeout, no "most likely" guess. A user who never
    // answers keeps a working app and is asked again next time.
    for (let visit = 0; visit < 5; visit += 1) {
      const configuration = await loadConfiguration();
      expect(configuration.legacySportChoice.needed).toBe(true);
      expect(configuration.settings.legacySportMigration).toBe('pending');
    }
  });
});

describe('a profile with no legacy data', () => {
  it('is never asked, and its day view says so', async () => {
    await applyOnboarding({ questions: [], gymTargetPerWeek: 3 });

    const configuration = await loadConfiguration();
    expect(configuration.legacySportChoice.needed).toBe(false);
    expect(configuration.legacySportChoice.sessions).toBe(0);
    expect(configuration.legacySport).toBeNull();

    const day = await loadDay();
    expect(day.legacySportChoicePending).toBe(false);
  });
});

describe('what the answer changes, from the interface’s side', () => {
  beforeEach(seedMigrated);

  it('moves the sessions into the log the user named', async () => {
    const before = await loadConfiguration();
    expect(before.domains.gym).toBeNull();

    await applyLegacySportChoice('gym');

    const after = await loadConfiguration();
    expect(after.domains.gym?.enabled).toBe(true);
    // The retired domain is switched off from today, never deleted.
    expect(after.legacySport).not.toBeNull();
    expect(after.legacySport?.enabled).toBe(false);

    const day = await loadDay();
    expect(day.training.some((entry) => entry.domain === 'gym')).toBe(true);
    expect(day.training.some((entry) => entry.domain === 'sports')).toBe(false);
  });

  it('leaves the retired log visible and enabled when the user keeps it', async () => {
    await applyLegacySportChoice('kept');

    const after = await loadConfiguration();
    expect(after.legacySport?.enabled).toBe(true);
    expect(after.domains.gym).toBeNull();
    expect(after.domains.running).toBeNull();

    const day = await loadDay();
    expect(day.training.some((entry) => entry.domain === 'sports')).toBe(true);
    // Kept is an answer, so the pointer goes even though the card stays.
    expect(day.legacySportChoicePending).toBe(false);
  });
});
