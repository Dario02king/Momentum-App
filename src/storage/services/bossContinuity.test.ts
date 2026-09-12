import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { ratingToProgress } from '../../core/boss';
import { closeDatabase, deleteDatabase } from '../db';
import { settingsRepository } from '../repositories';
import { ensureCurrentSnapshot } from '../configService';
import { importBackup } from './backupService';
import { loadBossProgression, type BossProgression } from './bossService';
import { loadProgression } from './ratingService';
import { applyLegacySportChoice } from './legacySportService';

/**
 * The rule this file exists for: **an application upgrade alone must not
 * create progress or take progress away.**
 *
 * The profile is 120 real days of RC2 history, replayed under the new build.
 * What is asserted is not that the Boss looks reasonable afterwards, but that
 * the day the aggregation model changed is indistinguishable from any other
 * day in the user's history.
 */

const synthetic = readFileSync(
  new URL('../../../.github/fixtures/rc2-synthetic.json', import.meta.url),
  'utf8',
);

/** The fixture's last day of data, and the day before the upgrade lands. */
const LAST_LEGACY_DAY = '2026-08-31';

function at(day: string, hour = 9): Date {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, date, hour, 0, 0);
}

async function seed(): Promise<void> {
  const result = await importBackup(synthetic);
  if (!result.ok) throw new Error(result.details.join('; '));
  await settingsRepository.update({ legacySportMigration: 'pending' });
}

const indexOf = (boss: BossProgression, day: string): number =>
  boss.history.days.findIndex((entry) => entry.date === day);

beforeEach(async () => {
  await deleteDatabase();
  setClock({ now: () => at(LAST_LEGACY_DAY) });
  await seed();
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

describe('before the upgrade lands', () => {
  it('is the RC2 progression and nothing else', async () => {
    const [legacy, boss] = await Promise.all([loadProgression(), loadBossProgression()]);
    expect(boss.era).toBe('legacy');
    expect(boss.transition).toBeNull();
    boss.points.forEach((point, index) => {
      expect(point.rating).toBeCloseTo(legacy.points[index]!.rating, 12);
    });
  });
});

describe('the day the upgrade lands', () => {
  /**
   * The upgrade is not a code path anyone calls; it is the first time this
   * build writes a config snapshot, which now carries Boss weights. Any
   * configuration touch does it, so this is what a real user's device does
   * the first time they open the app after updating.
   */
  async function upgradeOn(day: string): Promise<{ before: BossProgression; after: BossProgression }> {
    setClock({ now: () => at(LAST_LEGACY_DAY) });
    const before = await loadBossProgression();
    setClock({ now: () => at(day) });
    await ensureCurrentSnapshot();
    const after = await loadBossProgression();
    return { before, after };
  }

  it('continues from the final RC2 value, to numerical equality', async () => {
    // The assertion the continuity rule reduces to: the baseline the new era
    // starts from *is* the last value the old era produced. Not close to it,
    // not smoothed towards it — the same number.
    const { before, after } = await upgradeOn('2026-09-01');
    const legacy = await loadProgression();

    expect(after.transition?.from).toBe('legacy');
    expect(after.transition?.date).toBe('2026-09-01');

    const lastLegacy = indexOf(after, LAST_LEGACY_DAY);
    expect(after.transition?.anchorProgress).toBe(before.points[lastLegacy]!.progress);
    expect(after.transition?.anchorProgress).toBe(
      ratingToProgress(legacy.points[lastLegacy]!.rating),
    );
  });

  it('leaves every day before it exactly as it was', async () => {
    const { before, after } = await upgradeOn('2026-09-01');
    const lastLegacy = indexOf(after, LAST_LEGACY_DAY);
    for (let index = 0; index <= lastLegacy; index += 1) {
      expect(after.points[index]!.progress).toBe(before.points[index]!.progress);
      expect(after.points[index]!.era).toBe('legacy');
    }
  });

  it('moves on the day itself only by what the domains moved', async () => {
    const { after } = await upgradeOn('2026-09-01');
    const transition = after.transition!;
    const point = after.points[transition.index]!;
    expect(point.progress).toBeCloseTo(transition.anchorProgress + point.movement, 12);
    // Wellbeing carried on from the day before, so the movement is one
    // ordinary day's worth — not a change of standing.
    expect(Math.abs(point.movement)).toBeLessThan(0.1);
  });

  it('takes no lifetime XP away and loses no peak rank', async () => {
    const { before, after } = await upgradeOn('2026-09-01');
    expect(after.lifetimeXp).toBeGreaterThanOrEqual(before.lifetimeXp);
    expect(after.peakRank.index).toBeGreaterThanOrEqual(before.peakRank.index);
    expect(after.rank.id).toBe(before.rank.id);
  });

  it('does the same when the legacy sessions are converted to Gym', async () => {
    // The branch that changes most: Sport retires, Gym starts, and the Boss
    // gains a second contributor. None of that may move the anchor.
    setClock({ now: () => at(LAST_LEGACY_DAY) });
    const before = await loadBossProgression();
    setClock({ now: () => at('2026-09-01') });
    await applyLegacySportChoice('gym');
    const after = await loadBossProgression();

    const lastLegacy = indexOf(after, LAST_LEGACY_DAY);
    expect(after.transition?.anchorProgress).toBe(before.points[lastLegacy]!.progress);
    expect(after.lifetimeXp).toBeGreaterThanOrEqual(before.lifetimeXp);
    expect(after.peakRank.index).toBeGreaterThanOrEqual(before.peakRank.index);
    for (let index = 0; index <= lastLegacy; index += 1) {
      expect(after.points[index]!.progress).toBe(before.points[index]!.progress);
    }
  });
});

describe('after the upgrade', () => {
  it('moves by the weighted movement of the domain ledgers, day by day', async () => {
    setClock({ now: () => at('2026-09-01') });
    await applyLegacySportChoice('gym');
    setClock({ now: () => at('2026-09-20') });
    const boss = await loadBossProgression();
    const transition = boss.transition!;

    let moved = false;
    for (let index = transition.index + 1; index < boss.points.length; index += 1) {
      const point = boss.points[index]!;
      // Recomputed from the per-domain series the same result was built from,
      // which is what proves the wiring and not merely the formula.
      const expected = point.contributions.reduce((sum, entry) => {
        const domain = boss.domains.find((candidate) => candidate.domain === entry.domain)!;
        return sum + entry.weight * (domain.series[index]! - domain.series[index - 1]!);
      }, 0);
      expect(point.movement).toBeCloseTo(expected, 12);
      expect(point.progress).toBeCloseTo(
        Math.min(8, Math.max(0, boss.points[index - 1]!.progress + point.movement)),
        12,
      );
      if (Math.abs(point.movement) > 1e-9) moved = true;
    }
    // A test that proved a series of zeroes would prove nothing.
    expect(moved).toBe(true);
  });

  it('gives every enabled, started domain the share its weights say', async () => {
    setClock({ now: () => at('2026-09-01') });
    await applyLegacySportChoice('gym');
    setClock({ now: () => at('2026-09-20') });
    const boss = await loadBossProgression();
    const last = boss.points[boss.points.length - 1]!;
    expect(last.era).toBe('weighted');
    expect(last.contributions.map((entry) => entry.domain).sort()).toEqual(['gym', 'mental']);
    // Equal weights by default, and they are shares of the contributors.
    for (const entry of last.contributions) expect(entry.weight).toBeCloseTo(0.5, 10);
  });

  it('never invents history for a domain that has none', async () => {
    // Boss continuity and domain-history truth are separate concerns. Gym
    // starts when Gym starts; Running and Food have no history at all and are
    // not given the user's overall rank as a stand-in for one.
    setClock({ now: () => at('2026-09-01') });
    await applyLegacySportChoice('gym');
    setClock({ now: () => at('2026-09-20') });
    const boss = await loadBossProgression();

    const running = boss.domains.find((domain) => domain.domain === 'running')!;
    const food = boss.domains.find((domain) => domain.domain === 'food')!;
    expect(running.started).toBe(false);
    expect(food.started).toBe(false);
    expect(running.active.some(Boolean)).toBe(false);
    expect(food.active.some(Boolean)).toBe(false);

    const gym = boss.domains.find((domain) => domain.domain === 'gym')!;
    const firstGymDay = gym.active.findIndex(Boolean);
    // Not one day before the domain existed.
    expect(boss.history.days[firstGymDay]!.date >= '2026-09-01').toBe(true);

    const mental = boss.domains.find((domain) => domain.domain === 'mental')!;
    // Wellbeing's own history is genuinely its own, and it is not the
    // overall rank copied across either.
    expect(mental.started).toBe(true);
    expect(mental.momentum).not.toBe(boss.legacy.current);
  });
});
