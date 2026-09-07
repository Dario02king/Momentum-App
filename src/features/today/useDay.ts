import { useCallback } from 'react';
import { today } from '../../core/clock';
import type { AnswerValue, StoredDomainType } from '../../core/model';
import { useLoadable, type Loadable } from '../../app/useLoadable';
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

export type DayState = Loadable<DayView>;

/**
 * The Today screen's connection to storage.
 *
 * Writes go through the check-in service, which owns the edit-window and
 * same-week rules, and each write is followed by a reload so what is on
 * screen is what is on disk. The interaction is small enough that this costs
 * nothing and removes a whole class of drift.
 *
 * A reload that fails after the day is already on screen does not take the
 * day down with it: the loader keeps the last good view and marks it stale,
 * so a lost write is reported without the screen emptying under the user.
 */
export function useDay(date: string = today()) {
  const load = useCallback(() => loadDay(date), [date]);
  const { state, reload } = useLoadable(load);

  const run = useCallback(
    (operation: () => Promise<unknown>) => {
      operation()
        .then(reload)
        .catch((error: unknown) => {
          // A rejected write means a rule refused it — the edit window, or a
          // closed week. Reloading puts the screen back on the truth.
          console.warn('Check-in write refused', error);
          void reload();
        });
    },
    [reload],
  );

  return {
    state,
    answer: (questionId: string, value: AnswerValue | null) =>
      run(() =>
        value === null ? clearAnswer(date, questionId) : saveAnswer(date, questionId, value),
      ),
    logSession: (domain: StoredDomainType) => run(() => logSession(domain, date)),
    updateSession: (domain: StoredDomainType, id: string, input: SessionInput) =>
      run(() => updateSession(domain, id, input)),
    deleteSession: (domain: StoredDomainType, id: string) => run(() => deleteSession(domain, id)),
    reload,
  };
}
