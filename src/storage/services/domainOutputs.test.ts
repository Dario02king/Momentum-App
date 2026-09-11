import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '../../core/backup/format';
import {
  GYM_SCORING_MODEL,
  RUNNING_SCORING_MODEL,
  SCORING_MODEL,
} from '../../core/config/constants';
import { SCHEMA_VERSION } from '../../core/model';
import { addDays, weekKeyOf, type DateKey } from '../../core/dates';
import { closeDatabase, deleteDatabase } from '../db';
import { importBackup } from './backupService';
import { loadBossProgression, type BossProgression } from './bossService';

/**
 * The regression boundary for presentation work.
 *
 * The domain terminal, the charts and the widget boards are layout. This
 * file is what makes that claim checkable: every number the layers above
 * could show — the Boss series, each domain's ledger and series, the Gym and
 * Running rating states, every day's score, every question's row — is
 * serialised from three profiles at a fixed clock and hashed. The hashes
 * were captured **before** the terminal existed. A presentation change that
 * moves one of them has changed a domain output, and is a regression unless
 * approved on its own.
 *
 * Three profiles, because each covers what the others cannot: the real RC2
 * export (one day, real shapes), the synthetic RC2 history (120 legacy days
 * through the era transition), and a four-domain profile under the current
 * scoring models with gym sets, timed runs and food ratings, so the
 * performance model, the bands and the daily Food fold are all inside the
 * hash.
 */

const fixture = (name: string) =>
  readFileSync(new URL(`../../../.github/fixtures/${name}`, import.meta.url), 'utf8');

const DAYS = 90;
const START = '2026-06-01' as DateKey; // a Monday
const LAST = addDays(START, DAYS - 1);

function at(day: string, hour = 21): Date {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, date, hour, 0, 0);
}

/** Four domains, ninety days, every current model in force from day one. */
function currentProfile(): string {
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
  for (let index = 0; index < DAYS; index += 1) {
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
    if (index % 7 === 0 || (weekOfYear % 5 !== 3 && (index % 7 === 2 || index % 7 === 4))) {
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
    if (index % 7 === 1 || index % 7 === 5) {
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

/** Every number the presentation layer could ever show, in one object. */
function outputsOf(boss: BossProgression) {
  const round = (value: number | null) => (value === null ? null : Math.round(value * 1e9) / 1e9);
  return {
    era: boss.era,
    origin: boss.origin,
    rank: boss.rank.id,
    peakRank: boss.peakRank.id,
    progress: round(boss.progress),
    lifetimeXp: boss.lifetimeXp,
    points: boss.points.map((p) => [round(p.progress), round(p.rating), round(p.movement)]),
    changes: boss.changes.map((c) => [c.date, c.kind, c.to]),
    domains: boss.domains.map((d) => ({
      domain: d.domain, momentum: round(d.momentum), peakMomentum: round(d.peakMomentum),
      rank: d.rank.id, peakRank: d.peakRank.id, lifetimeXp: d.lifetimeXp, progress: round(d.progress),
      started: d.started, series: d.series.map(round), active: d.active,
      changes: d.changes.map((c) => [c.date, c.kind, c.to]),
    })),
    gym: {
      rating: round(boss.gym.rating), sessionsThisWeek: boss.gym.sessionsThisWeek, weeklyTarget: boss.gym.weeklyTarget,
      endurance: { progress: round(boss.gym.endurance.progress), unlocked: boss.gym.endurance.unlocked },
      ytdChange: round(boss.gym.ytdChange), performance: { score: round(boss.gym.performance.score), components: boss.gym.performance.components },
      decayFraction: round(boss.gym.decayFraction), maintenance: boss.gym.maintenance,
      abstinence: boss.gym.abstinence?.days ?? null,
    },
    running: {
      rating: round(boss.running.rating), sessionsThisWeek: boss.running.sessionsThisWeek, weeklyTarget: boss.running.weeklyTarget,
      endurance: { progress: round(boss.running.endurance.progress), unlocked: boss.running.endurance.unlocked },
      ytdChange: round(boss.running.ytdChange), performance: { score: round(boss.running.performance.score), components: boss.running.performance.components },
      decayFraction: round(boss.running.decayFraction), maintenance: boss.running.maintenance,
      abstinence: boss.running.abstinence?.days ?? null,
      attendanceOnlyRuns: boss.running.attendanceOnlyRuns,
    },
    history: {
      days: boss.history.days.map((d) => [d.date, d.status, round(d.score), round(d.recordedScore), d.dueItems, d.answeredItems]),
      overall: boss.history.overall.map(round), mental: boss.history.mental.map(round), gym: boss.history.gym.map(round),
      running: boss.history.running.map(round), food: boss.history.food.map(round), sports: boss.history.sports.map(round),
      paused: boss.history.paused, activity: boss.history.activity,
      questions: boss.history.questions.map((q) => [q.id, q.category, q.status, q.scores.map(round)]),
      weeks: boss.history.weeks.map((w) => [w.weekKey, w.target, w.sessions, w.met, w.domains.map((d) => [d.domain, d.target, d.sessions, d.met])]),
    },
    legacy: boss.legacy.points.map((p) => round(p.rating)),
  };
}

async function fingerprint(): Promise<{ md5: string; values: number }> {
  const boss = await loadBossProgression();
  const json = JSON.stringify(outputsOf(boss));
  return { md5: createHash('md5').update(json).digest('hex'), values: (json.match(/-?\d/g) ?? []).length };
}

const PROFILES: { name: string; load(): string; clock: string; md5: string }[] = [
  { name: 'the real RC2 export', load: () => fixture('rc2-export.json'), clock: '2026-09-07', md5: '5304a99c5f0ddd8f5b105be381613cf1' },
  { name: 'the synthetic RC2 history', load: () => fixture('rc2-synthetic.json'), clock: '2026-08-31', md5: '6ef514a426a3b702aa9fe3b8414dcb98' },
  { name: 'a four-domain profile under the current models', load: currentProfile, clock: LAST, md5: '2afc67e32c71ac6083c57255cbcce65e' },
];

describe('domain outputs are the same before and after presentation work', () => {
  afterEach(async () => {
    setClock(null);
    await closeDatabase();
  });

  for (const profile of PROFILES) {
    it(`${profile.name} replays to the pinned fingerprint`, async () => {
      await deleteDatabase();
      setClock({ now: () => at(profile.clock) });
      const result = await importBackup(profile.load());
      if (!result.ok) throw new Error(result.details.join('; '));
      const { md5, values } = await fingerprint();
      // Printed so a changed hash comes with the size of what it covers.
      console.log(`fingerprint: ${profile.name}: ${md5} over ${values} values`);
      expect(values).toBeGreaterThan(100);
      expect(md5).toBe(profile.md5);
    });
  }
});
