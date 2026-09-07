import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '../../core/backup/format';
import { SCHEMA_VERSION } from '../../core/model';
import { addDays, weekKeyOf, type DateKey } from '../../core/dates';
import { closeDatabase, deleteDatabase } from '../db';
import { answersRepository } from '../repositories';
import { importBackup } from './backupService';
import { loadBossProgression } from './bossService';
import { loadProgression } from './ratingService';

/**
 * How long a full replay takes, measured rather than assumed.
 *
 * The Phase 0 plan flagged this as the one repository constraint that could
 * bite late: RC2 replayed one domain over the whole history on every Rank and
 * Progress load, and iteration 2 replays four plus the Boss aggregation. The
 * question is whether that stays free.
 *
 * The budgets below are deliberately loose — an order of magnitude above what
 * the replay actually costs — because this is a regression guard against
 * something turning linear work quadratic, not a benchmark. A tight budget on
 * shared CI is a flaky test, and a flaky test is worse than no test.
 */

const DAYS = 730;
const START = '2024-09-02' as DateKey; // a Monday
const REFERENCE_DAY = addDays(START, DAYS - 1);

const stamp = '2024-09-02T06:00:00.000Z';
const domMental = 'dom_perf_mental';
const domGym = 'dom_perf_gym';
const domRunning = 'dom_perf_running';
const domFood = 'dom_perf_food';

function buildProfile() {
  const questions = [0, 1, 2, 3, 4].map((index) => ({
    id: `q_perf_${index}`,
    domainId: domMental,
    text: `Frage ${index}`,
    type: index % 2 === 0 ? ('scale' as const) : ('boolean' as const),
    category: 'alltag' as const,
    inverted: false,
    status: 'active' as const,
    order: index,
    createdAt: stamp,
    updatedAt: stamp,
    archivedAt: null,
  }));

  const answers = [];
  const gymSessions = [];
  const runs = [];
  const foodEntries = [];

  for (let index = 0; index < DAYS; index += 1) {
    const date = addDays(START, index);
    const weekKey = weekKeyOf(date);
    for (const question of questions) {
      // A realistic profile is not a perfect one: about one day in nine is
      // skipped entirely, which is what makes decay and streaks do work.
      if (index % 9 === 0) continue;
      answers.push({
        id: `${date}#${question.id}`,
        date,
        questionId: question.id,
        domainId: domMental,
        value: question.type === 'scale' ? 4 + ((index + question.order) % 7) : index % 3 !== 0,
        valueType: question.type,
        sensitivity: 'private' as const,
        configSnapshotId: 'cfg_perf',
        createdAt: `${date}T20:00:00.000Z`,
        updatedAt: `${date}T20:00:00.000Z`,
      });
    }
    if (index % 3 === 0) {
      gymSessions.push({
        id: `gym_${date}`,
        date,
        weekKey,
        performedAt: `${date}T18:00:00.000Z`,
        planId: null,
        note: null,
        legacyCarryOver: false,
        configSnapshotId: 'cfg_perf',
        createdAt: `${date}T18:00:00.000Z`,
        updatedAt: `${date}T18:00:00.000Z`,
      });
    }
    if (index % 4 === 1) {
      runs.push({
        id: `run_${date}`,
        date,
        weekKey,
        performedAt: `${date}T07:00:00.000Z`,
        source: 'manual' as const,
        externalId: null,
        distanceMetres: 6000 + (index % 5) * 500,
        durationSeconds: 1800 + (index % 5) * 120,
        elevationMetres: null,
        steps: null,
        note: null,
        legacyCarryOver: false,
        configSnapshotId: 'cfg_perf',
        createdAt: `${date}T07:00:00.000Z`,
        updatedAt: `${date}T07:00:00.000Z`,
      });
    }
    foodEntries.push({
      id: `food_${date}`,
      date,
      foodId: null,
      label: 'Mittagessen',
      grams: 400,
      kcal: 600 + (index % 7) * 25,
      proteinG: 35,
      carbsG: 60,
      fatG: 20,
      detail: null,
      sensitivity: 'private' as const,
      configSnapshotId: 'cfg_perf',
      createdAt: `${date}T13:00:00.000Z`,
      updatedAt: `${date}T13:00:00.000Z`,
    });
  }

  const domainSnapshots = [
    { id: domMental, type: 'mental' as const, enabled: true, settings: {} },
    { id: domGym, type: 'gym' as const, enabled: true, settings: { targetPerWeek: 3 } },
    { id: domRunning, type: 'running' as const, enabled: true, settings: { targetPerWeek: 2 } },
    { id: domFood, type: 'food' as const, enabled: true, settings: {} },
  ];

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: stamp,
    app: { name: 'Momentum', version: '0.1.0' },
    data: {
      settings: {
        id: 'settings',
        language: 'de',
        firstUseDate: START,
        onboardingCompletedAt: stamp,
        acknowledgedRankId: null,
        legacySportMigration: 'none',
        createdAt: stamp,
        updatedAt: stamp,
      },
      domains: domainSnapshots.map((domain, order) => ({
        ...domain,
        order,
        createdAt: stamp,
        updatedAt: stamp,
      })),
      questions,
      answers,
      sportsSessions: [],
      configSnapshots: [
        {
          id: 'cfg_perf',
          effectiveFrom: START,
          createdAt: stamp,
          config: {
            boss: { weights: { mental: 0.4, gym: 0.3, running: 0.2, food: 0.1 } },
            domains: domainSnapshots,
            questions: questions.map((question) => ({
              id: question.id,
              domainId: question.domainId,
              text: question.text,
              type: question.type,
              status: question.status,
            })),
            scoring: { editWindowDays: 3, scaleMin: 1, scaleMax: 10 },
          },
        },
      ],
      rankEvents: [],
      profile: null,
      exercises: [],
      gymPlans: [],
      gymSessions,
      gymSets: [],
      runs,
      foodEntries,
      weightEntries: [],
      restDays: [],
      pausePeriods: [],
      tombstones: [],
    },
  };
}

async function time(label: string, run: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await run();
  const elapsed = performance.now() - started;
  // Printed so the number is on the record rather than only asserted against.
  console.log(`replay: ${label} over ${DAYS} days took ${elapsed.toFixed(1)} ms`);
  return elapsed;
}

beforeEach(async () => {
  await deleteDatabase();
  const [year, month, day] = REFERENCE_DAY.split('-').map(Number) as [number, number, number];
  setClock({ now: () => new Date(year, month - 1, day, 21, 0, 0) });
  const result = await importBackup(JSON.stringify(buildProfile()));
  if (!result.ok) throw new Error(result.details.join('; '));
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

describe('replaying two years of four domains', () => {
  it('reconstructs the whole history on every load', async () => {
    const progression = await loadProgression();
    expect(progression.points).toHaveLength(DAYS);
    expect(progression.history.weeks.length).toBeGreaterThan(100);
  });

  it('builds four ledgers and the Boss on top of it', async () => {
    const boss = await loadBossProgression();
    expect(boss.domains).toHaveLength(4);
    expect(boss.points).toHaveLength(DAYS);
    expect(boss.era).toBe('weighted');
    // Food has no scoring engine yet, so it has not started and is left out
    // of the Boss rather than counted as a zero.
    expect(boss.domains.find((domain) => domain.domain === 'food')?.started).toBe(false);
    expect(boss.points[DAYS - 1]?.contributions.map((entry) => entry.domain)).toEqual([
      'mental',
      'gym',
      'running',
    ]);
  });

  it('stays well inside a frame budget for the legacy progression', async () => {
    const elapsed = await time('rating', () => loadProgression());
    expect(elapsed).toBeLessThan(1500);
  });

  it('stays well inside a frame budget for the full Boss replay', async () => {
    const elapsed = await time('boss', () => loadBossProgression());
    expect(elapsed).toBeLessThan(1500);
  });

  it('does no work that grows faster than the history does', async () => {
    /*
     * The measurement that mattered. Reconstructing the weeks used to look up
     * each week's first day by scanning the whole range, which is a scan
     * inside a loop: at two years it was five sixths of the entire cost of a
     * replay, and it would have grown as the square of a user's history.
     * Remembering the day while walking the range removed it.
     *
     * The guard is a ratio rather than a time, because the absolute numbers
     * here are not a browser's: this runs against fake-indexeddb, which is a
     * good deal slower than the real thing. Reading the answers is the single
     * largest remaining line item, and a replay that costs many times that
     * read has grown a loop it should not have.
     */
    const read = await time('answers read alone', () =>
      answersRepository.listByDateRange(START, REFERENCE_DAY),
    );
    const full = await time('full boss replay', () => loadBossProgression());
    expect(full).toBeLessThan(read * 12 + 100);
  });

  it('costs roughly what the legacy replay costs, not a multiple of it', async () => {
    // Four ledgers plus the Boss are folds over day scores that have already
    // been reconstructed once. If this ratio ever climbs, something is
    // re-reading storage per domain instead of per load.
    const rating = await time('rating (ratio)', () => loadProgression());
    const boss = await time('boss (ratio)', () => loadBossProgression());
    expect(boss).toBeLessThan(rating * 4 + 200);
  });
});
