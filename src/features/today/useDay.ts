import { useCallback, useEffect, useState } from 'react';
import { today } from '../../core/clock';
import type { AnswerValue } from '../../core/model';
import {
  clearAnswer,
  deleteSession,
  loadDay,
  logSession,
  saveAnswer,
  updateSession,
  type DayView,
  type SessionInput,
} from '../../storage/services/checkInService';

export type DayState =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; day: DayView };

/**
 * The Today screen's connection to storage.
 *
 * Writes go through the check-in service, which owns the edit-window and
 * same-week rules, and each write is followed by a reload so what is on
 * screen is what is on disk. The interaction is small enough that this costs
 * nothing and removes a whole class of drift.
 */
export function useDay(date: string = today()) {
  const [state, setState] = useState<DayState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      setState({ status: 'ready', day: await loadDay(date) });
    } catch (error: unknown) {
      setState({
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }, [date]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    (operation: () => Promise<unknown>) => {
      operation()
        .then(refresh)
        .catch((error: unknown) => {
          // A rejected write means a rule refused it — the edit window, or a
          // closed week. Reloading puts the screen back on the truth.
          console.warn('Check-in write refused', error);
          void refresh();
        });
    },
    [refresh],
  );

  return {
    state,
    answer: (questionId: string, value: AnswerValue | null) =>
      run(() =>
        value === null ? clearAnswer(date, questionId) : saveAnswer(date, questionId, value),
      ),
    logSession: () => run(() => logSession(date)),
    updateSession: (id: string, input: SessionInput) => run(() => updateSession(id, input)),
    deleteSession: (id: string) => run(() => deleteSession(id)),
    refresh,
  };
}
