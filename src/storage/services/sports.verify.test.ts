import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { addDays } from '../../core/dates';
import { closeDatabase, deleteDatabase } from '../db';
import { SPORTS } from '../../core/config/constants';
import { applyOnboarding, setSportsTarget } from './configurationService';
import { sportsSessionsRepository } from '../repositories';
import { loadDay, logSession } from './checkInService';
import { loadHistory } from './historyService';
import { loadProgression } from './ratingService';

function freezeAt(day: string, hour = 9): void {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  setClock({ now: () => new Date(y, m - 1, d, hour, 0, 0) });
}

const MONDAY = '2025-01-06';

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
    await logSession(date);
  }
}

describe('a profile with Sports only', () => {
  beforeEach(async () => {
    freezeAt(MONDAY);
    await applyOnboarding({ questions: [], sportsTargetPerWeek: 3 });
  });

  it('shows the week on Today with no Mental Wellbeing section at all', async () => {
    const day = await loadDay();
    expect(day.mental).toBeNull();
    expect(day.sports?.progress.target).toBe(3);
    expect(day.empty).toBe(false);
  });

  it('scores the day from Sports alone', async () => {
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

  it('does not decay the rating on rest days in a week that met its target', async () => {
    /*
     * Training Monday to Wednesday and resting Thursday to Sunday is the
     * target being met, not four days of inactivity. Treating those rest
     * days as absence would punish exactly the behaviour the target asks for.
     */
    await trainWeek(MONDAY, 3);
    freezeAt(addDays(MONDAY, 20));
    const progression = await loadProgression();
    const week = progression.points.slice(0, 7);
    expect(week.every((point) => point.decay === 0)).toBe(true);
  });

  it('still decays through a week with no training at all', async () => {
    await trainWeek(MONDAY, 3);
    // Then three weeks of nothing.
    freezeAt(addDays(MONDAY, 28));
    const progression = await loadProgression();
    const idle = progression.points.slice(7);
    expect(idle.some((point) => point.decay > 0)).toBe(true);
  });

  it('rises with weeks that meet the target', async () => {
    for (let week = 0; week < 8; week += 1) {
      await trainWeek(addDays(MONDAY, week * 7), 3);
    }
    freezeAt(addDays(MONDAY, 8 * 7));
    const progression = await loadProgression();
    expect(progression.current).toBeGreaterThan(400);
    expect(progression.trainingStreak.current).toBeGreaterThanOrEqual(7);
  });
});

describe('the shape version 2 will need', () => {
  beforeEach(async () => {
    freezeAt(MONDAY);
    await applyOnboarding({ questions: [], sportsTargetPerWeek: 3 });
  });

  it('carries workout detail on a session without any schema change', async () => {
    /*
     * Version 1 never writes this. The point of the test is that the seam
     * §1 asks for genuinely holds: exercises, sets and weights can be
     * attached later as an additive write rather than a migration.
     */
    const session = await logSession(MONDAY);
    const stored = await sportsSessionsRepository.get(session.id);
    expect(stored?.detail).toBeNull();

    await sportsSessionsRepository.update(session.id, {
      detail: {
        kind: 'strength',
        exercises: [{ name: 'Squat', sets: [{ reps: 5, weightKg: 100 }] }],
      },
    });

    const withDetail = await sportsSessionsRepository.get(session.id);
    expect(withDetail?.detail).toEqual({
      kind: 'strength',
      exercises: [{ name: 'Squat', sets: [{ reps: 5, weightKg: 100 }] }],
    });
    // And version 1 keeps scoring it exactly as before.
    const day = await loadDay(MONDAY);
    expect(day.sports?.progress.completed).toBe(1);
  });

  it('records the day, an optional type and an optional note', async () => {
    const session = await logSession(MONDAY, { activityType: 'Laufen', note: 'Kurz' });
    expect(session.date).toBe(MONDAY);
    expect(session.activityType).toBe('Laufen');
    expect(session.note).toBe('Kurz');
    expect(session.performedAt).toBeTruthy();

    const bare = await logSession(MONDAY);
    expect(bare.activityType).toBeNull();
    expect(bare.note).toBeNull();
  });

  it('assigns no training days, only a count', async () => {
    // Three sessions all on one day still meet a three-a-week target: the
    // target is a quota, and the app never says which days to train.
    await logSession(MONDAY);
    await logSession(MONDAY);
    await logSession(MONDAY);
    const day = await loadDay(MONDAY);
    expect(day.sports?.progress.met).toBe(true);
    expect(day.sports?.progress.completed).toBe(3);
  });

  it('keeps a past week judged by the target it was lived under', async () => {
    await trainWeek(MONDAY, 2);
    freezeAt(addDays(MONDAY, 7));
    await setSportsTarget(SPORTS.MAX_TARGET_PER_WEEK);

    freezeAt(addDays(MONDAY, 21));
    const history = await loadHistory(MONDAY, addDays(MONDAY, 6));
    // Two of three, not two of seven.
    expect(history.sports[0]).toBeCloseTo(66.67, 1);
  });
});
