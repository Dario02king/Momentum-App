import { useLoadable, type Loadable } from '../../app/useLoadable';
import { loadProgression, type Progression } from '../../storage/services/ratingService';

export type ProgressionState = Loadable<Progression>;

/**
 * Progress and Rank read the same replay.
 *
 * Loading the progression gives both the reconstructed history and the rating
 * series derived from it, so the two screens can never disagree about what a
 * day was worth. Rank layers its promotion check on top of this rather than
 * loading the replay a second time.
 */
export function useProgression() {
  return useLoadable(loadProgression);
}
