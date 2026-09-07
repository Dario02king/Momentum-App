import { today } from '../../core/clock';
import type { DateKey } from '../../core/dates';
import {
  BOSS_PROGRESS_MAX,
  bossEraOf,
  bossPointFor,
  ratingToProgress,
  type BossEra,
  type BossPoint,
} from '../../core/boss';
import { DOMAIN_TYPES } from '../../core/domains';
import { buildLedger, type DomainLedger } from '../../core/ledger';
import type { DomainType, ConfigSnapshotRecord } from '../../core/model';
import { compareDateKeys } from '../../core/dates';
import type { DayState } from '../../core/rating';
import { rankHistory, rankForRating, type Rank, type RankChange } from '../../core/ranks';
import type { XpDay, XpWeek } from '../../core/scoring/xp';
import { configSnapshotsRepository } from '../repositories';
import type { History } from './historyService';
import { loadProgression, progressionOrigin, type Progression } from './ratingService';

/**
 * Per-domain progression and the Boss Rank above it.
 *
 * Replayed, never stored — the same rule as everything else derived. Adding
 * this service does not change what RC2 already computes: `loadProgression`
 * still produces the one undivided progression a pre-iteration-2 profile had,
 * and that series is what the Boss uses for every day that predates the
 * upgrade. Nothing here can move a number a user has already seen.
 *
 * ## The two eras
 *
 * Each day resolves to the config snapshot in force on it, and that snapshot
 * decides how the Boss is computed for that day:
 *
 * - **No `boss` field** — the snapshot was written by RC2. That day had one
 *   progression covering everything the user did, so the Boss for it *is*
 *   that progression. This is what grandfathering means in practice: it is
 *   not a carried-over number seeded at the boundary, it is the same replay,
 *   so pre-upgrade Boss history is exactly what RC2 showed and cannot drift.
 * - **Weights present** — the Boss is the weighted mean of the ladder
 *   positions of the domains enabled on that day.
 *
 * The two are different quantities, so a user who had RC2's Sport domain and
 * splits it into Gym and Running will see the Boss step at the boundary. That
 * step is forward-only by construction, and converting the legacy sessions
 * (rather than keeping them) is what keeps it small, because the Gym or
 * Running ledger then replays the same sessions the old rating was built on.
 */

export interface DomainProgression extends DomainLedger {
  /** Ladder position on each day, aligned with the history days. */
  series: number[];
}

export interface BossProgression {
  origin: DateKey;
  /** One Boss point per day, aligned with `history.days`. */
  points: BossPoint[];
  /** Ladder position today, 0–8. */
  progress: number;
  rank: Rank;
  peakRank: Rank;
  changes: RankChange[];
  /** Lifetime XP across every domain — one number, never per domain. */
  lifetimeXp: number;
  domains: DomainProgression[];
  /** The era today's Boss was computed in, for the "why this number" panel. */
  era: BossEra['era'];
  history: History;
  /** The undivided RC2 progression, still the source for pre-upgrade days. */
  legacy: Progression;
}

/** Which era each day belongs to, resolved once rather than per domain. */
function eraByDate(
  snapshots: ConfigSnapshotRecord[],
  dates: readonly DateKey[],
): BossEra[] {
  const eras: BossEra[] = [];
  let index = 0;
  let current: BossEra = { era: 'legacy' };
  for (const date of dates) {
    while (
      index < snapshots.length &&
      compareDateKeys(snapshots[index]!.effectiveFrom, date) <= 0
    ) {
      current = bossEraOf(snapshots[index]!.config);
      index += 1;
    }
    eras.push(current);
  }
  return eras;
}

/**
 * One domain's day states, taken from the already-scored history.
 *
 * A domain absent from a day's scores was not enabled then, and that day is
 * neutral for it — never a zero. That is what lets a user switch Running on
 * in June without June's ledger being dragged down by a spring it was not
 * asked about.
 */
function domainDayStates(history: History, domain: DomainType): DayState[] {
  return history.days.map((day) => {
    const entry = day.domains.find((candidate) => candidate.domain === domain);
    if (!entry) {
      return {
        date: day.date,
        status: 'neutral',
        score: null,
        recordedScore: null,
        dueItems: 0,
        answeredItems: 0,
        recorded: false,
        complete: false,
      };
    }
    /*
     * The day's own status is inherited rather than recomputed per domain: an
     * open day is one the user can still finish, and that is a property of the
     * day, not of one area of it. Inheriting it can only postpone a day being
     * counted, never bring it forward, so it cannot cost anyone anything.
     *
     * For a weekly-quota domain, `itemsAnswered` is the week's session count,
     * so a rest day inside a training week reads as recorded — which is the
     * point of a weekly target, and why it does not decay.
     */
    return {
      date: day.date,
      status: day.status,
      score: entry.score,
      recordedScore: entry.score,
      dueItems: entry.itemsDue,
      answeredItems: entry.itemsAnswered,
      recorded: entry.itemsAnswered > 0,
      complete: entry.itemsDue > 0 && entry.itemsAnswered >= entry.itemsDue,
    };
  });
}

function domainXp(history: History, domain: DomainType): { days: XpDay[]; weeks: XpWeek[] } {
  const days: XpDay[] = history.days.map((day) => {
    const entry = day.domains.find((candidate) => candidate.domain === domain);
    return {
      answeredItems: entry && domain === 'mental' ? entry.itemsAnswered : 0,
      complete: entry ? entry.itemsDue > 0 && entry.itemsAnswered >= entry.itemsDue : false,
      counts: day.status === 'scored' && entry !== undefined,
    };
  });

  const weeks: XpWeek[] = history.weeks.map((week) => {
    const entry = week.domains.find((candidate) => candidate.domain === domain);
    return {
      sessions: entry?.sessions ?? 0,
      met: entry?.met ?? false,
      inProgress: week.inProgress,
    };
  });

  return { days, weeks };
}

export async function loadBossProgression(
  reference: DateKey = today(),
): Promise<BossProgression> {
  const origin = await progressionOrigin();
  const [legacy, snapshots] = await Promise.all([
    loadProgression(reference),
    configSnapshotsRepository.list(),
  ]);
  const history = legacy.history;
  const dates = history.days.map((day) => day.date);

  const domains: DomainProgression[] = DOMAIN_TYPES.map((domain) => {
    const xp = domainXp(history, domain);
    const ledger = buildLedger({
      domain,
      days: domainDayStates(history, domain),
      xpDays: xp.days,
      xpWeeks: xp.weeks,
    });
    return { ...ledger, series: ledger.points.map((point) => ratingToProgress(point.rating)) };
  });

  const started = new Map(domains.map((domain) => [domain.domain, domain.started]));
  const eras = eraByDate(snapshots, dates);
  const legacySeries = legacy.points.map((point) => ratingToProgress(point.rating));

  const points: BossPoint[] = dates.map((_, index) => {
    const progressByDomain: Partial<Record<DomainType, number | null>> = {};
    for (const domain of domains) {
      // A domain the user has never used contributes nothing rather than a
      // starting rating: enabling Food tomorrow must not halve a year of
      // Wellbeing on its first day.
      progressByDomain[domain.domain] = started.get(domain.domain)
        ? (domain.series[index] ?? null)
        : null;
    }
    return bossPointFor(eras[index] ?? { era: 'legacy' }, progressByDomain, legacySeries[index] ?? null);
  });

  const ranks = rankHistory(
    points.map((point, index) => ({ date: dates[index]!, rating: point.rating })),
  );
  const peakRating = points.reduce((max, point) => Math.max(max, point.rating), 0);
  const last = points[points.length - 1];

  return {
    origin,
    points,
    progress: last?.progress ?? 0,
    rank: ranks.current,
    peakRank: ranks.peak.index >= ranks.current.index ? ranks.peak : rankForRating(peakRating),
    changes: ranks.changes,
    // One lifetime total, not four: XP answers "how much have I done", and
    // the answer to that question is not per domain.
    lifetimeXp: legacy.lifetimeXp,
    domains,
    era: last ? last.era : 'legacy',
    history,
    legacy,
  };
}

export { BOSS_PROGRESS_MAX };
