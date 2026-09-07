import { RANKS, RANK_DEMOTION_HYSTERESIS, type RankId } from '../config/constants';

/**
 * The rank ladder (§15).
 *
 * Eight ranks, no divisions. Names stay English in both language modes, so
 * they live with the configuration rather than in the string layer.
 */

export interface Rank {
  id: RankId;
  name: string;
  min: number;
  /** Position on the ladder, 0 for Rookie. */
  index: number;
}

export const RANK_LIST: Rank[] = RANKS.map((rank, index) => ({ ...rank, index }));

export function rankById(id: RankId): Rank {
  return RANK_LIST.find((rank) => rank.id === id) ?? RANK_LIST[0]!;
}

/** The rank a rating falls in, ignoring where the user is coming from. */
export function rankForRating(rating: number): Rank {
  let match = RANK_LIST[0]!;
  for (const rank of RANK_LIST) {
    if (rating >= rank.min) match = rank;
    else break;
  }
  return match;
}

/**
 * The rank to actually display, given the one currently held.
 *
 * Promotion happens as soon as the threshold is crossed. Demotion requires
 * the rating to fall a few points *below* the threshold, so a user hovering
 * on a boundary does not flicker between two ranks from one day to the next.
 */
export function rankWithHysteresis(
  rating: number,
  currentRankId: RankId | null,
  hysteresis: number = RANK_DEMOTION_HYSTERESIS,
): Rank {
  const natural = rankForRating(rating);
  if (currentRankId === null) return natural;
  const current = rankById(currentRankId);
  if (natural.index >= current.index) return natural;
  // Below the current rank: hold it until the rating clears the buffer.
  if (rating >= current.min - hysteresis) return current;
  // Fell further than the buffer — but never past where the rating truly is.
  return rankForRating(rating);
}

export function nextRank(rank: Rank): Rank | null {
  return RANK_LIST[rank.index + 1] ?? null;
}

/** How far through the current tier the rating sits, from 0 to 1. */
export function progressWithinRank(rating: number, rank: Rank = rankForRating(rating)): number {
  const next = nextRank(rank);
  if (!next) return 1;
  const span = next.min - rank.min;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (rating - rank.min) / span));
}

export function pointsToNextRank(rating: number): number | null {
  const next = nextRank(rankForRating(rating));
  return next ? Math.max(0, Math.ceil(next.min - rating)) : null;
}

export interface RankChange {
  date: string;
  kind: 'promotion' | 'demotion';
  from: RankId | null;
  to: RankId;
  rating: number;
}

/**
 * Walks a rating series and reports the crossings, applying hysteresis as it
 * goes so the log matches what the user actually saw.
 */
export function rankHistory(series: { date: string; rating: number }[]): {
  changes: RankChange[];
  current: Rank;
  peak: Rank;
} {
  let current: Rank | null = null;
  let peak: Rank = RANK_LIST[0]!;
  const changes: RankChange[] = [];

  for (const point of series) {
    const next = rankWithHysteresis(point.rating, current?.id ?? null);
    if (current === null) {
      current = next;
      peak = next;
      continue;
    }
    if (next.index !== current.index) {
      changes.push({
        date: point.date,
        kind: next.index > current.index ? 'promotion' : 'demotion',
        from: current.id,
        to: next.id,
        rating: point.rating,
      });
      current = next;
    }
    // Peak never decreases, whatever the rating does afterwards.
    if (current.index > peak.index) peak = current;
  }

  return { changes, current: current ?? RANK_LIST[0]!, peak };
}
