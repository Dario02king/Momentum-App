import { useCallback } from 'react';
import { addDays } from '../../core/dates';
import { today as currentDay } from '../../core/clock';
import { useLoadable } from '../../app/useLoadable';
import { loadGymHistory, type GymHistory } from '../../storage/services/gymService';

/**
 * Gym's replay, over the range the Progress screen is showing.
 *
 * Separate from `useProgression` because it is a different question answered
 * from different rows: the progression replays day scores, and Gym replays
 * sets. Loading it here rather than folding it into the progression keeps a
 * failure in one from emptying the other.
 */
export function useGymHistory(rangeDays: number): GymHistory | null {
  const load = useCallback(() => {
    const to = currentDay();
    return loadGymHistory(addDays(to, -(rangeDays - 1)), to);
  }, [rangeDays]);
  const { state } = useLoadable(load);
  return state.status === 'ready' ? state.value : null;
}
