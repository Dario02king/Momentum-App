import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { addDays, weekKeyOf } from '../../core/dates';
import { GYM } from '../../core/config/constants';
import { closeDatabase, deleteDatabase } from '../db';
import {
  applyOnboarding,
  enableDomain,
  setWeeklyTarget,
} from './configurationService';
import { ensureCurrentSnapshot } from '../configService';
import { domainsRepository, gymSessionsRepository, sportsSessionsRepository } from '../repositories';
import { loadDay, logSession } from './checkInService';
import { loadHistory } from './historyService';
import { loadProgression } from './ratingService';

/**
 * The weekly-quota rules, on the domain that now carries them.
 *
 * RC2 had one generic Sport domain and these tests exercised it. Iteration 2
 * has two independent quotas, and the rules — a quota rather than a schedule,
 * a week judged by the target it was lived under — belong to any of them.
 * Gym stands in; the last block checks that the retired domain still replays.
 */

function freezeAt(day: string, hour = 9): void {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  setClock({ now: () => new Date(y, m - 1, d, hour, 0, 0) });
}

const MONDAY = '2025-01-06';
const setGymTarget = (target: number) => setWeeklyTarget('gym', target);

beforeEach(async () => {
  await deleteDatabase();
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

/** Trains on the first `count` days of the week starting at `weekStart`. */
async function trainWeek(weekStart: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    const date = addDays(weekStart, index);
    freezeAt(date);
    await logSession('gym', date);
  }
}

describe('a profile with training only', () => {
  beforeEach(async () => {
    freezeAt(MONDAY);
    await applyOnboarding({ questions: [], gymTargetPerWeek: 3 });
  });

  it('shows the week on Today with no Wellbeing section at all', async () => {
    const day = await loadDay();
    expect(day.mental).toBeNull();
    expect(day.training[0]?.domain).toBe('gym');
    expect(day.training[0]?.progress.target).toBe(3);
    expect(day.empty).toBe(false);
  });

  it('scores the day from training alone', async () => {
    await trainWeek(MONDAY, 3);
    freezeAt(addDays(MONDAY, 14));
    const history = await loadHistory(MONDAY, addDays(MONDAY, 6));
    expect(history.overall[0]).toBe(100);
    expect(history.mental.every((value) => value === null)).toBe(true);
  });

  it('never invents a check-in streak where there are no questions', async () => {
    await trainWeek(MONDAY, 3);
    freezeAt(addDays(MONDAY, 14));
    const progression = await loadProgression();
    expect(progression.checkInStreak.current).toBe(0);
    expect(progression.checkInStreak.best).toBe(0);
    expect(progression.trainingStreak.best).toBeGreaterThanOrEqual(1);
  });

  it('assigns no training days, only a count', async () => {
    // Three sessions all on one day still meet a three-a-week target: the
    // target is a quota, and the app never says which days to train.
    await logSession('gym', MONDAY);
    await logSession('gym', MONDAY);
    await logSession('gym', MONDAY);
    const day = await loadDay(MONDAY);
    expect(day.training[0]?.progress.met).toBe(true);
    expect(day.training[0]?.progress.completed).toBe(3);
  });

  it('records the day and an optional note', async () => {
    const session = await logSession('gym', MONDAY, { note: 'Kurz' });
    expect(session.date).toBe(MONDAY);
    expect(session.note).toBe('Kurz');
    expect(session.performedAt).toBeTruthy();
    expect((await logSession('gym', MONDAY)).note).toBeNull();
  });

  it('keeps a past week judged by the target it was lived under', async () => {
    await trainWeek(MONDAY, 2);
    freezeAt(addDays(MONDAY, 7));
    await setGymTarget(GYM.MAX_TARGET_PER_WEEK);

    freezeAt(addDays(MONDAY, 21));
    const history = await loadHistory(MONDAY, addDays(MONDAY, 6));
    // Two of three, not two of seven.
    expect(history.gym[0]).toBeCloseTo(66.67, 1);
  });
});

describe('two independent quotas', () => {
  beforeEach(async () => {
    freezeAt(MONDAY);
    await applyOnboarding({ questions: [], gymTargetPerWeek: 3, runningTargetPerWeek: 2 });
  });

  it('shows each one its own card, in order', async () => {
    const day = await loadDay();
    expect(day.training.map((entry) => entry.domain)).toEqual(['gym', 'running']);
    expect(day.training[0]?.progress.target).toBe(3);
    expect(day.training[1]?.progress.target).toBe(2);
  });

  it('never lets one quota fill the other', async () => {
    // A run is not a gym session. This is the whole reason the targets are
    // separate rather than one combined number.
    await logSession('running', MONDAY);
    await logSession('running', MONDAY);
    const day = await loadDay(MONDAY);
    expect(day.training[0]?.progress.completed).toBe(0);
    expect(day.training[1]?.progress.met).toBe(true);
  });

  it('counts a met week for each quota separately', async () => {
    await trainWeek(MONDAY, 3);
    freezeAt(MONDAY);
    await logSession('running', MONDAY);
    freezeAt(addDays(MONDAY, 14));
    const history = await loadHistory(MONDAY, addDays(MONDAY, 6));
    const week = history.weeks[0]!;
    expect(week.domains.find((entry) => entry.domain === 'gym')?.met).toBe(true);
    // One run against a target of two.
    expect(week.domains.find((entry) => entry.domain === 'running')?.met).toBe(false);
  });
});

describe('the retired generic Sport domain', () => {
  /**
   * Nothing in the product creates this any more. It is seeded directly here
   * because a device carrying RC2 history still has one, and its weeks still
   * have to replay exactly as they were scored.
   */
  beforeEach(async () => {
    freezeAt(MONDAY);
    await enableDomain('mental');
    await domainsRepository.ensure('sports', 9, { targetPerWeek: 3 });
    await ensureCurrentSnapshot();
  });

  it('is never created by onboarding', async () => {
    await deleteDatabase();
    freezeAt(MONDAY);
    await applyOnboarding({ questions: [], gymTargetPerWeek: 3, runningTargetPerWeek: 2 });
    expect(await domainsRepository.findByType('sports')).toBeUndefined();
  });

  it('still scores its weeks and still shows on Today, read-only', async () => {
    const snapshot = await ensureCurrentSnapshot();
    for (let index = 0; index < 2; index += 1) {
      const date = addDays(MONDAY, index);
      await sportsSessionsRepository.create({
        domainId: (await domainsRepository.findByType('sports'))!.id,
        date,
        configSnapshotId: snapshot.id,
      });
    }
    const day = await loadDay(MONDAY);
    const legacy = day.training.find((entry) => entry.domain === 'sports');
    expect(legacy?.progress.completed).toBe(2);
    expect(legacy?.progress.target).toBe(3);

    freezeAt(addDays(MONDAY, 14));
    const history = await loadHistory(MONDAY, addDays(MONDAY, 6));
    expect(history.sports[0]).toBeCloseTo(66.67, 1);
  });

  it('keeps its sessions in their own log, never in the gym one', async () => {
    const snapshot = await ensureCurrentSnapshot();
    await sportsSessionsRepository.create({
      domainId: (await domainsRepository.findByType('sports'))!.id,
      date: MONDAY,
      configSnapshotId: snapshot.id,
    });
    expect(await gymSessionsRepository.listByWeek(weekKeyOf(MONDAY))).toHaveLength(0);
  });
});
