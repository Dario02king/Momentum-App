import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { addDays, type DateKey } from '../../core/dates';
import { canonicalJson } from '../../testing/canonical';
import { closeDatabase, deleteDatabase } from '../db';
import { gymSessionsRepository, gymSetsRepository } from '../repositories';
import { applyOnboarding } from './configurationService';
import { loadBossProgression } from './bossService';
import { loadHistory } from './historyService';
import {
  addSet,
  draftFromPlan,
  ensureExerciseCatalogue,
  loadGymHistory,
  openSessionForDay,
  startSessionFromDraft,
} from './gymService';
import { createTrainingPlan } from './trainingPlanService';

/**
 * Manual entry and plan entry are two doors into one room (WP2-1N).
 *
 * The same performed sets, on the same days, logged once through the free
 * session and once through a saved plan, must leave the scoring path with
 * exactly the same inputs and exactly the same outputs: every set row, the
 * session count per week, the exercise-days and comparisons, the muscle
 * figures, the Gym rating state — attendance, Endurance, decay, Maintenance
 * — every day's score, and the Boss series. Compared canonically and
 * exactly, with only the random ids and the plan provenance removed.
 */

function freezeAt(day: string, hour = 18): void {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  setClock({ now: () => new Date(y, m - 1, d, hour, 0, 0) });
}

const START = '2026-01-05' as DateKey; // a Monday
const kg = (value: number) => Math.round(value * 1000);

interface Performed {
  date: DateKey;
  sets: { exerciseId: string; reps: number; weightKg: number }[];
}

/**
 * Twelve weeks of three sessions, rising loads, a bodyweight exercise, then
 * a twelve-day break and a return — enough to take the Endurance Phase
 * through its four weeks and to open an abstinence episode on both paths.
 */
function schedule(): Performed[] {
  const days: Performed[] = [];
  for (let week = 0; week < 12; week += 1) {
    if (week === 9) continue; // the break: no session for twelve days
    for (const offset of [0, 2, 4]) {
      const date = addDays(START, week * 7 + offset);
      const bump = week * 1.25;
      days.push({
        date,
        sets: [
          { exerciseId: 'ex_bench_press', reps: 8, weightKg: 60 + bump },
          { exerciseId: 'ex_bench_press', reps: 8, weightKg: 62.5 + bump },
          { exerciseId: 'ex_incline_press', reps: 10, weightKg: 24 + bump / 2 },
          { exerciseId: 'ex_cable_lateral_raise', reps: 15, weightKg: 7.5 },
          { exerciseId: 'ex_triceps_pushdown', reps: 12, weightKg: 25 + bump / 2 },
          { exerciseId: 'ex_dip', reps: 10, weightKg: offset === 4 ? 5 : 0 },
        ],
      });
    }
  }
  return days;
}

const REFERENCE = addDays(START, 12 * 7 + 3);

async function fresh(): Promise<void> {
  await deleteDatabase();
  freezeAt(START, 8);
  await applyOnboarding({ questions: [], gymTargetPerWeek: 3 });
  await ensureExerciseCatalogue();
  const { recordBodyweight } = await import('./gymService');
  await recordBodyweight(80, START);
}

async function manual(): Promise<void> {
  for (const day of schedule()) {
    freezeAt(day.date);
    const session = await openSessionForDay(day.date);
    for (const set of day.sets) {
      await addSet({ sessionId: session.id, exerciseId: set.exerciseId, reps: set.reps, weightGrams: kg(set.weightKg) });
    }
  }
}

async function planned(): Promise<void> {
  const plan = await createTrainingPlan({
    name: 'Push',
    exercises: ['ex_bench_press', 'ex_incline_press', 'ex_cable_lateral_raise', 'ex_triceps_pushdown', 'ex_dip'].map(
      (exerciseId) => ({ exerciseId }),
    ),
  });
  for (const day of schedule()) {
    freezeAt(day.date);
    const draft = draftFromPlan(plan);
    let sessionId: string | null = null;
    for (const set of day.sets) {
      // The session comes into being with the first set, as the screen does it.
      if (sessionId === null) sessionId = (await startSessionFromDraft(draft, day.date)).id;
      await addSet({ sessionId, exerciseId: set.exerciseId, reps: set.reps, weightGrams: kg(set.weightKg) });
    }
  }
}

/** Random ids and plan provenance are the only things allowed to differ. */
function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, scrub(v)]));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'id' || key === 'sessionId' || key === 'planId' || key === 'exercises' && Array.isArray(entry) && entry.every((line) => line && typeof line === 'object' && 'source' in (line as object))) continue;
      out[key] = scrub(entry);
    }
    return out;
  }
  return value;
}

async function outputs(): Promise<Record<string, string>> {
  freezeAt(REFERENCE, 9);
  const sessions = await gymSessionsRepository.getAll();
  const sets = await gymSetsRepository.getAll();
  const boss = await loadBossProgression(REFERENCE);
  const history = await loadHistory(START, REFERENCE);
  const gym = await loadGymHistory(START, REFERENCE);
  return {
    // Scoring inputs after persistence: the set rows and the session rows,
    // in a stable order, without the random ids.
    sets: canonicalJson(
      scrub([...sets].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.exerciseId.localeCompare(b.exerciseId))),
    ),
    sessions: canonicalJson(scrub(sessions.map((session) => [session.date, session.weekKey, session.performedAt, session.legacyCarryOver]))),
    // `days` comes back in index order — date, then the random record id —
    // so its array order is not an output; the numbers in it are.
    gymHistory: canonicalJson(
      scrub({ ...gym, days: [...gym.days].sort((a, b) => a.date.localeCompare(b.date) || a.exerciseId.localeCompare(b.exerciseId)) }),
    ),
    gymState: canonicalJson(scrub(boss.gym)),
    gymLedger: canonicalJson(scrub(boss.domains.find((domain) => domain.domain === 'gym'))),
    boss: canonicalJson(scrub({ points: boss.points, rank: boss.rank.id, progress: boss.progress, changes: boss.changes })),
    history: canonicalJson(scrub({ days: history.days, gym: history.gym, overall: history.overall, weeks: history.weeks })),
  };
}

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

/**
 * What can be compared exactly today, and what cannot yet.
 *
 * The **inputs** — every set row and every session row — are compared
 * exactly, and are identical: the plan path writes through `openSessionForDay`
 * and `addSet` like the free session does, and nothing about a row says
 * which door it came through.
 *
 * The **outputs** are not compared exactly here, and the reason is not the
 * plan path. `buildExerciseDays` reads the sets through the `by_date` index,
 * whose order within a day is the record id — random — and
 * `musclePerformance` sums each group's weighted ratios in that order.
 * Floating-point addition is not associative, so two *manual* histories with
 * the same sets and different ids already differ in the last ULP of the
 * muscle ratios, the year-to-date change and the performance score
 * (verified: 1.1636628796656783 vs 1.163662879665678 on this schedule).
 * Making the read order deterministic would make this comparison exact and
 * keeps the Stage 2 baselines byte-identical, but it changes the pinned
 * `domainOutputs` Gym-history fingerprint, which is a decision, not a fix
 * to make in passing. Until it is made, the exact output comparison is an
 * open item (WP2-1 report, §22), not a passing test and not a tolerance.
 */
describe('manual entry versus plan entry', () => {
  it('produce identical scoring inputs after persistence', async () => {
    await fresh();
    await manual();
    const viaManual = await outputs();
    await closeDatabase();

    await fresh();
    await planned();
    const viaPlan = await outputs();

    // Sanity: the schedule actually exercised what it claims to.
    expect(viaManual.sets!.length).toBeGreaterThan(1000);
    const state = JSON.parse(viaPlan.gymState!) as { endurance: { unlocked: boolean } };
    expect(state.endurance.unlocked).toBe(true);

    expect(viaPlan.sets).toBe(viaManual.sets);
    expect(viaPlan.sessions).toBe(viaManual.sessions);
  }, 30_000);

  it.todo(
    'produce identical outputs — blocked on the pre-existing id-order summation in buildExerciseDays (see the note above)',
  );

  it('a plan session carries the snapshot the free session lacks, and nothing else differs on the row', async () => {
    await fresh();
    await planned();
    const sessions = await gymSessionsRepository.getAll();
    expect(sessions.every((session) => session.exercises !== undefined && session.planId !== null)).toBe(true);
    const { exercises: _snapshot, planId: _plan, id: _id, ...rest } = sessions[0]!;
    expect(Object.keys(rest).sort()).toEqual(
      ['configSnapshotId', 'createdAt', 'date', 'legacyCarryOver', 'note', 'performedAt', 'updatedAt', 'weekKey'].sort(),
    );
  });
});
