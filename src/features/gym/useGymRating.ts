import { useCallback } from 'react';
import { useLoadable } from '../../app/useLoadable';
import type { Rank } from '../../core/ranks';
import { loadBossProgression } from '../../storage/services/bossService';
import type { GymRatingState } from '../../storage/services/gymRatingService';

export interface GymRatingView {
  state: GymRatingState;
  /** The rank actually displayed, gate and hysteresis already applied. */
  rank: Rank;
  started: boolean;
}

/**
 * Gym's rating, rank and the state behind them.
 *
 * It comes from the Boss replay rather than a second one of its own, for the
 * same reason Progress and Rank share theirs: two replays of the same rows
 * are two chances to disagree. The Gym ledger the Boss builds *is* the Gym
 * rating, so reading it here cannot drift from what the Rank screen shows.
 */
export function useGymRating(): GymRatingView | null {
  const load = useCallback(async (): Promise<GymRatingView> => {
    const boss = await loadBossProgression();
    const ledger = boss.domains.find((domain) => domain.domain === 'gym')!;
    return { state: boss.gym, rank: ledger.rank, started: ledger.started };
  }, []);
  const { state } = useLoadable(load);
  return state.status === 'ready' ? state.value : null;
}
