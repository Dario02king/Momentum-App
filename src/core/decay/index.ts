import { RATING } from '../config/constants';
import { decayForDay } from '../rating';
import type { DomainType } from '../model';

/**
 * Cooling-off / decay — **architecture only**.
 *
 * The final cooling-off formula is a product-owner approval gate and is
 * deliberately not written here. What this module does is give it a shape to
 * arrive into, so that Phase 7 is a change to one function rather than a
 * change to every caller:
 *
 * - the inputs the formula is allowed to see (`DecayDay`),
 * - the contract it has to satisfy (`DecayModel`),
 * - one switch (`activeDecayModel`) that decides which model is in force,
 * - and, until the gate, a provisional model that reproduces RC2 exactly.
 *
 * ## Why the provisional model is RC2's, unchanged
 *
 * A placeholder that guessed at the new formula would quietly become the
 * formula: every screen built on top of it in phases 2–6 would be built on a
 * number nobody approved, and the approved formula would then read as a
 * regression. Reproducing RC2 means the only decay anyone sees before the
 * gate is decay they have already accepted, and the gate stays a real
 * decision rather than a rubber stamp on whatever shipped first.
 *
 * ## The one thing that is genuinely new
 *
 * Rest days (D42) and pause periods (D43) are already-approved product
 * decisions, not part of the formula question, so the input carries them and
 * the provisional model honours them: a paused day does not decay. On RC2
 * data this changes nothing, because RC2 recorded neither.
 */

/**
 * Set to `true` only when the product owner has approved the final formula.
 *
 * This is the single constant the plan refers to. Nothing else in the app
 * decides whether decay is settled, and the tests assert that a provisional
 * model and this flag cannot disagree.
 */
export const DECAY_MODEL_APPROVED = false;

export interface DecayDay {
  /** Which domain is decaying — the final formula may differ per domain. */
  domain: DomainType;
  /** How many consecutive days of this inactivity episode have passed. */
  consecutiveInactiveDays: number;
  /** Points already lost in this episode, for the per-episode cap. */
  episodeSoFar: number;
  /** The user declared this a rest day for this domain (D42). */
  restDay: boolean;
  /** The day falls inside a holiday, illness or injury pause (D43). */
  paused: boolean;
}

export interface DecayModel {
  id: string;
  /** False only once the gate has been passed. */
  provisional: boolean;
  /** Plain-language description, for the decision log and a debug screen. */
  describe: string;
  /** Points to remove on this day. Never negative. */
  perDay(day: DecayDay): number;
}

/**
 * RC2's decay, with rest days and pauses suspending it.
 *
 * Grace period, the small/large step and the per-episode cap are all RC2's
 * numbers, read from `RATING.DECAY` rather than copied, so tuning the
 * existing constants keeps working while the gate is open.
 */
export const PROVISIONAL_DECAY: DecayModel = {
  id: 'rc2-carry-over',
  provisional: true,
  describe:
    "RC2's inactivity decay, unchanged, with rest days and pauses suspended. " +
    'Placeholder until the cooling-off formula is approved.',
  perDay(day) {
    if (day.paused || day.restDay) return 0;
    const step = decayForDay(day.consecutiveInactiveDays);
    const remaining = Math.max(0, RATING.DECAY.MAX_PER_EPISODE - day.episodeSoFar);
    return Math.max(0, Math.min(step, remaining));
  },
};

/**
 * The model in force.
 *
 * One function so that the approved formula replaces a return value, and the
 * rest of the app — which never names a model directly — follows.
 */
export function activeDecayModel(): DecayModel {
  return PROVISIONAL_DECAY;
}

/** True while decay is still a placeholder, for a debug or settings note. */
export function decayIsProvisional(): boolean {
  return activeDecayModel().provisional;
}
