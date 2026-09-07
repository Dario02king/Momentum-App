import {
  RANKS,
  RANK_DEMOTION_HYSTERESIS,
  RANK_DEMOTION_SUSTAIN_DAYS,
  type RankId,
} from '../config/constants';

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
 * Walks a rating series and reports the crossings, so the log matches what
 * the user actually saw.
 *
 * Promotion is immediate: reaching a rank is an achievement the moment it
 * happens. Demotion is deliberately harder — the rating must sit below the
 * hysteresis buffer for several scored days running. A dip that recovers
 * within a couple of days was never a change in standing, and this is what
 * makes "a single bad day must never cost a tier" hold for the whole tail of
 * that day rather than only for the day itself.
 */
export function rankHistory(
  series: { date: string; rating: number }[],
  sustainDays: number = RANK_DEMOTION_SUSTAIN_DAYS,
): {
  changes: RankChange[];
  current: Rank;
  peak: Rank;
} {
  let current: Rank | null = null;
  let peak: Rank = RANK_LIST[0]!;
  let daysBelow = 0;
  const changes: RankChange[] = [];

  for (const point of series) {
    if (current === null) {
      current = rankForRating(point.rating);
      peak = current;
      continue;
    }

    const natural = rankForRating(point.rating);

    if (natural.index > current.index) {
      changes.push({
        date: point.date,
        kind: 'promotion',
        from: current.id,
        to: natural.id,
        rating: point.rating,
      });
      current = natural;
      daysBelow = 0;
    } else if (point.rating < current.min - RANK_DEMOTION_HYSTERESIS) {
      daysBelow += 1;
      if (daysBelow >= sustainDays) {
        changes.push({
          date: point.date,
          kind: 'demotion',
          from: current.id,
          to: natural.id,
          rating: point.rating,
        });
        current = natural;
        daysBelow = 0;
      }
    } else {
      // Back inside the buffer: the dip did not become a demotion.
      daysBelow = 0;
    }

    if (current.index > peak.index) peak = current;
  }

  return { changes, current: current ?? RANK_LIST[0]!, peak };
}
