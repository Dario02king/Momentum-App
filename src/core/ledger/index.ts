import { computeRating, type DayState, type RatingPoint } from '../rating';
import {
  rankForRating,
  rankHistory,
  type Rank,
  type RankChange,
} from '../ranks';
import { computeXp, type XpDay, type XpWeek } from '../scoring/xp';
import { ratingToProgress } from '../boss';
import type { DomainType } from '../model';

/**
 * The three-quantity progression ledger (D1).
 *
 * Every domain — and the Boss above them — carries the same three numbers,
 * and the reason there are three is that they answer three different
 * questions that a single number keeps conflating:
 *
 * 1. **Momentum** — the decaying 0–1000 rating. "How am I doing *now*." It
 *    falls when you stop, because that is the question it answers.
 * 2. **Lifetime XP** — monotone. "How much have I done." Nothing takes it
 *    away; a month off costs momentum and costs XP nothing.
 * 3. **Peak rank** — never falls. "How far have I got." A demotion is a
 *    statement about the present, not a deletion of the past.
 *
 * RC2 already had all three, for one implicit domain. This module does not
 * invent them; it makes them plural, so that adding a domain is constructing
 * one more ledger rather than growing another branch inside the rating code.
 *
 * Nothing here is stored. A ledger is built by replay from the day states and
 * weeks that history reconstruction produced, which is what keeps a past rank
 * from moving when today's configuration changes.
 */

export interface LedgerInput {
  domain: DomainType;
  /** One entry per calendar day since the origin, oldest first. */
  days: DayState[];
  xpDays: XpDay[];
  xpWeeks: XpWeek[];
}

export interface DomainLedger {
  domain: DomainType;
  /** One point per day, aligned with the input. */
  points: RatingPoint[];
  /** Quantity 1: decays. */
  momentum: number;
  /** The highest momentum ever reached; decay cannot touch it. */
  peakMomentum: number;
  rank: Rank;
  /** Quantity 3: never falls. */
  peakRank: Rank;
  /** Quantity 2: monotone in history. */
  lifetimeXp: number;
  changes: RankChange[];
  /** Ladder position, 0–8 — what the Boss averages. */
  progress: number;
  /** False when the domain has no scored day yet, so the UI can say so. */
  started: boolean;
}

export function buildLedger(input: LedgerInput): DomainLedger {
  const rating = computeRating(input.days);
  const ranks = rankHistory(
    rating.points.map((point) => ({ date: point.date, rating: point.rating })),
  );

  /*
   * Peak rank is taken from the higher of "the highest rank actually held"
   * and "the rank the peak rating falls in". The two differ when a rating
   * crossed a threshold and fell back before hysteresis let the promotion
   * stick; the user reached it, so it counts.
   */
  const peakRank =
    ranks.peak.index >= ranks.current.index ? ranks.peak : rankForRating(rating.peak);

  return {
    domain: input.domain,
    points: rating.points,
    momentum: rating.current,
    peakMomentum: rating.peak,
    rank: ranks.current,
    peakRank: peakRank.index >= ranks.current.index ? peakRank : ranks.current,
    lifetimeXp: computeXp(input.xpDays, input.xpWeeks),
    changes: ranks.changes,
    progress: ratingToProgress(rating.current),
    started: input.days.some((day) => day.status === 'scored' && day.recorded),
  };
}

/**
 * The ladder position on every day, which is what the Boss replay consumes.
 *
 * Returned as a plain array aligned with the input days so the Boss can walk
 * four domains and one legacy progression in step without joining on dates.
 */
export function progressSeries(points: readonly RatingPoint[]): number[] {
  return points.map((point) => ratingToProgress(point.rating));
}

/**
 * The invariants the three quantities have to satisfy, as a function rather
 * than a comment — the tests assert it, and so can a debug screen.
 */
export function ledgerInvariants(ledger: DomainLedger): {
  peakNeverBelowCurrent: boolean;
  peakRankNeverBelowCurrent: boolean;
  xpNeverNegative: boolean;
} {
  return {
    peakNeverBelowCurrent: ledger.peakMomentum >= ledger.momentum - 1e-9,
    peakRankNeverBelowCurrent: ledger.peakRank.index >= ledger.rank.index,
    xpNeverNegative: ledger.lifetimeXp >= 0,
  };
}
