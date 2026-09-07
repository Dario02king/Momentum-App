import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { closeDatabase, deleteDatabase } from '../db';
import {
  domainsRepository,
  gymSessionsRepository,
  runsRepository,
  settingsRepository,
  sportsSessionsRepository,
} from '../repositories';
import { importBackup } from './backupService';
import { applyLegacySportChoice, legacySportPrompt } from './legacySportService';
import { loadProgression } from './ratingService';

/**
 * The one-time question about RC2's Sport sessions, end to end.
 *
 * Everything here is really one assertion in three shapes: whichever branch
 * the user picks, and whether they pick at all, **the past does not move**.
 */

const synthetic = readFileSync(
  new URL('../../../.github/fixtures/rc2-synthetic.json', import.meta.url),
  'utf8',
);

async function seed(): Promise<void> {
  const result = await importBackup(synthetic);
  if (!result.ok) throw new Error(result.details.join('; '));
  // The import replaces every store, so the pending marker is set here, the
  // way the migration would set it on a device that carried the data.
  await settingsRepository.update({ legacySportMigration: 'pending' });
}

/** The numbers as they stand before the user is asked anything. */
async function snapshotNumbers() {
  const progression = await loadProgression();
  return {
    current: progression.current,
    peak: progression.peak,
    rank: progression.rank.id,
    peakRank: progression.peakRank.id,
    lifetimeXp: progression.lifetimeXp,
    changes: progression.changes.length,
    weeksMet: progression.history.weeks.filter((week) => week.met).length,
    overall: progression.history.overall,
  };
}

beforeEach(async () => {
  await deleteDatabase();
  setClock({ now: () => new Date(2026, 8, 1, 9, 0, 0) });
  await seed();
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

describe('being asked', () => {
  it('states what the answer would apply to, without applying anything', async () => {
    const prompt = await legacySportPrompt();
    expect(prompt.needed).toBe(true);
    expect(prompt.sessions).toBe(46);
    expect(prompt.targetPerWeek).toBe(3);
    expect(prompt.firstDate).toBe('2026-05-04');
    // Nothing has happened yet.
    expect(await gymSessionsRepository.getAll()).toHaveLength(0);
    expect(await runsRepository.getAll()).toHaveLength(0);
  });

  it('stops asking once answered', async () => {
    await applyLegacySportChoice('kept');
    expect((await legacySportPrompt()).needed).toBe(false);
  });

  it('never asks a profile that has no legacy data', async () => {
    await settingsRepository.update({ legacySportMigration: 'none' });
    expect((await legacySportPrompt()).needed).toBe(false);
  });
});

describe('whichever branch is chosen', () => {
  for (const choice of ['gym', 'running', 'kept'] as const) {
    it(`leaves every past number untouched: ${choice}`, async () => {
      const before = await snapshotNumbers();
      await applyLegacySportChoice(choice);
      const after = await snapshotNumbers();
      expect(after).toEqual(before);
    });

    it(`keeps the legacy sessions themselves: ${choice}`, async () => {
      // Past days resolve to snapshots in which Sport is the enabled weekly
      // domain. Deleting the rows those days count would turn fourteen met
      // weeks into fourteen empty ones.
      await applyLegacySportChoice(choice);
      expect(await sportsSessionsRepository.getAll()).toHaveLength(46);
    });
  }
});

describe('converting to gym', () => {
  beforeEach(async () => {
    await applyLegacySportChoice('gym');
  });

  it('carries every session over, marked as carried over', async () => {
    const sessions = await gymSessionsRepository.getAll();
    expect(sessions).toHaveLength(46);
    expect(sessions.every((session) => session.legacyCarryOver)).toBe(true);
    expect(await runsRepository.getAll()).toHaveLength(0);
  });

  it('moves the weekly target the user themselves set', async () => {
    const gym = await domainsRepository.findByType('gym');
    expect(gym?.enabled).toBe(true);
    expect(gym?.type === 'gym' && gym.settings.targetPerWeek).toBe(3);
  });

  it('retires the generic Sport domain from today, not retroactively', async () => {
    const sports = await domainsRepository.findByType('sports');
    expect(sports?.enabled).toBe(false);
    // Every week already lived keeps the target it was scored against.
    const progression = await loadProgression();
    expect(progression.history.weeks.filter((week) => week.met)).toHaveLength(14);
  });

  it('records the answer so it is never asked again', async () => {
    expect((await settingsRepository.getOrCreate()).legacySportMigration).toBe('gym');
  });

  it('cannot produce a second copy if it somehow runs twice', async () => {
    await applyLegacySportChoice('gym');
    expect(await gymSessionsRepository.getAll()).toHaveLength(46);
  });
});

describe('converting to running', () => {
  beforeEach(async () => {
    await applyLegacySportChoice('running');
  });

  it('invents no distance, elevation or step count', async () => {
    const runs = await runsRepository.getAll();
    expect(runs).toHaveLength(46);
    expect(runs.every((run) => run.distanceMetres === null)).toBe(true);
    expect(runs.every((run) => run.elevationMetres === null)).toBe(true);
    expect(runs.every((run) => run.steps === null)).toBe(true);
  });

  it('carries a duration only for the sessions that had one', async () => {
    const runs = await runsRepository.getAll();
    const timed = runs.filter((run) => run.durationSeconds !== null);
    // The fixture records a duration on Saturdays alone.
    expect(timed).toHaveLength(15);
    expect(timed.every((run) => run.durationSeconds === 45 * 60)).toBe(true);
  });

  it('enables Running with the inherited target and retires Sport', async () => {
    const running = await domainsRepository.findByType('running');
    expect(running?.enabled).toBe(true);
    expect(running?.type === 'running' && running.settings.targetPerWeek).toBe(3);
    expect((await domainsRepository.findByType('sports'))?.enabled).toBe(false);
  });
});

describe('keeping the log as it is', () => {
  it('creates nothing and disables nothing', async () => {
    await applyLegacySportChoice('kept');
    expect(await gymSessionsRepository.getAll()).toHaveLength(0);
    expect(await runsRepository.getAll()).toHaveLength(0);
    expect((await domainsRepository.findByType('sports'))?.enabled).toBe(true);
    expect((await domainsRepository.findByType('gym'))).toBeUndefined();
  });
});
