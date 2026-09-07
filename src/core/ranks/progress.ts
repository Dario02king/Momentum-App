import { RATING } from '../config/constants';
import { RANK_LIST, nextRank, rankForRating, type Rank } from './index';

/**
 * The one authoritative reading of "how far through this rank am I".
 *
 * Everything a progress bar and its copy need comes out of here together, and
 * that is the point. The Rank screen used to fill the bar from the rank it was
 * *displaying* and write the copy from the rank the rating *naturally falls
 * in*. Those are the same rank almost always — and different exactly when it
 * matters, in the hysteresis buffer where a user is held at a rank the rating
 * has slipped below. There the bar showed one thing and the sentence beneath
 * it said another.
 *
 * So: one function, one displayed rank, and every number derived from it.
 *
 * ```
 *   fraction = clamp( (value − floor) / (ceiling − floor), 0, 1 )
 * ```
 *
 * Three states need saying out loud rather than falling out of the formula:
 *
 * - **At the top.** Legend has no next threshold. The bar measures across the
 *   rest of the rating range so further progress still shows, `remaining` is
 *   `null`, and the copy says so instead of counting down to nothing.
 * - **Below the floor.** Held at a rank by hysteresis after the rating dipped
 *   under it. The bar reads empty and the copy counts to the *next* rank —
 *   both describing the same journey, which is what was wrong before.
 * - **No rank held yet.** The rank the rating falls in is used, which is what
 *   a first-time reader sees.
 */
export interface RankProgress {
  /** The rank being shown. Every other number is relative to this one. */
  rank: Rank;
  /** The rank above it, or `null` at the top of the ladder. */
  next: Rank | null;
  /** The rating this describes. */
  value: number;
  /** The displayed rank's own threshold. */
  floor: number;
  /** The next rank's threshold, or `null` at the top. */
  ceiling: number | null;
  /** 0 to 1, clamped. */
  fraction: number;
  /** The same, as a whole percentage — what a bar's width uses. */
  percent: number;
  /** Points still to go, or `null` at the top. Never negative. */
  remaining: number | null;
  atMax: boolean;
  /** True while the rating sits below the rank being displayed. */
  belowFloor: boolean;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function rankProgress(value: number, displayed?: Rank): RankProgress {
  const rank = displayed ?? rankForRating(value);
  const next = nextRank(rank);
  const floor = rank.min;
  const ceiling = next ? next.min : null;
  const atMax = next === null;

  /*
   * At the top the span is the rest of the rating range rather than nothing,
   * so a Legend who keeps improving keeps filling the bar. Everywhere else it
   * is the tier's own width.
   */
  const span = (ceiling ?? RATING.MAX) - floor;
  const fraction = span <= 0 ? 1 : clamp01((value - floor) / span);

  return {
    rank,
    next,
    value,
    floor,
    ceiling,
    fraction,
    percent: Math.round(fraction * 100),
    remaining: ceiling === null ? null : Math.max(0, Math.ceil(ceiling - value)),
    atMax,
    belowFloor: value < floor,
  };
}

/**
 * The same, for a screen that also prints the rating.
 *
 * A rating of 671.6 is shown as 672 and leaves `ceil(700 − 671.6) = 29` points
 * to Master — so the screen reads "672 / 1000" and "29 to Master", and 700
 * minus 672 is 28. One of those numbers is wrong to anyone who does the
 * subtraction, and both were right.
 *
 * Rounding once, before anything is derived, is what makes them agree: the
 * number shown is the number everything else is computed from. The cost is at
 * most half a point of fill, which is a fifth of a pixel.
 */
export function displayedRankProgress(value: number, displayed?: Rank): RankProgress {
  return rankProgress(Math.round(value), displayed);
}

/** Every rank, for a ladder that shows what has been reached and what has not. */
export function rankLadder(peak: Rank): { rank: Rank; earned: boolean }[] {
  return RANK_LIST.map((rank) => ({ rank, earned: rank.index <= peak.index }));
}
