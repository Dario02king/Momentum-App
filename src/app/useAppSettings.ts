import { useCallback, useEffect, useState } from 'react';
import type { Language, SettingsRecord } from '../core/model';
import { settingsRepository } from '../storage/repositories';

export type SettingsState =
  | { status: 'loading' }
  | { status: 'ready'; settings: SettingsRecord }
  | { status: 'error'; error: Error };

/**
 * Boots local storage and exposes the settings record.
 *
 * This is the only place the app finds out whether IndexedDB is usable at
 * all — some browsers refuse it in private mode, and that has to surface as a
 * readable message rather than a blank screen.
 */
export function useAppSettings() {
  const [state, setState] = useState<SettingsState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    settingsRepository
      .getOrCreate()
      .then((settings) => {
        if (!cancelled) setState({ status: 'ready', settings });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback((language: Language) => {
    setState((previous) =>
      previous.status === 'ready'
        ? { status: 'ready', settings: { ...previous.settings, language } }
        : previous,
    );
    void settingsRepository.setLanguage(language);
  }, []);

  return { state, setLanguage };
}
