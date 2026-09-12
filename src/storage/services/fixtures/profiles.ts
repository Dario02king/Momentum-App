import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '../../../core/backup/format';
import {
  GYM_SCORING_MODEL,
  RUNNING_SCORING_MODEL,
  SCORING_MODEL,
} from '../../../core/config/constants';
import { SCHEMA_VERSION } from '../../../core/model';
import { addDays, weekKeyOf, type DateKey } from '../../../core/dates';

/**
 * Synthetic backup profiles for replay tests.
 *
 * Deterministic by construction: fixed dates, no clock, no randomness. A
 * profile is a backup file as a string, so a test imports it exactly the way
 * a user would restore one.
 */

export const DAYS = 90;
export const START = '2026-06-01' as DateKey; // a Monday
export const LAST = addDays(START, DAYS - 1);

export function at(day: string, hour = 21): Date {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, date, hour, 0, 0);
}

export interface ProfileOptions {
  /** Days of history; ninety unless a scenario needs more. */
  days?: number;
  /** Inclusive day-index ranges with no Gym sessions and no runs at all. */
  gymBreak?: readonly [number, number] | null;
  runBreak?: readonly [number, number] | null;
}

const inBreak = (range: readonly [number, number] | null | undefined, index: number): boolean =>
  range !== null && range !== undefined && index >= range[0] && index <= range[1];

/**
 * Four domains, ninety days, every current model in force from day one.
 *
 * With no options this is byte for byte the profile `domainOutputs.test.ts`
 * pinned before the domain terminal existed — the fingerprint there is what
 * proves it. The options exist for the Stage 2 baseline, which needs an
 * abstinence long enough for the training decay schedule to actually run.
 */
export function currentProfile(options: ProfileOptions = {}): string {
  const days = options.days ?? DAYS;
  const stamp = `${START}T06:00:00.000Z`;
  const ids = { mental: 'dom_fp_mental', gym: 'dom_fp_gym', running: 'dom_fp_running', food: 'dom_fp_food' };
  const questions = [0, 1, 2, 3].map((index) => ({
    id: `q_fp_${index}`,
    domainId: ids.mental,
    text: `Frage ${index}`,
    type: index % 2 === 0 ? ('scale' as const) : ('boolean' as const),
    category: index < 2 ? ('alltag' as const) : ('gesundheit' as const),
    inverted: false,
    status: 'active' as const,
    order: index,
    createdAt: stamp,
    updatedAt: stamp,
    archivedAt: null,
  }));

  const answers = [];
  const gymSessions = [];
  const gymSets = [];
  const runs = [];
  const foodDays = [];
  for (let index = 0; index < days; index += 1) {
    const date = addDays(START, index);
    const weekKey = weekKeyOf(date);
    const day = (hour: string) => `${date}T${hour}:00:00.000Z`;
    if (index % 9 !== 0) {
      for (const question of questions) {
        answers.push({
          id: `${date}#${question.id}`, date, questionId: question.id, domainId: ids.mental,
          value: question.type === 'scale' ? 4 + ((index + question.order) % 7) : index % 3 !== 0,
          valueType: question.type, sensitivity: 'private' as const, configSnapshotId: 'cfg_fp',
          createdAt: day('20'), updatedAt: day('20'),
        });
      }
      foodDays.push({
        id: date, date, adherence: 5 + (index % 5), note: null, sensitivity: 'private' as const,
        configSnapshotId: 'cfg_fp', createdAt: day('21'), updatedAt: day('21'),
      });
    }
    // Three sessions most weeks, one week in five with only one — so
    // attendance, the Endurance Phase and a setback are all in the hash.
    const weekOfYear = Math.floor(index / 7);
    if (
      !inBreak(options.gymBreak, index) &&
      (index % 7 === 0 || (weekOfYear % 5 !== 3 && (index % 7 === 2 || index % 7 === 4)))
    ) {
      const id = `gym_${date}`;
      gymSessions.push({
        id, date, weekKey, performedAt: day('18'), planId: null, note: null, legacyCarryOver: false,
        configSnapshotId: 'cfg_fp', createdAt: day('18'), updatedAt: day('18'),
      });
      for (const [order, exercise, muscles, primary] of [
        [0, 'ex_squat', ['quadriceps', 'hamstringsGlutes', 'core'], ['quadriceps']],
        [1, 'ex_bench_press', ['chest', 'triceps', 'shoulders'], ['chest']],
      ] as const) {
        gymSets.push({
          id: `set_${date}_${order}`, sessionId: id, exerciseId: exercise, date,
          weightGrams: (60 + order * 10 + Math.floor(index / 14) * 2500 / 1000) * 1000,
          reps: 5 + (index % 3), order, muscles: [...muscles], primaryMuscles: [...primary],
          loadType: 'external' as const, createdAt: day('18'),
        });
      }
    }
    if (!inBreak(options.runBreak, index) && (index % 7 === 1 || index % 7 === 5)) {
      const metres = index % 14 === 1 ? 10000 : 5000;
      runs.push({
        id: `run_${date}`, date, weekKey, performedAt: day('07'), source: 'manual' as const, externalId: null,
        distanceMetres: metres, durationSeconds: Math.round((metres / 1000) * (360 - Math.floor(index / 10) * 4)),
        elevationMetres: null, steps: null, note: null, legacyCarryOver: false,
        configSnapshotId: 'cfg_fp', createdAt: day('07'), updatedAt: day('07'),
      });
    }
  }

  const domainSnapshots = [
    { id: ids.mental, type: 'mental' as const, enabled: true, settings: {} },
    { id: ids.gym, type: 'gym' as const, enabled: true, settings: { targetPerWeek: 3 } },
    { id: ids.running, type: 'running' as const, enabled: true, settings: { targetPerWeek: 2 } },
    { id: ids.food, type: 'food' as const, enabled: true, settings: {} },
  ];

  return JSON.stringify({
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: stamp,
    app: { name: 'Momentum', version: '0.1.0' },
    data: {
      settings: {
        id: 'settings', language: 'de', firstUseDate: START, onboardingCompletedAt: stamp,
        acknowledgedRankId: null, legacySportMigration: 'none', createdAt: stamp, updatedAt: stamp,
      },
      domains: domainSnapshots.map((domain, order) => ({ ...domain, order, createdAt: stamp, updatedAt: stamp })),
      questions,
      answers,
      sportsSessions: [],
      configSnapshots: [{
        id: 'cfg_fp',
        effectiveFrom: START,
        createdAt: stamp,
        config: {
          boss: { weights: { mental: 0.4, gym: 0.3, running: 0.2, food: 0.1 } },
          domains: domainSnapshots,
          questions: questions.map((q) => ({ id: q.id, domainId: q.domainId, text: q.text, type: q.type, status: q.status, category: q.category })),
          scoring: {
            editWindowDays: 3, scaleMin: 1, scaleMax: 10,
            model: SCORING_MODEL, gymModel: GYM_SCORING_MODEL, runningModel: RUNNING_SCORING_MODEL,
          },
        },
      }],
      rankEvents: [], profile: null, exercises: [], gymPlans: [], gymSessions, gymSets, runs,
      foodEntries: [], foodDays, weightEntries: [], restDays: [], pausePeriods: [], tombstones: [],
    },
  });
}

/**
 * The same four domains over 180 days, with two real training breaks.
 *
 * Gym stops for four weeks from day 60 (the Endurance Phase is long complete
 * by then, so the abstinence schedule runs through several blocks), and
 * Running stops for twenty days from day 120. Both resume afterwards, so the
 * fold has to end an episode and start counting again from what the decay
 * left. This is the profile the Stage 2 decay differential needs at the
 * service level, where the day inputs are derived rather than hand-built.
 */
export const BREAK_DAYS = 180;
export const BREAK_LAST = addDays(START, BREAK_DAYS - 1);

export function trainingBreakProfile(): string {
  return currentProfile({ days: BREAK_DAYS, gymBreak: [60, 87], runBreak: [120, 139] });
}
