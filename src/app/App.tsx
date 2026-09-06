import { useState } from 'react';
import { AreasScreen } from '../features/areas/AreasScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { TodayScreen } from '../features/today/TodayScreen';
import { OnboardingFlow } from '../features/onboarding/OnboardingFlow';
import { I18nProvider, useT } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n';
import { TabBar, type TabId } from './TabBar';
import { useMomentum } from './useMomentum';
import type { AppConfiguration } from '../storage/services/configurationService';
import type { AreasActions } from '../features/areas/AreasScreen';
import './appShell.css';

/** Honest stand-in for a screen that a later stage builds. */
function StagePlaceholder({ titleKey }: { titleKey: TranslationKey }) {
  const t = useT();
  return (
    <div className="stage-placeholder">
      <p className="stage-placeholder__title">{t(titleKey)}</p>
      <p className="stage-placeholder__body">{t('placeholder.body')}</p>
    </div>
  );
}

function MainApp({
  configuration,
  actions,
}: {
  configuration: AppConfiguration;
  actions: AreasActions;
}) {
  // Today is where the app opens: the daily check-in is the whole point.
  const [tab, setTab] = useState<TabId>('today');

  return (
    <div className="app">
      <div className="app__content">
        {tab === 'today' ? <TodayScreen onGoToAreas={() => setTab('areas')} /> : null}
        {tab === 'progress' ? <ProgressScreen /> : null}
        {tab === 'rank' ? <StagePlaceholder titleKey="nav.rank" /> : null}
        {tab === 'areas' ? (
          <AreasScreen configuration={configuration} actions={actions} />
        ) : null}
      </div>
      <TabBar active={tab} onSelect={setTab} />
    </div>
  );
}

function StorageError() {
  const t = useT();
  return (
    <div className="stage-placeholder">
      <p className="stage-placeholder__title">{t('error.storage.title')}</p>
      <p className="stage-placeholder__body">{t('error.storage.body')}</p>
    </div>
  );
}

export function App() {
  const { state, areasActions, finishOnboarding, setLanguage } = useMomentum();

  if (state.status === 'loading') {
    return <div className="app" aria-busy="true" />;
  }

  const language = state.status === 'ready' ? state.configuration.settings.language : 'de';

  return (
    <I18nProvider language={language} setLanguage={setLanguage}>
      {state.status === 'error' ? (
        <StorageError />
      ) : state.configuration.settings.onboardingCompletedAt === null ? (
        <OnboardingFlow onFinish={finishOnboarding} />
      ) : (
        <MainApp configuration={state.configuration} actions={areasActions} />
      )}
    </I18nProvider>
  );
}
