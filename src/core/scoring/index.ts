/**
 * The scoring model the training domains share.
 *
 * Gym established every rule in here during phase 4.1; Running became its
 * second caller in phase 5 and adopted all of them unchanged. That is why
 * they live here rather than under `core/gym/` — not because a generic
 * framework was wanted, but because two real callers exist and a copy would
 * have been two things that could drift.
 *
 * ```
 *   performanceCurve   change % → 0–1000, attendance, the two-window blend
 *   trainingRating     the 40/60 target, movement, Maintenance, the fold
 *   endurance          the first-promotion gate
 *   abstinence         episodes, the four decay schedules, rank intervals
 * ```
 *
 * What stays domain-specific is the *evidence*: Gym's best set per exercise
 * (`core/gym/performance.ts`) and Running's pace per distance identity
 * (`core/running/performance.ts`). Each produces a percentage change per
 * window, and from that point on the two domains are scored by identical
 * code.
 *
 * `dayScore`, `scale` and `xp` predate this and are unrelated to it; they are
 * exported from their own modules rather than through here.
 */

export * from './performanceCurve';
export * from './trainingRating';
export * from './endurance';
export * from './abstinence';
