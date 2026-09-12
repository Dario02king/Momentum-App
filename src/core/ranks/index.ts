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

export interface RankHistoryOptions {
  sustainDays?: number;
  /**
   * Whether a **promotion** is allowed on each point, aligned with `series`.
   *
   * This is the Endurance Phase's one hook into the rank ladder (D94), and it
   * is deliberately the only one. There is no second ladder, no second badge
   * family and no parallel rank state: while the gate is closed the user's
   * rating rises normally and simply does not cross a threshold yet. Absent
   * means every promotion is allowed, which is every caller but Gym's.
   *
   * Demotion is not gated. A gate that also held a rank *up* would be a
   * protection rather than a requirement, and nobody can be demoted below the
   * rank they have not yet left anyway.
   */
  promotionUnlocked?: readonly boolean[];
}

/**
 * The state one rank walk carries from point to point.
 *
 * Exposed so the confirmation era (`confirmation.ts`) can continue a walk
 * from exactly where the legacy prefix left it — the same current rank, the
 * same peak, the same demotion counter — rather than re-deriving any of it.
 */
export interface RankWalkState {
  current: Rank | null;
  peak: Rank;
  /** Consecutive points below the hysteresis buffer, for the sustained rule. */
  daysBelow: number;
  changes: RankChange[];
}

export function newRankWalk(): RankWalkState {
  return { current: null, peak: RANK_LIST[0]!, daysBelow: 0, changes: [] };
}

/**
 * The demotion half of one step, on its own.
 *
 * This is the only demotion logic in the app. The legacy walk runs it on
 * every point that did not promote; the confirmation walk runs it on every
 * point that did not confirm a promotion. Neither has a copy.
 */
export function rankWalkDemotionStep(
  state: RankWalkState,
  point: { date: string; rating: number },
  natural: Rank,
  sustainDays: number,
): void {
  const current = state.current!;
  if (point.rating < current.min - RANK_DEMOTION_HYSTERESIS) {
    state.daysBelow += 1;
    if (state.daysBelow >= sustainDays) {
      state.changes.push({
        date: point.date,
        kind: 'demotion',
        from: current.id,
        to: natural.id,
        rating: point.rating,
      });
      state.current = natural;
      state.daysBelow = 0;
    }
  } else {
    // Back inside the buffer: the dip did not become a demotion.
    state.daysBelow = 0;
  }
}

/** One point of the legacy walk: immediate promotion, sustained demotion. */
export function rankWalkStep(
  state: RankWalkState,
  point: { date: string; rating: number },
  mayPromote: boolean,
  sustainDays: number,
): void {
  if (state.current === null) {
    // The opening rank is where the rating already is, not a promotion —
    // except while the gate is closed, where the user starts at the bottom
    // of the ladder and stays there until they have earned the first climb.
    state.current = mayPromote ? rankForRating(point.rating) : RANK_LIST[0]!;
    state.peak = state.current;
    return;
  }

  const natural = rankForRating(point.rating);

  if (natural.index > state.current.index && mayPromote) {
    state.changes.push({
      date: point.date,
      kind: 'promotion',
      from: state.current.id,
      to: natural.id,
      rating: point.rating,
    });
    state.current = natural;
    state.daysBelow = 0;
  } else {
    rankWalkDemotionStep(state, point, natural, sustainDays);
  }

  if (state.current.index > state.peak.index) state.peak = state.current;
}

/**
 * Walks a rating series and reports the crossings, so the log matches what
 * the user actually saw.
 *
 * Promotion is immediate: reaching a rank is an achievement the moment it
 * happens — with one exception, and only one. A caller may pass
 * `promotionUnlocked` to hold the *first* climb behind a requirement the user
 * has still to meet; Gym's Endurance Phase is the only thing that does, and
 * while it is closed the rating still moves and simply does not cross.
 * Demotion is deliberately harder — the rating must sit below the
 * hysteresis buffer for several scored days running. A dip that recovers
 * within a couple of days was never a change in standing, and this is what
 * makes "a single bad day must never cost a tier" hold for the whole tail of
 * that day rather than only for the day itself.
 *
 * This is the **legacy** walk: the Boss ran on it alone until D126, and it
 * still walks every day before the confirmation era. It is one fold over
 * `rankWalkStep`, so what it does is written once.
 */
export function rankHistory(
  series: { date: string; rating: number }[],
  options: RankHistoryOptions = {},
): {
  changes: RankChange[];
  current: Rank;
  peak: Rank;
} {
  const sustainDays = options.sustainDays ?? RANK_DEMOTION_SUSTAIN_DAYS;
  const unlocked = options.promotionUnlocked;
  const state = newRankWalk();

  for (const [index, point] of series.entries()) {
    const mayPromote = unlocked === undefined || unlocked[index] === true;
    rankWalkStep(state, point, mayPromote, sustainDays);
  }

  return { changes: state.changes, current: state.current ?? RANK_LIST[0]!, peak: state.peak };
}
