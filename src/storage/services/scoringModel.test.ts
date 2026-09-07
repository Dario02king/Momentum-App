import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { SCORING_MODEL } from '../../core/config/constants';
import { closeDatabase, deleteDatabase } from '../db';
import { currentConfigSnapshot, ensureCurrentSnapshot } from '../configService';
import { configSnapshotsRepository, settingsRepository } from '../repositories';
import { addQuestion, applyOnboarding } from './configurationService';
import { importBackup } from './backupService';
import { loadHistory } from './historyService';
import { loadProgression } from './ratingService';
import { loadBossProgression } from './bossService';
import { saveAnswer } from './checkInService';

/**
 * The scoring-model change, and the rule that governs it: **the arithmetic a
 * day was scored by is a fact about that day.**
 *
 * It is recorded in the config snapshot rather than inferred, so a day lived
 * in January is replayed by January's model however many times the model
 * changes afterwards. Everything below is one assertion in several shapes:
 * the past does not move.
 */

const synthetic = readFileSync(
  new URL('../../../.github/fixtures/rc2-synthetic.json', import.meta.url),
  'utf8',
);

function at(day: string, hour = 9): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, hour, 0, 0);
}

const LAST_LEGACY_DAY = '2026-08-31';

beforeEach(async () => {
  await deleteDatabase();
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

describe('the model is recorded, not inferred', () => {
  beforeEach(() => setClock({ now: () => at('2026-09-01') }));

  it('is written into every snapshot this build makes', async () => {
    await applyOnboarding({ questions: [{ text: 'A', type: 'scale', category: 'alltag' }] });
    const snapshot = await currentConfigSnapshot();
    expect(snapshot.scoring.model).toBe(SCORING_MODEL);
    expect(SCORING_MODEL).toBe('categoryMean');
  });

  it('carries the category each question was in when the snapshot was taken', async () => {
    await applyOnboarding({
      questions: [
        { text: 'A', type: 'scale', category: 'alltag' },
        { text: 'M', type: 'scale', category: 'mental' },
      ],
    });
    const snapshot = await currentConfigSnapshot();
    expect(snapshot.questions.map((question) => question.category).sort()).toEqual([
      'alltag',
      'mental',
    ]);
  });

  it('reads a snapshot with no model as flat, which is what those days were', async () => {
    const result = await importBackup(synthetic);
    expect(result.ok).toBe(true);
    const snapshots = await configSnapshotsRepository.list();
    // The RC2 export carries one snapshot and it names no model.
    expect(snapshots[0]?.config.scoring.model).toBeUndefined();
  });
});

describe('a profile that lived under the old model', () => {
  beforeEach(async () => {
    setClock({ now: () => at(LAST_LEGACY_DAY) });
    const result = await importBackup(synthetic);
    if (!result.ok) throw new Error(result.details.join('; '));
    await settingsRepository.update({ legacySportMigration: 'none' });
  });

  /** Every number the app derives, before and after the model changes. */
  async function snapshotNumbers() {
    const [progression, boss] = await Promise.all([loadProgression(), loadBossProgression()]);
    return {
      overall: progression.history.overall,
      mental: progression.history.mental,
      ratings: progression.points.map((point) => point.rating),
      rank: progression.rank.id,
      peakRank: progression.peakRank.id,
      lifetimeXp: progression.lifetimeXp,
      changes: progression.changes.length,
      boss: boss.points.map((point) => point.progress),
    };
  }

  it('keeps every historical day exactly as the old model scored it', async () => {
    const before = await snapshotNumbers();

    // The upgrade: the first configuration touch under the new build writes a
    // snapshot that names the new model, effective from that day.
    setClock({ now: () => at('2026-09-01') });
    await ensureCurrentSnapshot();

    const after = await snapshotNumbers();
    const days = before.overall.length;
    expect(after.overall.slice(0, days)).toEqual(before.overall);
    expect(after.mental.slice(0, days)).toEqual(before.mental);
    for (let index = 0; index < days; index += 1) {
      expect(after.ratings[index]).toBeCloseTo(before.ratings[index]!, 12);
      expect(after.boss[index]).toBeCloseTo(before.boss[index]!, 12);
    }
  });

  it('takes no rank, no peak and no XP away when the arithmetic changes', async () => {
    const before = await snapshotNumbers();
    setClock({ now: () => at('2026-09-01') });
    await ensureCurrentSnapshot();
    const after = await snapshotNumbers();
    expect(after.rank).toBe(before.rank);
    expect(after.peakRank).toBe(before.peakRank);
    expect(after.lifetimeXp).toBeGreaterThanOrEqual(before.lifetimeXp);
    expect(after.changes).toBe(before.changes);
  });

  it('scores the day after the change by the new model, and only from there', async () => {
    setClock({ now: () => at('2026-09-01') });
    await ensureCurrentSnapshot();
    const snapshots = await configSnapshotsRepository.list();
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.config.scoring.model).toBeUndefined();
    expect(snapshots[1]?.config.scoring.model).toBe('categoryMean');
    expect(snapshots[1]?.effectiveFrom).toBe('2026-09-01');
  });
});

describe('the change of arithmetic is not a jump', () => {
  /**
   * A profile with an unbalanced question set — four questions in one
   * category and one in another — is where the two models differ most, so it
   * is where a discontinuity would show if there were one.
   */
  beforeEach(async () => {
    setClock({ now: () => at('2026-03-01') });
    await applyOnboarding({
      questions: [
        { text: 'A1', type: 'scale', category: 'alltag' },
        { text: 'A2', type: 'scale', category: 'alltag' },
        { text: 'A3', type: 'scale', category: 'alltag' },
        { text: 'A4', type: 'scale', category: 'alltag' },
        { text: 'M1', type: 'scale', category: 'mental' },
      ],
    });
    // Force the whole history to have been lived under the flat model.
    const snapshots = await configSnapshotsRepository.list();
    const first = snapshots[0]!;
    await configSnapshotsRepository.replaceAll([
      {
        ...first,
        config: {
          ...first.config,
          scoring: { ...first.config.scoring, model: undefined },
        },
      },
    ]);
  });

  it('moves the rating by no more than one ordinary day on the day it changes', async () => {
    const questions = (await loadHistory('2026-03-01', '2026-03-01')).questions;
    // Ten days of answers under the flat model.
    for (let index = 0; index < 10; index += 1) {
      const date = `2026-03-${String(index + 1).padStart(2, '0')}`;
      setClock({ now: () => at(date) });
      for (const [position, question] of questions.entries()) {
        await saveAnswer(date, question.id, position === 4 ? 3 : 9, date);
      }
    }

    setClock({ now: () => at('2026-03-14') });
    const before = await loadProgression();
    const beforeRating = before.points[before.points.length - 1]!.rating;

    // The model changes today.
    await ensureCurrentSnapshot();
    const after = await loadProgression();

    // Every earlier day is untouched.
    for (let index = 0; index < before.points.length; index += 1) {
      expect(after.points[index]!.rating).toBeCloseTo(before.points[index]!.rating, 12);
    }
    // And today is a day, not a step: nothing was answered today, so the
    // rating cannot have moved on account of the arithmetic at all.
    expect(after.points[after.points.length - 1]!.rating).toBeCloseTo(beforeRating, 12);
    expect(after.rank.id).toBe(before.rank.id);
  });

  it('applies the new arithmetic to the first day scored under it', async () => {
    setClock({ now: () => at('2026-03-20') });
    await addQuestion({ text: 'Neu', type: 'scale', category: 'gesundheit' });
    const date = '2026-03-20';
    const day = (await loadHistory(date, date)).days[0]!;
    // Four Alltag, one Mental, one Gesundheit: three categories, not six
    // questions.
    expect(day.status).toBe('open');
    const snapshots = await configSnapshotsRepository.list();
    expect(snapshots[snapshots.length - 1]?.config.scoring.model).toBe('categoryMean');
  });
});
