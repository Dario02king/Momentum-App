import { useEffect, useState } from 'react';
import { AreasScreen } from '../features/areas/AreasScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { RankScreen } from '../features/ranking/RankScreen';
import { TodayScreen } from '../features/today/TodayScreen';
import { OnboardingFlow } from '../features/onboarding/OnboardingFlow';
import { I18nProvider, useT } from '../i18n/I18nProvider';
import { Button } from '../components';
import type { StorageFailure } from '../storage/db';
import { registerServiceWorker, type UpdateHandle } from './serviceWorker';
import { TabBar, type TabId } from './TabBar';
import { useMomentum } from './useMomentum';
import type { AppConfiguration } from '../storage/services/configurationService';
import type { AreasActions } from '../features/areas/AreasScreen';
import './appShell.css';

function MainApp({
  configuration,
  actions,
  update,
  actionFailed,
  onDismissFailure,
}: {
  configuration: AppConfiguration;
  actions: AreasActions;
  update: UpdateHandle | null;
  actionFailed: boolean;
  onDismissFailure(): void;
}) {
  // Today is where the app opens: the daily check-in is the whole point.
  const [tab, setTab] = useState<TabId>('today');

  return (
    <div className="app">
      <main className="app__content">
        {tab === 'today' ? <TodayScreen onGoToAreas={() => setTab('areas')} /> : null}
        {tab === 'progress' ? <ProgressScreen /> : null}
        {tab === 'rank' ? <RankScreen /> : null}
        {tab === 'areas' ? (
          <AreasScreen configuration={configuration} actions={actions} />
        ) : null}
      </main>
      {actionFailed ? <ActionFailureBanner onDismiss={onDismissFailure} /> : null}
      {update ? <UpdateBanner onApply={update.apply} /> : null}
      <TabBar active={tab} onSelect={setTab} />
    </div>
  );
}

/**
 * Storage failed. Which failure it was decides what the user can do, so the
 * screen offers the action that actually helps rather than a dead end.
 */
function StorageProblem({ reason, onRetry }: { reason: StorageFailure; onRetry(): void }) {
  const t = useT();
  const body =
    reason === 'unavailable'
      ? t('error.storage.unavailable')
      : reason === 'newerData'
        ? t('error.storage.newer')
        : reason === 'blocked'
          ? t('error.storage.blocked')
          : t('error.storage.body');

  return (
    <div className="stage-placeholder">
      <p className="stage-placeholder__title">{t('error.storage.title')}</p>
      <p className="stage-placeholder__body">{body}</p>
      <div className="stage-placeholder__action">
        {reason === 'newerData' ? (
          <Button variant="primary" onClick={() => window.location.reload()}>
            {t('error.storage.reload')}
          </Button>
        ) : (
          <Button variant="secondary" onClick={onRetry}>
            {t('error.storage.retry')}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * A change that did not get stored.
 *
 * The screen has already been put back on what is actually saved, so this
 * only has to say that the change did not take. It is an `alert` because it
 * contradicts what the user just did.
 */
function ActionFailureBanner({ onDismiss }: { onDismiss(): void }) {
  const t = useT();
  return (
    <div className="update-banner" role="alert">
      <span>{t('error.action')}</span>
      <button type="button" className="update-banner__action" onClick={onDismiss}>
        {t('error.actionDismiss')}
      </button>
    </div>
  );
}

/** Unobtrusive, and it never reloads on its own. */
function UpdateBanner({ onApply }: { onApply(): void }) {
  const t = useT();
  return (
    <div className="update-banner" role="status">
      <span>{t('update.available')}</span>
      <button type="button" className="update-banner__action" onClick={onApply}>
        {t('update.action')}
      </button>
    </div>
  );
}

export function App() {
  const { state, areasActions, finishOnboarding, setLanguage, refresh, actionFailed, dismissActionFailure } =
    useMomentum();
  const [update, setUpdate] = useState<UpdateHandle | null>(null);

  useEffect(() => {
    registerServiceWorker(setUpdate);
  }, []);

  if (state.status === 'loading') {
    return <div className="app" aria-busy="true" />;
  }

  const language = state.status === 'ready' ? state.configuration.settings.language : 'de';

  return (
    <I18nProvider language={language} setLanguage={setLanguage}>
      {state.status === 'error' ? (
        <StorageProblem reason={state.reason} onRetry={() => void refresh()} />
      ) : state.configuration.settings.onboardingCompletedAt === null ? (
        <OnboardingFlow onFinish={finishOnboarding} failed={actionFailed} />
      ) : (
        <MainApp
          configuration={state.configuration}
          actions={areasActions}
          update={update}
          actionFailed={actionFailed}
          onDismissFailure={dismissActionFailure}
        />
      )}
    </I18nProvider>
  );
}
