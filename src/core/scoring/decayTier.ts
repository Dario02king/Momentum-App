import { RANKS, RANK_DEMOTION_HYSTERESIS, RATING } from '../config/constants';

/**
 * The decay tier — the rating interval abstinence decay is measured in.
 *
 * **This is not a rank.** It has no name, no badge, no promotion and no
 * demotion; it is never shown, never persisted and never compared between
 * domains. It exists for one reason: the approved decay rule (D96) removes a
 * share of *the progress made inside an interval*, and an interval needs two
 * numbers. Those numbers are the thresholds of the one shared ladder, because
 * that is the scale every rating in the app is measured on — the Boss's
 * `ratingToProgress()` reads the same thresholds — and using any other
 * partition would change what a fortnight's absence costs.
 *
 * ## Why the tier is held, not looked up
 *
 * The tier is **sticky**. Moving up happens the moment a rating crosses a
 * floor; moving down waits until the rating has fallen `RANK_DEMOTION_HYSTERESIS`
 * points *below* the held floor. A lookup on the current rating would not
 * do: a rating hovering on a boundary would flip the interval — and with it
 * the floor the decay can never go beneath — from one day to the next, and
 * an episode that begins with the rating a few points under a floor it had
 * cleared would decay in the interval *below* rather than the one held. The
 * differential fixture in `decayEquivalence.test.ts` pins both behaviours,
 * day by day, from the implementation this replaced.
 *
 * The tracker is deliberately simpler than the ladder's rank resolver: no
 * sustained-days requirement and no Endurance gate. That is not an
 * omission — it is what the fold has always done, and the user's history is
 * folded from it.
 */
export interface DecayTier {
  /** Position on the ladder, 0 at the bottom. Identity for comparison only. */
  index: number;
  floor: number;
  /** The next tier's floor, or the top of the scale on the last tier. */
  ceiling: number;
}

/** Ascending floors, straight from the shared ladder. */
const FLOORS: readonly number[] = RANKS.map((rank) => rank.min);

export function decayTierAt(index: number): DecayTier {
  const bounded = Math.min(FLOORS.length - 1, Math.max(0, index));
  return {
    index: bounded,
    floor: FLOORS[bounded]!,
    ceiling: FLOORS[bounded + 1] ?? RATING.MAX,
  };
}

/** The tier a rating falls in on its own: the highest floor it has reached. */
export function decayTierFor(rating: number): DecayTier {
  let index = 0;
  for (const [candidate, floor] of FLOORS.entries()) {
    if (rating >= floor) index = candidate;
    else break;
  }
  return decayTierAt(index);
}

/**
 * The tier to keep holding, given the one held so far.
 *
 * Up immediately; down only once the rating is more than the buffer below
 * the held floor — and then to wherever the rating actually is, never merely
 * one step down.
 */
export function holdDecayTier(
  rating: number,
  held: DecayTier | null,
  hysteresis: number = RANK_DEMOTION_HYSTERESIS,
): DecayTier {
  const natural = decayTierFor(rating);
  if (held === null) return natural;
  if (natural.index >= held.index) return natural;
  if (rating >= held.floor - hysteresis) return held;
  return natural;
}

/** Where in its tier a rating sits, from 0 to 1. */
export function tierProgressOf(rating: number, tier: DecayTier): number {
  const span = tier.ceiling - tier.floor;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (rating - tier.floor) / span));
}
