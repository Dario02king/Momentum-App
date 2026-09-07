import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../core/clock';
import { SCHEMA_VERSION } from '../core/model';
import type {
  AnswerRecord,
  ConfigSnapshotRecord,
  DomainRecord,
  QuestionRecord,
  SettingsRecord,
  SportsSessionRecord,
} from '../core/model';
import {
  ALL_STORES,
  DB_NAME,
  MIGRATIONS,
  STORES,
  closeDatabase,
  deleteDatabase,
  openDatabase,
} from './db';
import {
  answersRepository,
  domainsRepository,
  questionsRepository,
  settingsRepository,
  sportsSessionsRepository,
} from './repositories';
import { loadProgression } from './services/ratingService';
import { loadBossProgression } from './services/bossService';

/**
 * The version 1 → version 2 migration, run against a database that really was
 * created at version 1.
 *
 * The point of these tests is not that the new stores appear. It is that a
 * user who installed RC2, used it for months and then receives this update
 * finds **the same numbers** afterwards. A migration that loses a rank is a
 * migration that has failed, however cleanly it ran.
 */

interface V1Backup {
  data: {
    settings: SettingsRecord;
    domains: DomainRecord[];
    questions: QuestionRecord[];
    answers: AnswerRecord[];
    sportsSessions: SportsSessionRecord[];
    configSnapshots: ConfigSnapshotRecord[];
  };
}

const fixture = (name: string): V1Backup =>
  JSON.parse(readFileSync(new URL(`../../.github/fixtures/${name}`, import.meta.url), 'utf8'));

/** Opens the database at version 1 and seeds it, exactly as RC2 left it. */
async function seedVersion1(data: V1Backup['data']): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => MIGRATIONS[0]!.up(request.result, request.transaction!);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(
        [
          STORES.settings,
          STORES.domains,
          STORES.questions,
          STORES.answers,
          STORES.sportsSessions,
          STORES.configSnapshots,
        ],
        'readwrite',
      );
      tx.objectStore(STORES.settings).put(data.settings);
      for (const domain of data.domains) tx.objectStore(STORES.domains).put(domain);
      for (const question of data.questions) tx.objectStore(STORES.questions).put(question);
      for (const answer of data.answers) tx.objectStore(STORES.answers).put(answer);
      for (const session of data.sportsSessions) {
        tx.objectStore(STORES.sportsSessions).put(session);
      }
      for (const snapshot of data.configSnapshots) {
        tx.objectStore(STORES.configSnapshots).put(snapshot);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  });
}

beforeEach(async () => {
  await deleteDatabase();
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

describe('upgrading a real RC2 database', () => {
  beforeEach(async () => {
    setClock({ now: () => new Date(2026, 8, 7, 21, 0, 0) });
    await seedVersion1(fixture('rc2-export.json').data);
  });

  it('opens at the new version with every store present', async () => {
    const db = await openDatabase();
    expect(db.version).toBe(SCHEMA_VERSION);
    for (const store of ALL_STORES) expect(db.objectStoreNames.contains(store)).toBe(true);
  });

  it('leaves every record that was already there', async () => {
    await openDatabase();
    expect(await answersRepository.listByDate('2026-09-07')).toHaveLength(9);
    expect(await sportsSessionsRepository.getAll()).toHaveLength(1);
    expect(await questionsRepository.list()).toHaveLength(9);
  });

  it('leaves the sports domain exactly as it was', async () => {
    // Until the user says what those sessions were, nothing about their
    // history is reinterpreted — not the domain, not its target, not a row.
    await openDatabase();
    const sports = await domainsRepository.findByType('sports');
    expect(sports?.enabled).toBe(true);
    expect(sports?.type === 'sports' && sports.settings.targetPerWeek).toBe(4);
  });

  it('marks the legacy Sport question as outstanding rather than answering it', async () => {
    await openDatabase();
    const settings = await settingsRepository.getOrCreate();
    expect(settings.legacySportMigration).toBe('pending');
  });

  it('gives every question a category, and none of them an inversion', async () => {
    await openDatabase();
    const questions = await questionsRepository.list();
    expect(questions.every((question) => question.category !== undefined)).toBe(true);
    // No RC2 question was inverted, so `false` is the only value that cannot
    // change a score that has already been recorded.
    expect(questions.every((question) => question.inverted === false)).toBe(true);
  });

  it('recognises the questions RC2 shipped and calls anything else Eigene', async () => {
    await openDatabase();
    const questions = await questionsRepository.list();
    const byText = new Map(questions.map((question) => [question.text, question.category]));
    expect(byText.get('Wie gut hast du geschlafen?')).toBe('gesundheit');
    expect(byText.get('Hast du dir heute bewusst Zeit für dich genommen?')).toBe('mental');
    expect(byText.get('Trainiert?')).toBe('eigene');
  });

  it('marks existing answers private, which is what a later social layer needs', async () => {
    await openDatabase();
    const answers = await answersRepository.listByDate('2026-09-07');
    expect(answers.every((answer) => answer.sensitivity === 'private')).toBe(true);
  });

  it('reproduces the exact numbers RC2 showed for this profile', async () => {
    // Recorded by running the RC2 build (application commit c3e8b7f) against
    // this same fixture. If any of these move, the upgrade has rewritten a
    // user's history, which D45 forbids.
    await openDatabase();
    const progression = await loadProgression();
    expect(progression.current).toBeCloseTo(261.67367135576694, 10);
    expect(progression.peak).toBeCloseTo(261.67367135576694, 10);
    expect(progression.rank.id).toBe('contender');
    expect(progression.peakRank.id).toBe('contender');
    expect(progression.lifetimeXp).toBe(90);
    expect(progression.checkInStreak).toEqual({ current: 1, best: 1 });
    expect(progression.trainingStreak).toEqual({ current: 0, best: 0 });
    expect(progression.firstScoredDate).toBe('2026-09-07');
    expect(progression.history.overall).toEqual([49.166666666666664]);
    expect(progression.history.mental).toEqual([73.33333333333333]);
    expect(progression.history.sports).toEqual([25]);
  });
});

describe('upgrading a database with months of history', () => {
  beforeEach(async () => {
    setClock({ now: () => new Date(2026, 8, 1, 9, 0, 0) });
    await seedVersion1(fixture('rc2-synthetic.json').data);
  });

  it('reproduces every number RC2 showed, including the rank history', async () => {
    // 120 days with a fortnight of silence in the middle: decay, a broken
    // streak, five rank changes and eighteen weeks of targets. This is the
    // assertion that "existing data survives" actually means something.
    await openDatabase();
    const progression = await loadProgression();
    expect(progression.current).toBeCloseTo(732.5342908289315, 9);
    expect(progression.peak).toBeCloseTo(749.5023613714083, 9);
    expect(progression.rank.id).toBe('master');
    expect(progression.peakRank.id).toBe('master');
    expect(progression.lifetimeXp).toBe(4640);
    expect(progression.checkInStreak).toEqual({ current: 5, best: 5 });
    expect(progression.trainingStreak).toEqual({ current: 6, best: 8 });
    expect(progression.points).toHaveLength(121);
    expect(progression.changes).toHaveLength(5);
    expect(progression.changes[4]).toEqual({
      date: '2026-08-03',
      kind: 'promotion',
      from: 'veteran',
      to: 'master',
      rating: 700.4840124889928,
    });
    expect(progression.points[30]?.rating).toBeCloseTo(628.2508425931381, 9);
    expect(progression.points[90]?.rating).toBeCloseTo(692.5198493242135, 9);
    expect(progression.history.days.filter((day) => day.status === 'scored')).toHaveLength(119);
    expect(progression.history.weeks.filter((week) => week.met)).toHaveLength(14);
  });

  it('grandfathers that progression into the Boss, day for day', async () => {
    // Every snapshot RC2 wrote carries no Boss weights, and the replay reads
    // that absence as "one undivided progression". So the Boss for a
    // pre-upgrade day is not a number carried across a boundary — it is the
    // same replay, and it cannot drift from what the user already saw.
    await openDatabase();
    const [legacy, boss] = await Promise.all([loadProgression(), loadBossProgression()]);
    expect(boss.era).toBe('legacy');
    expect(boss.rank.id).toBe(legacy.rank.id);
    expect(boss.peakRank.id).toBe(legacy.peakRank.id);
    expect(boss.lifetimeXp).toBe(legacy.lifetimeXp);
    boss.points.forEach((point, index) => {
      expect(point.era).toBe('legacy');
      expect(point.rating).toBeCloseTo(legacy.points[index]!.rating, 9);
    });
  });
});
