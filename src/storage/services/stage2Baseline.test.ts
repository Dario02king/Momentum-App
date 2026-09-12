import 'fake-indexeddb/auto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import type { DateKey } from '../../core/dates';
import { canonical, canonicalJson } from '../../testing/canonical';
import { closeDatabase, deleteDatabase } from '../db';
import { exportBackup, importBackup } from './backupService';
import { loadBossProgression, type BossProgression } from './bossService';
import { BREAK_LAST, LAST, at, currentProfile, trainingBreakProfile } from './fixtures/profiles';

/**
 * The Stage 2 golden baseline: every number the rating engine produces,
 * frozen **before** the domain rank was removed from it.
 *
 * `domainOutputs.test.ts` pins a hash; this file pins the values, so a
 * difference is readable rather than merely detected. Four profiles are
 * replayed at a fixed clock and serialised in full — the Boss series, rank,
 * peak, XP and rank history; each domain's rating series, momentum, peak and
 * ladder position (its Boss contribution); the Gym and Running states down to
 * every day's target, attendance, performance, movement and decay; and the
 * whole reconstructed history. The fixtures under `.github/fixtures/stage2/`
 * were written by this file from the unmodified implementation and are then
 * never regenerated: a later commit that changes one value fails here.
 *
 * Nothing is rounded. Equality is exact, and a 1-ULP drift is a failure.
 *
 * To (re)capture: `UPDATE_STAGE2_BASELINE=1 npx vitest run stage2Baseline`.
 * That is a deliberate act with a commit of its own, never a fix for a red
 * test.
 */

const fixtureDir = new URL('../../../.github/fixtures/stage2/', import.meta.url);
const legacyFixture = (name: string) =>
  readFileSync(new URL(`../../../.github/fixtures/${name}`, import.meta.url), 'utf8');

const PROFILES: { name: string; file: string; load(): string; clock: DateKey }[] = [
  { name: 'the real RC2 export', file: 'rc2-export.baseline.json', load: () => legacyFixture('rc2-export.json'), clock: '2026-09-07' },
  { name: 'the synthetic RC2 history', file: 'rc2-synthetic.baseline.json', load: () => legacyFixture('rc2-synthetic.json'), clock: '2026-08-31' },
  { name: 'a four-domain profile under the current models', file: 'current.baseline.json', load: () => currentProfile(), clock: LAST },
  { name: 'a four-domain profile with two training breaks', file: 'training-break.baseline.json', load: trainingBreakProfile, clock: BREAK_LAST },
];

/**
 * What the replay produces: everything Stage 2 promises to keep
 * byte-identical.
 *
 * The fixture files also carry a `domainRanks` section — the rank, peak
 * rank, rank changes and per-domain XP the removed domain-rank system used
 * to compute, captured in commit 1 as a record of what it said. Since commit
 * 3 the ledger no longer carries any of it, so that section is not compared;
 * it stays in the files as the historical answer.
 */
export function baselineOf(boss: BossProgression) {
  const { history, legacy, gym, running, domains } = boss;
  const { history: _legacyHistory, ...legacyRest } = legacy;
  return {
    continuity: {
      boss: {
        origin: boss.origin,
        era: boss.era,
        progress: boss.progress,
        rank: boss.rank.id,
        peakRank: boss.peakRank.id,
        lifetimeXp: boss.lifetimeXp,
        changes: boss.changes,
        transition: boss.transition,
        points: boss.points,
      },
      domains: domains.map((domain) => ({
        domain: domain.domain,
        momentum: domain.momentum,
        peakMomentum: domain.peakMomentum,
        progress: domain.progress,
        started: domain.started,
        series: domain.series,
        active: domain.active,
        points: domain.points,
      })),
      gym,
      running,
      history,
      legacy: { ...legacyRest, rank: legacy.rank.id, peakRank: legacy.peakRank.id },
    },
  };
}

interface Frozen extends ReturnType<typeof baselineOf> {
  domainRanks?: unknown;
}

async function replay(load: () => string, clock: DateKey): Promise<ReturnType<typeof baselineOf>> {
  await deleteDatabase();
  setClock({ now: () => at(clock) });
  const result = await importBackup(load());
  if (!result.ok) throw new Error(result.details.join('; '));
  return baselineOf(await loadBossProgression());
}

function readBaseline(file: string): Frozen {
  const path = fileURLToPath(new URL(file, fixtureDir));
  if (!existsSync(path)) throw new Error(`No Stage 2 baseline at ${path}; capture it from the unmodified engine first`);
  return JSON.parse(readFileSync(path, 'utf8')) as Frozen;
}

describe('the Stage 2 golden baseline', () => {
  afterEach(async () => {
    setClock(null);
    await closeDatabase();
  });

  for (const profile of PROFILES) {
    it(`${profile.name} replays to the frozen baseline, value for value`, async () => {
      const actual = canonical(await replay(profile.load, profile.clock)) as ReturnType<typeof baselineOf>;
      if (process.env.UPDATE_STAGE2_BASELINE) {
        writeFileSync(fileURLToPath(new URL(profile.file, fixtureDir)), canonicalJson(actual));
        return;
      }
      const expected = readBaseline(profile.file);
      // Section by section, so a difference names the number rather than
      // producing a diff the size of the file.
      expect(actual.continuity.boss).toEqual(expected.continuity.boss);
      expect(actual.continuity.domains).toEqual(expected.continuity.domains);
      expect(actual.continuity.gym).toEqual(expected.continuity.gym);
      expect(actual.continuity.running).toEqual(expected.continuity.running);
      expect(actual.continuity.history).toEqual(expected.continuity.history);
      expect(actual.continuity.legacy).toEqual(expected.continuity.legacy);
      // And the whole text, so nothing added later can slip past the sections.
      expect(canonicalJson(actual.continuity)).toBe(canonicalJson(expected.continuity));
      // The removed system's answer is still on file, and is not recomputed.
      expect(expected.domainRanks).toBeDefined();
      expect(Object.keys(actual)).toEqual(['continuity']);
    });

    it(`${profile.name} survives its own export and re-import unchanged`, async () => {
      const before = await replay(profile.load, profile.clock);
      const exported = JSON.stringify(await exportBackup());
      await closeDatabase();
      const after = await replay(() => exported, profile.clock);
      expect(canonicalJson(after)).toBe(canonicalJson(before));
    });
  }
});
