import { useCallback } from 'react';
import { useLoadable } from '../../app/useLoadable';
import { loadBossProgression } from '../../storage/services/bossService';
import type { GymRatingState } from '../../storage/services/gymRatingService';

export interface GymRatingView {
  state: GymRatingState;
  started: boolean;
}

/**
 * Gym's rating and the state behind it.
 *
 * It comes from the Boss replay rather than a second one of its own, for the
 * same reason Progress and Rang share theirs: two replays of the same rows
 * are two chances to disagree. The Gym ledger the Boss builds *is* the Gym
 * rating, so reading it here cannot drift from what the Boss is built on.
 */
export function useGymRating(): GymRatingView | null {
  const load = useCallback(async (): Promise<GymRatingView> => {
    const boss = await loadBossProgression();
    const ledger = boss.domains.find((domain) => domain.domain === 'gym')!;
    return { state: boss.gym, started: ledger.started };
  }, []);
  const { state } = useLoadable(load);
  return state.status === 'ready' ? state.value : null;
}
