import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { EDIT_WINDOW_DAYS } from '../../core/config/constants';
import { addDays } from '../../core/dates';
import type { DomainType } from '../../core/model';
import { closeDatabase, deleteDatabase } from '../db';
import { loadBossProgression, type BossProgression } from './bossService';
import { logSession, saveAdherence, type SessionInput } from './checkInService';
import { applyOnboarding, enableDomain, setBossWeights } from './configurationService';

/**
 * Food and the Boss Rank.
 *
 * The Boss reads a ladder position and knows nothing about how a domain
 * produced it, so the cases below are not about Food's arithmetic — they are
 * about the three properties that adding a fourth domain must not break:
 * an unstarted domain contributes nothing, enabling one creates and destroys
 * no progress, and a weight change applies forward only.
 */

function freezeAt(day: string, hour = 9): void {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  setClock({ now: () => new Date(y, m - 1, d, hour, 0, 0) });
}

/** A Monday. */
const START = '2026-01-05';
const WEEKS = 8;
const END = addDays(START, WEEKS * 7 - 1);

beforeEach(async () => {
  await deleteDatabase();
  freezeAt(START);
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

async function rate(date: string, adherence: number) {
  freezeAt(date);
  await saveAdherence(date, adherence, null, date);
}

async function train(domain: 'gym' | 'running', date: string, input: SessionInput = {}) {
  freezeAt(date);
  await logSession(domain, date, input, date);
}

/** Two gym sessions and two runs a week, over the whole fixture. */
async function trainEveryWeek(domains: readonly ('gym' | 'running')[]) {
  for (let week = 0; week < WEEKS; week += 1) {
    const monday = addDays(START, week * 7);
    for (const offset of [0, 3]) {
      if (domains.includes('gym')) await train('gym', addDays(monday, offset));
      if (domains.includes('running')) {
        await train('running', addDays(monday, offset + 1), {
          distanceMetres: 5000,
          durationMinutes: 27 + week * 0.1,
        });
      }
    }
  }
}

/** A rated food day, every day of the fixture. */
async function rateEveryDay(value = 8) {
  for (let index = 0; index < WEEKS * 7; index += 1) {
    await rate(addDays(START, index), value);
  }
}

/** Today plus the days still inside the edit window — the open tail. */
const EDIT_WINDOW = EDIT_WINDOW_DAYS + 1;

/** Everything before the open tail: the days that are settled for good. */
const closedPrefix = <T>(values: readonly T[]): T[] => values.slice(0, -EDIT_WINDOW);

const load = async (reference = END): Promise<BossProgression> => {
  freezeAt(reference);
  return loadBossProgression(reference);
};

const domainOf = (boss: BossProgression, domain: DomainType) =>
  boss.domains.find((entry) => entry.domain === domain)!;

const contributions = (boss: BossProgression) => {
  const last = boss.points[boss.points.length - 1]!;
  return new Map(last.contributions.map((entry) => [entry.domain, entry.weight]));
};

/* ── An enabled but unused domain ───────────────────────────────────────── */

describe('Food switched on and never rated', () => {
  it('contributes nothing, and its weight leaves the denominator with it', async () => {
    await applyOnboarding({ questions: [], gymTargetPerWeek: 2, food: true });
    await trainEveryWeek(['gym']);

    const boss = await load();
    expect(domainOf(boss, 'food').started).toBe(false);
    const shares = contributions(boss);
    expect(shares.has('food')).toBe(false);
    // Gym carries the whole Boss, rather than being halved by an empty area.
    expect(shares.get('gym')).toBeCloseTo(1, 10);
  });

  it('is not a zero: every closed day matches a profile that never enabled Food', async () => {
    const run = async (food: boolean) => {
      await deleteDatabase();
      freezeAt(START);
      await applyOnboarding({
        questions: [],
        gymTargetPerWeek: 2,
        ...(food ? { food: true } : {}),
      });
      await trainEveryWeek(['gym']);
      return load();
    };

    const withFood = await run(true);
    const without = await run(false);

    // Bit-for-bit over every day that is closed. The tail is the edit window,
    // which the next case is about.
    expect(closedPrefix(withFood.points.map((point) => point.progress))).toEqual(
      closedPrefix(without.points.map((point) => point.progress)),
    );
    expect(closedPrefix(domainOf(withFood, 'gym').series)).toEqual(
      closedPrefix(domainOf(without, 'gym').series),
    );
  });

  it('leaves the day open while it can still be rated, as an unanswered question does', async () => {
    // Not a Food rule and not a leak: a day with something still answerable
    // is open for *every* domain, which is how Wellbeing has always behaved.
    // Postponing a day can only ever delay it counting, never cost anything,
    // and it resolves the moment the day is rated or closes.
    await applyOnboarding({ questions: [], gymTargetPerWeek: 2, food: true });
    await trainEveryWeek(['gym']);

    const boss = await load();
    const tail = boss.history.days.slice(-EDIT_WINDOW);
    expect(tail.every((day) => day.status === 'open')).toBe(true);
    expect(boss.history.days.slice(0, -EDIT_WINDOW).every((day) => day.status === 'scored')).toBe(
      true,
    );

    // Rating those days closes them again for everyone.
    for (const day of tail) await rate(day.date, 7);
    const settled = await load();
    expect(settled.history.days.every((day) => day.status === 'scored')).toBe(true);
  });
});

/* ── Food alone ─────────────────────────────────────────────────────────── */

describe('Food as the only domain', () => {
  it('drives the Boss on its own', async () => {
    await applyOnboarding({ questions: [], food: true });
    await rateEveryDay(9);

    const boss = await load();
    const food = domainOf(boss, 'food');
    expect(food.started).toBe(true);
    expect(contributions(boss).get('food')).toBeCloseTo(1, 10);
    expect(boss.progress).toBeGreaterThan(0);
  });

  it('falls when the days are bad and rises when they are good', async () => {
    await applyOnboarding({ questions: [], food: true });
    for (let index = 0; index < WEEKS * 7; index += 1) {
      await rate(addDays(START, index), index < (WEEKS * 7) / 2 ? 9 : 2);
    }
    const boss = await load();
    const points = boss.points;
    const half = Math.floor(points.length / 2);
    expect(points[half]!.progress).toBeGreaterThan(points[points.length - 1]!.progress);
  });
});

/* ── Food beside the training domains ───────────────────────────────────── */

describe('Food alongside training', () => {
  it('shares the Boss equally with Gym by default', async () => {
    await applyOnboarding({ questions: [], gymTargetPerWeek: 2, food: true });
    await trainEveryWeek(['gym']);
    await rateEveryDay();

    const shares = contributions(await load());
    expect(shares.get('food')).toBeCloseTo(0.5, 10);
    expect(shares.get('gym')).toBeCloseTo(0.5, 10);
  });

  it('shares the Boss equally with Running by default', async () => {
    await applyOnboarding({ questions: [], runningTargetPerWeek: 2, food: true });
    await trainEveryWeek(['running']);
    await rateEveryDay();

    const shares = contributions(await load());
    expect(shares.get('food')).toBeCloseTo(0.5, 10);
    expect(shares.get('running')).toBeCloseTo(0.5, 10);
  });

  it('takes a third each beside Gym and Running', async () => {
    await applyOnboarding({
      questions: [],
      gymTargetPerWeek: 2,
      runningTargetPerWeek: 2,
      food: true,
    });
    await trainEveryWeek(['gym', 'running']);
    await rateEveryDay();

    const boss = await load();
    const shares = contributions(boss);
    for (const domain of ['gym', 'running', 'food'] as const) {
      expect(shares.get(domain)).toBeCloseTo(1 / 3, 10);
    }
    expect(boss.domains.filter((entry) => entry.started)).toHaveLength(3);
  });
});

/* ── The promise the product owner asked for explicitly ─────────────────── */

describe('adding Food changes nothing about Gym or Running', () => {
  it('leaves both ratings, ranks and peaks bit-for-bit identical', async () => {
    const scenario = async (food: boolean) => {
      await deleteDatabase();
      freezeAt(START);
      await applyOnboarding({
        questions: [],
        gymTargetPerWeek: 2,
        runningTargetPerWeek: 2,
        ...(food ? { food: true } : {}),
      });
      await trainEveryWeek(['gym', 'running']);
      if (food) await rateEveryDay(3);
      const boss = await load();
      return {
        gym: domainOf(boss, 'gym'),
        running: domainOf(boss, 'running'),
        gymState: boss.gym,
        runningState: boss.running,
      };
    };

    const without = await scenario(false);
    const withFood = await scenario(true);

    for (const key of ['gym', 'running'] as const) {
      expect(withFood[key].momentum).toBeCloseTo(without[key].momentum, 10);
      expect(withFood[key].peakMomentum).toBeCloseTo(without[key].peakMomentum, 10);
      expect(withFood[key].rank.id).toBe(without[key].rank.id);
      expect(withFood[key].peakRank.id).toBe(without[key].peakRank.id);
      expect(withFood[key].series).toEqual(without[key].series);
    }
    // Deliberately a *poor* run of food days above: if Food leaked into the
    // training ratings at all, these would be lower.
    expect(withFood.gymState.rating).toBeCloseTo(without.gymState.rating, 10);
    expect(withFood.runningState.rating).toBeCloseTo(without.runningState.rating, 10);
  });

  it('cannot reach a single day that was lived before it was switched on', async () => {
    const switchOn = addDays(START, 21);

    const run = async (food: boolean) => {
      await deleteDatabase();
      freezeAt(START);
      await applyOnboarding({ questions: [], gymTargetPerWeek: 2 });
      await trainEveryWeek(['gym']);
      if (food) {
        freezeAt(switchOn);
        await enableDomain('food');
        await rate(switchOn, 10);
      }
      return load();
    };

    const withFood = await run(true);
    const without = await run(false);

    const index = withFood.history.days.findIndex((day) => day.date === switchOn);
    expect(index).toBeGreaterThan(0);

    // Every Boss value before the switch-on day is unchanged, to the last bit.
    // An upgrade, or a new area, neither creates progress nor destroys it.
    expect(withFood.points.slice(0, index).map((point) => point.progress)).toEqual(
      without.points.slice(0, index).map((point) => point.progress),
    );
    // And Food appears in the weighting only from that day.
    expect(
      withFood.points
        .slice(0, index)
        .every((point) => !point.contributions.some((entry) => entry.domain === 'food')),
    ).toBe(true);
    expect(
      withFood.points[index]!.contributions.some((entry) => entry.domain === 'food'),
    ).toBe(true);
  });
});

/* ── Weights ────────────────────────────────────────────────────────────── */

describe('weighting Food', () => {
  it('honours unequal weights', async () => {
    await applyOnboarding({ questions: [], gymTargetPerWeek: 2, food: true });
    freezeAt(START);
    await setBossWeights({ gym: 3, food: 1 });
    await trainEveryWeek(['gym']);
    await rateEveryDay();

    const shares = contributions(await load());
    expect(shares.get('gym')).toBeCloseTo(0.75, 10);
    expect(shares.get('food')).toBeCloseTo(0.25, 10);
  });

  it('applies a weight change forward only, never to a day already lived', async () => {
    await applyOnboarding({ questions: [], gymTargetPerWeek: 2, food: true });
    await trainEveryWeek(['gym']);
    await rateEveryDay();

    const before = await load();
    const midpoint = Math.floor(before.points.length / 2);
    const historicalProgress = before.points[midpoint]!.progress;
    const historicalShares = before.points[midpoint]!.contributions.map((entry) => ({
      domain: entry.domain,
      weight: entry.weight,
    }));

    // Long after those days were lived.
    freezeAt(END);
    await setBossWeights({ gym: 9, food: 1 });
    const after = await load();

    expect(after.points[midpoint]!.progress).toBeCloseTo(historicalProgress, 10);
    expect(
      after.points[midpoint]!.contributions.map((entry) => ({
        domain: entry.domain,
        weight: entry.weight,
      })),
    ).toEqual(historicalShares);
    // And today does move.
    expect(contributions(after).get('gym')).toBeCloseTo(0.9, 10);
  });

  it('never lets a domain be weighted out of existence without switching it off', async () => {
    await applyOnboarding({ questions: [], gymTargetPerWeek: 2, food: true });
    freezeAt(START);
    await setBossWeights({ gym: 1000, food: 0.0001 });
    await trainEveryWeek(['gym']);
    await rateEveryDay();

    const share = contributions(await load()).get('food') ?? 0;
    expect(share).toBeGreaterThan(0);
  });
});
