import { useEffect, useState } from 'react';
import { today } from '../../core/clock';
import { addDays } from '../../core/dates';
import { loadHistory, type History } from '../../storage/services/historyService';

export type HistoryState =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; history: History };

export function useHistory(rangeDays: number) {
  const [state, setState] = useState<HistoryState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const to = today();
    const from = addDays(to, -(rangeDays - 1));
    loadHistory(from, to)
      .then((history) => {
        if (!cancelled) setState({ status: 'ready', history });
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
  }, [rangeDays]);

  return state;
}
