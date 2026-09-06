import type { WeekKey } from '../../core/dates';

/**
 * Progress towards a weekly training target.
 *
 * A quota, never a schedule: this says how many sessions happened in a
 * Monday-to-Sunday week against how many were aimed for, and says nothing
 * about which days they fell on.
 */
export interface WeekProgress {
  weekKey: WeekKey;
  completed: number;
  target: number;
  /** Sessions still needed to meet the target; never negative. */
  remaining: number;
  /** Completed ÷ target as a percentage, capped at 100 (§9). */
  score: number;
  met: boolean;
  /** More sessions than the target — worth acknowledging, never punished. */
  exceeded: boolean;
}

export function weekProgress(completed: number, target: number, weekKey: WeekKey): WeekProgress {
  const safeTarget = Math.max(1, Math.round(target));
  const safeCompleted = Math.max(0, Math.round(completed));
  return {
    weekKey,
    completed: safeCompleted,
    target: safeTarget,
    remaining: Math.max(0, safeTarget - safeCompleted),
    score: Math.min(100, (safeCompleted / safeTarget) * 100),
    met: safeCompleted >= safeTarget,
    exceeded: safeCompleted > safeTarget,
  };
}
