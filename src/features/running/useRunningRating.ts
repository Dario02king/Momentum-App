import { useCallback } from 'react';
import { useLoadable } from '../../app/useLoadable';
import { loadBossProgression } from '../../storage/services/bossService';
import type { RunningRatingState } from '../../storage/services/runningRatingService';

export interface RunningRatingView {
  state: RunningRatingState;
  started: boolean;
}

/**
 * Running's rating and the state behind it.
 *
 * From the Boss replay rather than a second one of its own, for the same
 * reason Gym reads it there: two replays of the same rows are two chances to
 * disagree.
 */
export function useRunningRating(): RunningRatingView | null {
  const load = useCallback(async (): Promise<RunningRatingView> => {
    const boss = await loadBossProgression();
    const ledger = boss.domains.find((domain) => domain.domain === 'running')!;
    return { state: boss.running, started: ledger.started };
  }, []);
  const { state } = useLoadable(load);
  return state.status === 'ready' ? state.value : null;
}
