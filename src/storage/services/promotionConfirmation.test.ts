import 'fake-indexeddb/auto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { addDays, type DateKey } from '../../core/dates';
import { confirmationIndicator, confirmedRankHistory, canonicalConfirmation } from '../../core/ranks/confirmation';
import { canonicalJson } from '../../testing/canonical';
import { closeDatabase, deleteDatabase } from '../db';
import { questionsRepository, settingsRepository } from '../repositories';
import { exportBackup, importBackup } from './backupService';
import { loadBossProgression, type BossProgression } from './bossService';
import { saveAnswer } from './checkInService';
import { applyOnboarding, loadConfiguration } from './configurationService';
import { BREAK_LAST, at as atHour, trainingBreakProfile } from './fixtures/profiles';
import { ensurePromotionConfirmation, reconcilePromotionConfirmation } from './promotionConfirmationService';

/**
 * Promotion confirmation through the real services (D126): activation,
 * persistence, replay, edits inside the window, backups, and the
 * continuity of everything the legacy rule had already awarded.
 */

function freezeAt(day: string, hour = 9): void {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  setClock({ now: () => new Date(y, m - 1, d, hour, 0, 0) });
}

const settingsJson = async () => JSON.stringify((await settingsRepository.get())!.promotionConfirmation);

/** The persisted shape, straight from the settings record. */
const persisted = async () => (await settingsRepository.get())!.promotionConfirmation!;

/** What the fold says about the loaded replay, recomputed from its inputs. */
function recomputed(boss: BossProgression, today: DateKey) {
  const walk = confirmedRankHistory(
    boss.points.map((point, index) => ({
      date: boss.history.days[index]!.date,
      rating: point.rating,
      scored: boss.history.days[index]!.status === 'scored',
      paused: boss.history.paused[index] === true,
    })),
    { from: boss.confirmation!.from, today },
  );
  return canonicalConfirmation(boss.confirmation!.from, walk.pending);
}

beforeEach(async () => {
  await deleteDatabase();
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

/* ── A Wellbeing-only profile climbing through two thresholds ────────────── */

const D0 = '2026-01-05'; // a Monday
const D = (index: number) => addDays(D0, index);

async function climbUntil(last: string, value: (day: string) => number): Promise<void> {
  const questions = await questionsRepository.list();
  for (let day = D0; day <= last; day = addDays(day, 1)) {
    freezeAt(day);
    for (const question of questions) await saveAnswer(day, question.id, value(day));
  }
}

/** 5 on the first day, 6 for five days, then 10 every day: crosses Elite on D8. */
const climb = (day: string) => (day === D0 ? 5 : day < D(6) ? 6 : 10);

describe('a profile climbing under the confirmation rule', () => {
  beforeEach(async () => {
    freezeAt(D0);
    await applyOnboarding({
      questions: [
        { text: 'A', type: 'scale', category: 'mental' },
        { text: 'B', type: 'scale', category: 'gesundheit' },
      ],
    });
    await loadConfiguration(); // activates: from = D1
  });

  it('activates prospectively, from the next local day, with nothing collected', async () => {
    expect(await persisted()).toEqual({ from: D(1), targetRankId: null, eligibleDates: [] });
    // Nothing answered yet: the Boss has not started, and the first replay
    // fills in the target without collecting anything.
    const boss = await loadBossProgression();
    expect(boss.rank.id).toBe('rookie');
    expect(boss.changes).toEqual([]);
    expect(boss.pending).toEqual({ targetRankId: 'challenger', eligibleDates: [], required: 7 });
    expect(await persisted()).toEqual({ from: D(1), targetRankId: 'challenger', eligibleDates: [] });
  });

  it('5, 6, 22, 23 — counts yesterday, never today, and promotes on the seventh', async () => {
    await climbUntil(D(8), climb);
    let boss = await loadBossProgression();
    // D8 is the first day at or above Elite: 0/7, shown, not counted.
    expect(boss.points[boss.points.length - 1]!.rating).toBeGreaterThanOrEqual(410);
    expect(boss.pending?.eligibleDates).toEqual([]);
    expect(confirmationIndicator(boss.points[boss.points.length - 1]!.rating, boss.pending)).toEqual({
      targetRankId: 'elite', count: 0, required: 7,
    });

    await climbUntil(D(9), climb);
    boss = await loadBossProgression();
    expect(boss.pending?.eligibleDates).toEqual([D(8)]);

    await climbUntil(D(14), climb);
    boss = await loadBossProgression();
    expect(boss.rank.id).toBe('contender');
    expect(boss.pending?.eligibleDates).toEqual([D(8), D(9), D(10), D(11), D(12), D(13)]);

    await climbUntil(D(15), climb);
    boss = await loadBossProgression();
    expect(boss.rank.id).toBe('elite');
    expect(boss.changes).toEqual([
      { date: D(14), kind: 'promotion', from: 'contender', to: 'elite', rating: boss.points[14]!.rating },
    ]);
    expect(boss.pending).toEqual({ targetRankId: 'veteran', eligibleDates: [], required: 7 });
    expect(await persisted()).toEqual({ from: D(1), targetRankId: 'veteran', eligibleDates: [] });
    expect(boss.peakRank.id).toBe('elite');
  });

  it('9–12 — persists byte-identical state across replays, saves and reloads', async () => {
    await climbUntil(D(11), climb);
    // The set is reconciled by the replay, so it is current after a load.
    await loadBossProgression();
    const first = await settingsJson();
    expect(JSON.parse(first).eligibleDates).toEqual([D(8), D(9), D(10)]);
    expect(Object.keys(JSON.parse(first))).toEqual(['from', 'targetRankId', 'eligibleDates']);

    await loadBossProgression();
    await loadBossProgression();
    expect(await settingsJson()).toBe(first);
    const { updatedAt } = (await settingsRepository.get())!;

    // The same answer saved again: same rows, same replay, no write.
    const questions = await questionsRepository.list();
    for (const question of questions) await saveAnswer(D(11), question.id, 10);
    const boss = await loadBossProgression();
    expect(await settingsJson()).toBe(first);
    expect((await settingsRepository.get())!.updatedAt).toBe(updatedAt);
    expect(await reconcilePromotionConfirmation(boss.confirmation!)).toBe('unchanged');

    // Closing and reopening the database changes nothing either.
    await closeDatabase();
    const again = await loadBossProgression();
    expect(canonicalJson(again.confirmation)).toBe(canonicalJson(boss.confirmation));
    expect(canonicalJson(again.changes)).toBe(canonicalJson(boss.changes));
  });

  it('14, 15 — an edit inside the window corrects the sequence from history, not from the edit', async () => {
    await climbUntil(D(11), climb); // D11 today: [D8, D9, D10]
    expect((await loadBossProgression()).pending?.eligibleDates).toEqual([D(8), D(9), D(10)]);

    // D8 is three days back, still editable. Both answers to 1.
    const questions = await questionsRepository.list();
    for (const question of questions) await saveAnswer(D(8), question.id, 1);
    let boss = await loadBossProgression();
    expect(boss.points[8]!.rating).toBeLessThan(410);
    expect(boss.pending?.eligibleDates).toEqual([D(9), D(10)]);
    expect(await persisted()).toEqual(recomputed(boss, D(11)));

    // And back up again: the sequence is rebuilt, not patched.
    for (const question of questions) await saveAnswer(D(8), question.id, 10);
    boss = await loadBossProgression();
    expect(boss.pending?.eligibleDates).toEqual([D(8), D(9), D(10)]);
    expect(await persisted()).toEqual(recomputed(boss, D(11)));
  });

  it('16 — editing the activation day replays it under the legacy rule', async () => {
    await climbUntil(D(3), climb);
    const questions = await questionsRepository.list();
    // D0 is the activation day and still editable on D3.
    for (const question of questions) await saveAnswer(D(0), question.id, 10);
    const boss = await loadBossProgression();
    // The prefix is one legacy point, whatever its rating now is; the new
    // era still begins on D1 and has collected nothing towards Elite.
    expect(boss.confirmation?.from).toBe(D(1));
    expect(boss.changes).toEqual([]);
    expect(boss.pending?.targetRankId).toBe('elite');
  });

  it('20 — a newer backup keeps its boundary and reconciles its dates from history', async () => {
    await climbUntil(D(11), climb);
    await loadBossProgression(); // the replay is what reconciles the set
    const exported = JSON.stringify(await exportBackup());
    expect(JSON.parse(exported).data.settings.promotionConfirmation).toEqual({
      from: D(1), targetRankId: 'elite', eligibleDates: [D(8), D(9), D(10)],
    });

    await deleteDatabase();
    freezeAt('2026-02-10');
    const result = await importBackup(exported);
    expect(result.ok).toBe(true);
    await loadConfiguration(); // must not reset the era
    expect((await persisted()).from).toBe(D(1));
    const boss = await loadBossProgression();
    expect(boss.confirmation?.from).toBe(D(1));
    expect(await persisted()).toEqual(boss.confirmation);
    expect(await persisted()).toEqual(recomputed(boss, '2026-02-10'));
    /*
     * The days after the export are silent: closed, scored as misses, and
     * the rating decays under the general cooling-off. It stayed above the
     * Elite threshold through the first seven of them — a scored day is a
     * real result, whatever it contains — so the confirmation completed on
     * the seventh and the target moved on to Veteran with an empty set.
     * Nothing was seeded from the import date, and the boundary did not
     * move: the promotion is dated inside the era the file carried.
     */
    expect(boss.changes.map((c) => [c.to, c.date])).toEqual([['elite', D(14)]]);
    expect(await persisted()).toEqual({ from: D(1), targetRankId: 'veteran', eligibleDates: [] });
  });
});

/* ── Existing users: the activation day is legacy, and nothing moves ─────── */

const ACTIVATION_DAY = '2026-07-03'; // a legacy promotion day in the training-break profile
const FIXTURE = new URL('../../../.github/fixtures/stage4/activation.json', import.meta.url);

const four = (boss: BossProgression) => ({
  rank: boss.rank.id,
  peakRank: boss.peakRank.id,
  lifetimeXp: boss.lifetimeXp,
  changes: boss.changes,
});

describe('activation on an existing profile', () => {
  it('17, 18, 13 — keeps the rank, the peak, the XP and the legacy history, promotion of the day included', async () => {
    freezeAt(ACTIVATION_DAY);
    const result = await importBackup(trainingBreakProfile());
    if (!result.ok) throw new Error(result.details.join('; '));

    const before = await loadBossProgression();
    expect(before.confirmation).toBeNull();
    expect(before.pending).toBeNull();
    expect(before.changes[before.changes.length - 1]).toMatchObject({ date: ACTIVATION_DAY, kind: 'promotion', to: 'master' });

    await ensurePromotionConfirmation();
    const after = await loadBossProgression();
    expect(four(after)).toEqual(four(before));
    expect(after.confirmation).toEqual({ from: '2026-07-04', targetRankId: 'champion', eligibleDates: [] });
    expect(after.pending).toEqual({ targetRankId: 'champion', eligibleDates: [], required: 7 });
    // The Boss series itself did not move.
    expect(canonicalJson(after.points)).toBe(canonicalJson(before.points));

    const record = {
      activationDay: ACTIVATION_DAY,
      from: after.confirmation!.from,
      before: four(before),
      after: four(after),
    };
    if (process.env.UPDATE_STAGE2_BASELINE) {
      writeFileSync(fileURLToPath(FIXTURE), canonicalJson(record));
      return;
    }
    if (!existsSync(fileURLToPath(FIXTURE))) throw new Error('No activation fixture; capture it first');
    expect(canonicalJson(record)).toBe(readFileSync(fileURLToPath(FIXTURE), 'utf8'));
  });

  it('does not move the boundary on later loads', async () => {
    freezeAt(ACTIVATION_DAY);
    await importBackup(trainingBreakProfile());
    await ensurePromotionConfirmation();
    freezeAt(addDays(ACTIVATION_DAY, 20));
    await loadConfiguration();
    expect((await persisted()).from).toBe('2026-07-04');
  });

  it('19 — an old backup without the field gets a fresh prospective boundary', async () => {
    const rc2 = readFileSync(new URL('../../../.github/fixtures/rc2-export.json', import.meta.url), 'utf8');
    freezeAt('2026-09-07');
    const result = await importBackup(rc2);
    expect(result.ok).toBe(true);
    expect((await settingsRepository.get())!.promotionConfirmation).toBeUndefined();
    await loadConfiguration();
    expect(await persisted()).toEqual({ from: '2026-09-08', targetRankId: null, eligibleDates: [] });
    const boss = await loadBossProgression();
    expect(boss.confirmation?.from).toBe('2026-09-08');
    expect(boss.pending?.eligibleDates).toEqual([]);
  });

  it('leaves the frozen Stage 2 profile untouched when no era is active', async () => {
    setClock({ now: () => atHour(BREAK_LAST) });
    await importBackup(trainingBreakProfile());
    const boss = await loadBossProgression();
    expect(boss.confirmation).toBeNull();
    expect(boss.pending).toBeNull();
  });
});
