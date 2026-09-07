import { BOSS, RATING } from '../config/constants';
import { RANK_LIST, nextRank, rankForRating, type Rank } from '../ranks';
import type { AppConfigSnapshot, DomainType } from '../model';
import { DOMAIN_TYPES, enabledDomainsIn } from '../domains';

/**
 * Boss Rank (D2, D3).
 *
 * The Boss is not a fifth rating with rules of its own. It is a weighted mean
 * of how far each active domain has climbed **the one shared ladder**, which
 * is why it needs no thresholds, no separate decay and no separate
 * calibration: everything it inherits is already tested.
 *
 * The scale it averages on is the ladder position, not the rating. Averaging
 * ratings would let the *shape* of the tier boundaries distort the mean —
 * Rookie spans 120 points and Champion spans 120 too, but Legend spans the
 * last 50, so equal rating gaps are not equal amounts of climbing. Position
 * on the ladder is the quantity a user actually experiences.
 *
 * ## Forward-only weighting
 *
 * D3 says a weight change applies forward only and never rewrites history.
 * That is not implemented here as an append-only Boss log; it falls out of
 * the mechanism Momentum already has. Weights live in the config snapshot, the
 * replay evaluates every day against the snapshot in force on that day, so
 * editing weights today changes what today means and cannot reach January.
 * There is nothing stored that could drift from what is replayed.
 */

/** The ladder has this many tiers, so progress runs from 0 to 8. */
export const BOSS_PROGRESS_MAX = RANK_LIST.length;

/**
 * Where a rating sits on one continuous 0–8 scale: rank index plus the
 * fraction climbed towards the next rank.
 *
 * Legend is the top tier and has no "next" threshold, so the fraction there
 * is measured across the rest of the rating range. Without that, every
 * Legend would sit at exactly 7.0 and further progress would stop counting
 * towards the Boss the moment one domain maxed out.
 */
export function ratingToProgress(rating: number): number {
  const clamped = Math.min(RATING.MAX, Math.max(RATING.MIN, rating));
  const rank = rankForRating(clamped);
  const next = nextRank(rank);
  const span = next ? next.min - rank.min : RATING.MAX - rank.min;
  if (span <= 0) return rank.index;
  const fraction = Math.min(1, Math.max(0, (clamped - rank.min) / span));
  return rank.index + fraction;
}

/**
 * The inverse, so the Boss can be handed to the existing rank machinery.
 *
 * Hysteresis, the sustained-demotion rule and the rank-history walk are all
 * written against a 0–1000 rating and are already proven. Converting back
 * costs one function and means the Boss cannot flicker at a boundary or lose
 * a tier to a single bad day through some second implementation of rules
 * that already exist.
 */
export function progressToRating(progress: number): number {
  const clamped = Math.min(BOSS_PROGRESS_MAX, Math.max(0, progress));
  const index = Math.min(RANK_LIST.length - 1, Math.floor(clamped));
  const rank = RANK_LIST[index]!;
  const next = nextRank(rank);
  const span = next ? next.min - rank.min : RATING.MAX - rank.min;
  return Math.min(RATING.MAX, rank.min + (clamped - index) * span);
}

export function rankForProgress(progress: number): Rank {
  return rankForRating(progressToRating(progress));
}

/* ── Weights ───────────────────────────────────────────────────────────── */

export type BossWeights = Partial<Record<DomainType, number>>;

/** Equal shares over whatever is enabled — the default until the user tunes it. */
export function equalWeights(domains: readonly DomainType[]): BossWeights {
  if (domains.length === 0) return {};
  const share = 1 / domains.length;
  const weights: BossWeights = {};
  for (const domain of domains) weights[domain] = share;
  return weights;
}

/**
 * Rescales user-chosen weights so they sum to 1 over the domains given.
 *
 * The user sets **relative importance**, not a budget that has to add up —
 * being asked to make four sliders total exactly 100 is a spreadsheet, not a
 * setting. "Gym matters three times as much as Food" is the input; the shares
 * are arithmetic.
 *
 * Two guards. A domain absent from `raw`, or given a non-positive weight,
 * falls back to an equal share, so it never silently disappears from the
 * Boss. And no domain ends below `BOSS.MIN_WEIGHT` of the total: a share of
 * half a per cent is a domain the user has effectively switched off without
 * switching it off, which is a setting that already exists and says so.
 */
export function normaliseWeights(raw: BossWeights, domains: readonly DomainType[]): BossWeights {
  if (domains.length === 0) return {};

  const equalShare = 1 / domains.length;
  const chosen = domains.map((domain) => {
    const value = raw[domain];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : equalShare;
  });

  const total = chosen.reduce((sum, value) => sum + value, 0);
  let shares = chosen.map((value) => (total > 0 ? value / total : equalShare));

  /*
   * Lift anything under the floor and rescale the rest to fit what is left.
   * Doing it once can push another share under the floor, so it repeats — at
   * most as many times as there are domains, which is four.
   */
  const floor = Math.min(BOSS.MIN_WEIGHT, equalShare);
  for (let pass = 0; pass < domains.length; pass += 1) {
    const below = shares.map((share) => share < floor);
    if (!below.some(Boolean)) break;
    const available = 1 - below.filter(Boolean).length * floor;
    const restTotal = shares.reduce(
      (sum, share, index) => (below[index] ? sum : sum + share),
      0,
    );
    const restCount = below.filter((flag) => !flag).length;
    shares = shares.map((share, index) => {
      if (below[index]) return floor;
      if (restTotal > 0) return (share / restTotal) * available;
      return restCount > 0 ? available / restCount : share;
    });
  }

  const weights: BossWeights = {};
  domains.forEach((domain, index) => {
    weights[domain] = shares[index]!;
  });
  return weights;
}

/**
 * Which era a day belongs to.
 *
 * - `legacy` — the snapshot in force predates iteration 2 and carries no
 *   Boss weights at all. Those days had one undivided progression, and the
 *   Boss for them is exactly the number RC2 showed. This is what
 *   "grandfathered" means, and it is why an upgrade cannot move a single day
 *   of anyone's existing history.
 * - `weighted` — the snapshot names weights, and the Boss is their mean.
 */
export type BossEra =
  | { era: 'legacy' }
  | { era: 'weighted'; weights: BossWeights; domains: DomainType[] };

export function bossEraOf(snapshot: AppConfigSnapshot): BossEra {
  if (!snapshot.boss) return { era: 'legacy' };
  const domains = enabledDomainsIn(snapshot);
  return {
    era: 'weighted',
    domains,
    weights: normaliseWeights(snapshot.boss.weights, domains),
  };
}

/** The weights to write into a new snapshot, given what the user has chosen. */
export function weightsForSnapshot(raw: BossWeights, domains: readonly DomainType[]): BossWeights {
  return normaliseWeights(raw, domains);
}

/* ── Aggregation ───────────────────────────────────────────────────────── */

export interface BossContribution {
  domain: DomainType;
  /** Ladder position, 0–8. */
  progress: number;
  /** Share of the Boss, after normalisation. */
  weight: number;
}

export interface BossPoint {
  /** Ladder position of the Boss itself, 0–8. */
  progress: number;
  /** The same point expressed as a rating, for the rank machinery. */
  rating: number;
  contributions: BossContribution[];
  era: BossEra['era'];
}

/**
 * One day of Boss progress.
 *
 * A domain with no progression yet — enabled today, never used — contributes
 * nothing rather than a zero, and its weight leaves the denominator with it.
 * Counting it as zero would mean that switching Food on tomorrow instantly
 * halves a year of Wellbeing, which is a punishment for adding a goal.
 */
export function bossPointFor(
  era: BossEra,
  progressByDomain: Partial<Record<DomainType, number | null>>,
  legacyProgress: number | null,
): BossPoint {
  if (era.era === 'legacy') {
    const progress = legacyProgress ?? 0;
    return {
      progress,
      rating: progressToRating(progress),
      contributions: [],
      era: 'legacy',
    };
  }

  const contributions: BossContribution[] = [];
  let weighted = 0;
  let total = 0;
  for (const domain of era.domains) {
    const progress = progressByDomain[domain];
    if (progress === null || progress === undefined) continue;
    const weight = era.weights[domain] ?? 0;
    if (weight <= 0) continue;
    contributions.push({ domain, progress, weight });
    weighted += progress * weight;
    total += weight;
  }

  const progress = total > 0 ? weighted / total : 0;
  return {
    progress,
    rating: progressToRating(progress),
    contributions: contributions.map((entry) => ({
      ...entry,
      weight: total > 0 ? entry.weight / total : 0,
    })),
    era: 'weighted',
  };
}

/** Every domain that could contribute, for a settings screen to enumerate. */
export const BOSS_DOMAINS: DomainType[] = DOMAIN_TYPES;
