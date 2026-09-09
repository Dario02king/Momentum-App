import { RATING } from '../config/constants';
import type { DomainType } from '../model';

/**
 * Cooling-off / general inactivity decay — **the live contract** (D72).
 *
 * This module owns the general decay formula. Not a description of it, not a
 * placeholder beside it: the arithmetic that `core/rating`'s fold actually
 * runs is the arithmetic in this file, reached through `activeDecayModel()`.
 *
 * ## What changed, and why it mattered
 *
 * Between phase 1 and phase 7 this module was a contract nobody called. The
 * decay that ran was a second, inline copy of the same schedule inside
 * `computeRating`, so `DECAY_MODEL_APPROVED` was a claim no code consulted
 * and flipping it would have changed nothing at all. Two implementations of
 * one rule is the same defect as a cached score: they can disagree, and then
 * neither can be trusted. There is now one.
 *
 * ## What the approved model is
 *
 * RC2's schedule, ratified unchanged (D72). Every constant is read from
 * `RATING.DECAY` rather than restated, so this file is the only place the
 * schedule exists and the constants stay tunable in one place:
 *
 * | Consecutive inactive days | Cost per day |
 * |---|---|
 * | 1 – `GRACE_DAYS` | nothing |
 * | up to `SMALL_UNTIL_DAY` | `SMALL_PER_DAY` |
 * | beyond that | `LARGE_PER_DAY` |
 *
 * and a single episode can never cost more than `MAX_PER_EPISODE` in total.
 * Approving D72 was therefore a decision, not a change: no user-visible
 * number moved.
 *
 * ## What this model does *not* govern
 *
 * **Gym and Running under the performance model.** Those have their own
 * approved rule — `core/scoring/abstinence.ts` — which decays rank progress
 * after seven days with no saved session, and the two must never both charge
 * for the same day (D96). The training services never route a day through
 * both: a day scored under `attendancePerformance` is folded by
 * `computeTrainingRating`, which does not call this at all.
 *
 * The general model does still govern those domains' **historical** days —
 * the era before `gymModel`/`runningModel` existed — because that is what was
 * in force then, and a day already lived is scored by the rules of its own
 * day.
 *
 * ## The two dormant inputs
 *
 * `restDay` and `paused` are part of the shape and are honoured here, and
 * **nothing populates them**. `DayState` carries neither, no screen writes a
 * `RestDayRecord` or a `PausePeriodRecord`, and their suspension semantics
 * are a separate unresolved product question — deliberately not answered by
 * D72 and deliberately not answered by a type refactor either. They are kept
 * rather than removed so that resolving that question is wiring an input
 * rather than reopening this contract.
 */

/**
 * True: the product owner has approved the final formula (D72).
 *
 * The approved formula is RC2's, unchanged, which is why this flag moving
 * from `false` to `true` moved no rating. The invariant that matters is that
 * this and `activeDecayModel().provisional` can never disagree, and a test
 * asserts exactly that.
 */
export const DECAY_MODEL_APPROVED = true;

export interface DecayDay {
  /**
   * Which domain is decaying.
   *
   * Optional because the approved formula is general and does not read it —
   * a caller that folds several domains at once, like the legacy
   * progression, genuinely has no single answer. It is part of the shape so
   * that a future per-domain formula is a change to `perDay` rather than to
   * every caller.
   */
  domain?: DomainType;
  /** How many consecutive days of this inactivity episode have passed. */
  consecutiveInactiveDays: number;
  /** Points already lost in this episode, for the per-episode cap. */
  episodeSoFar: number;
  /** The user declared this a rest day for this domain. Nothing sets it yet. */
  restDay: boolean;
  /** The day falls inside a holiday, illness or injury pause. Likewise. */
  paused: boolean;
}

export interface DecayModel {
  id: string;
  /** False now that the gate has been passed. */
  provisional: boolean;
  /** Plain-language description, for the decision log and a debug screen. */
  describe: string;
  /** Points to remove on this day. Never negative. */
  perDay(day: DecayDay): number;
}

/**
 * The schedule alone, without the episode cap.
 *
 * The single source of truth for the grace period and the two rates. It is
 * re-exported by `core/rating` under the name it has always had there, so
 * that there is one implementation reachable by both of its historical
 * import paths rather than two implementations agreeing by luck.
 */
export function decayForDay(consecutiveInactiveDays: number): number {
  const { GRACE_DAYS, SMALL_UNTIL_DAY, SMALL_PER_DAY, LARGE_PER_DAY } = RATING.DECAY;
  if (consecutiveInactiveDays <= GRACE_DAYS) return 0;
  if (consecutiveInactiveDays <= SMALL_UNTIL_DAY) return SMALL_PER_DAY;
  return LARGE_PER_DAY;
}

/**
 * RC2's decay, ratified as the general cooling-off model (D72).
 *
 * Rest days and pauses suspend it, which costs nothing today because nothing
 * populates either flag — and changes nothing for RC2 data, which recorded
 * neither.
 */
export const APPROVED_DECAY: DecayModel = {
  id: 'rc2-general',
  provisional: false,
  describe:
    "RC2's inactivity decay, ratified unchanged as the general cooling-off " +
    'formula (D72), with rest days and pauses suspended.',
  perDay(day) {
    if (day.paused || day.restDay) return 0;
    const step = decayForDay(day.consecutiveInactiveDays);
    const remaining = Math.max(0, RATING.DECAY.MAX_PER_EPISODE - day.episodeSoFar);
    return Math.max(0, Math.min(step, remaining));
  },
};

/**
 * The model in force, and the only way the fold reaches a decay figure.
 *
 * One function, so that replacing the formula replaces a return value and
 * the rest of the app — which never names a model directly — follows.
 */
export function activeDecayModel(): DecayModel {
  return APPROVED_DECAY;
}

/** True while decay is still a placeholder, for a debug or settings note. */
export function decayIsProvisional(): boolean {
  return activeDecayModel().provisional;
}
