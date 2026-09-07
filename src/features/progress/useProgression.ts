import { useEffect, useState } from 'react';
import { loadProgression, type Progression } from '../../storage/services/ratingService';

export type ProgressionState =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; progression: Progression };

/**
 * Progress and Rank read the same replay.
 *
 * Loading the progression gives both the reconstructed history and the rating
 * series derived from it, so the two screens can never disagree about what a
 * day was worth.
 */
export function useProgression() {
  const [state, setState] = useState<ProgressionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadProgression()
      .then((progression) => {
        if (!cancelled) setState({ status: 'ready', progression });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
