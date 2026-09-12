import { computeRating, type DayState, type RatingPoint, type RatingResult } from '../rating';
import { ratingToProgress } from '../boss';
import type { DomainType } from '../model';

/**
 * A domain's progression ledger (D1, narrowed by Stage 2 of the Overall-rank
 * update).
 *
 * A domain carries a **rating** — the decaying 0–1000 momentum, "how am I
 * doing *now*" — and the peak that rating has reached. From the rating comes
 * the one number the Boss consumes: the domain's position on the shared
 * 0–8 ladder (`progress`), which is what the Boss averages by weight.
 *
 * A domain does **not** carry a rank. Ranks, peak ranks, promotion history
 * and lifetime XP belong to the Boss alone, which is the only rank system
 * the user sees; the rank machinery in `core/ranks` still exists for it and
 * for nothing else. What a domain contributes is its rating, and what the
 * Boss makes of the ratings is the Boss's business.
 *
 * Nothing here is stored. A ledger is built by replay from the day states
 * that history reconstruction produced, which is what keeps a past value
 * from moving when today's configuration changes.
 */

export interface LedgerInput {
  domain: DomainType;
  /** One entry per calendar day since the origin, oldest first. */
  days: DayState[];
  /**
   * A rating series computed elsewhere, for a domain whose level is not the
   * shared EWMA over day scores.
   *
   * Gym and Running supply this: their rating is 40 % attendance and 60 %
   * personal development moved towards by a gap step, which is a different
   * fold rather than different inputs to this one (D90). The ladder position
   * and the Boss stay exactly where they are — only the series feeding them
   * is produced elsewhere.
   */
  rating?: RatingResult;
}

export interface DomainLedger {
  domain: DomainType;
  /** One point per day, aligned with the input. */
  points: RatingPoint[];
  /** The rating today. Decays. */
  momentum: number;
  /** The highest momentum ever reached; decay cannot touch it. */
  peakMomentum: number;
  /** Ladder position, 0–8 — what the Boss averages. */
  progress: number;
  /** False when the domain has no scored day yet, so the UI can say so. */
  started: boolean;
}

export function buildLedger(input: LedgerInput): DomainLedger {
  const rating = input.rating ?? computeRating(input.days, { domain: input.domain });
  return {
    domain: input.domain,
    points: rating.points,
    momentum: rating.current,
    peakMomentum: rating.peak,
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
 * The invariant the ledger has to satisfy, as a function rather than a
 * comment — the tests assert it, and so can a debug screen.
 */
export function ledgerInvariants(ledger: DomainLedger): {
  peakNeverBelowCurrent: boolean;
} {
  return {
    peakNeverBelowCurrent: ledger.peakMomentum >= ledger.momentum - 1e-9,
  };
}
