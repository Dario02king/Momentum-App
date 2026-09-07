import { useCallback, useEffect, useState } from 'react';
import type { Language } from '../core/model';
import { StorageError, type StorageFailure } from '../storage/db';
import { settingsRepository } from '../storage/repositories';
import {
  addQuestion,
  applyOnboarding,
  archiveQuestion,
  disableDomain,
  enableMental,
  enableSports,
  loadConfiguration,
  pauseQuestion,
  resumeQuestion,
  setSportsTarget,
  updateQuestion,
  type AppConfiguration,
  type OnboardingSelection,
} from '../storage/services/configurationService';
import type { AreasActions } from '../features/areas/AreasScreen';

export type MomentumState =
  | { status: 'loading' }
  | { status: 'error'; error: Error; reason: StorageFailure }
  | { status: 'ready'; configuration: AppConfiguration };

/**
 * The application's single connection to storage.
 *
 * Screens receive plain data and callbacks; none of them knows a repository
 * exists. Every mutation goes through the configuration service — which is
 * what appends a configuration revision — and then reloads, so what is on
 * screen is always what is on disk.
 */
export function useMomentum() {
  const [state, setState] = useState<MomentumState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const configuration = await loadConfiguration();
      setState({ status: 'ready', configuration });
    } catch (error: unknown) {
      setState({
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
        // Why it failed decides what the user can do about it.
        reason: error instanceof StorageError ? error.reason : 'failed',
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    (operation: () => Promise<unknown>) => {
      void operation().then(refresh);
    },
    [refresh],
  );

  const setLanguage = useCallback(
    (language: Language) => {
      // Language is not scoring-relevant, so it writes no revision. The
      // screen updates immediately rather than waiting for the round trip.
      setState((previous) =>
        previous.status === 'ready'
          ? {
              status: 'ready',
              configuration: {
                ...previous.configuration,
                settings: { ...previous.configuration.settings, language },
              },
            }
          : previous,
      );
      void settingsRepository.setLanguage(language);
    },
    [],
  );

  const finishOnboarding = useCallback(
    (selection: OnboardingSelection) => {
      run(() => applyOnboarding(selection));
    },
    [run],
  );

  const areasActions: AreasActions = {
    enableMental: () => run(() => enableMental()),
    disableMental: () =>
      run(async () => {
        const configuration = await loadConfiguration();
        if (configuration.mental) await disableDomain(configuration.mental.id);
      }),
    enableSports: () => run(() => enableSports()),
    disableSports: () =>
      run(async () => {
        const configuration = await loadConfiguration();
        if (configuration.sports) await disableDomain(configuration.sports.id);
      }),
    setSportsTarget: (target: number) => run(() => setSportsTarget(target)),
    addQuestion: (draft) => run(() => addQuestion(draft)),
    updateQuestion: (id, draft) => run(() => updateQuestion(id, draft)),
    pauseQuestion: (id) => run(() => pauseQuestion(id)),
    resumeQuestion: (id) => run(() => resumeQuestion(id)),
    archiveQuestion: (id) => run(() => archiveQuestion(id)),
    reload: () => void refresh(),
    setLanguage,
  };

  return { state, areasActions, finishOnboarding, setLanguage, refresh };
}
