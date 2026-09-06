import { today } from '../core/clock';
import { SCHEMA_VERSION } from '../core/model';
import type { Language } from '../core/model';
import { formatFullDate } from '../i18n/format';
import { I18nProvider, useI18n } from '../i18n/I18nProvider';
import { LANGUAGES } from '../i18n';
import { useAppSettings } from './useAppSettings';
import './App.css';

/**
 * Stage 1 shell.
 *
 * Deliberately not a preview of the real screens: it proves that storage,
 * the string layer and the dark design tokens work end to end on device, and
 * nothing more. Today, Progress, Rank and Areas arrive in their own stages.
 */
function Shell() {
  const { t, language, setLanguage } = useI18n();

  return (
    <main className="app-shell">
      <header>
        <h1 className="app-shell__title">{t('app.name')}</h1>
        <p className="app-shell__tagline">{t('app.tagline')}</p>
      </header>

      <section className="app-card" aria-label={t('common.settings')}>
        <div className="app-card__row">
          <span className="app-card__label">{t('common.today')}</span>
          <span className="app-card__value">{formatFullDate(language, today())}</span>
        </div>
        <div className="app-card__row">
          <span className="app-card__label">Schema</span>
          <span className="app-card__value">v{SCHEMA_VERSION}</span>
        </div>
      </section>

      <div
        className="language-switch"
        role="group"
        aria-label={t('common.language')}
      >
        {LANGUAGES.map((option: Language) => (
          <button
            key={option}
            type="button"
            className="language-switch__option"
            aria-pressed={language === option}
            onClick={() => setLanguage(option)}
          >
            {option === 'de' ? 'Deutsch' : 'English'}
          </button>
        ))}
      </div>

      <p className="app-shell__note">
        {language === 'de'
          ? 'Alle Daten bleiben auf diesem Gerät.'
          : 'All data stays on this device.'}
      </p>
    </main>
  );
}

export function App() {
  const { state, setLanguage } = useAppSettings();

  if (state.status === 'loading') {
    return <main className="app-shell" aria-busy="true" />;
  }

  if (state.status === 'error') {
    return (
      <main className="app-shell">
        <h1 className="app-shell__title">Momentum</h1>
        <p className="app-shell__tagline">
          Daten konnten nicht geladen werden. Momentum speichert alles lokal auf diesem Gerät.
          Im privaten Modus mancher Browser ist das nicht möglich.
        </p>
      </main>
    );
  }

  return (
    <I18nProvider language={state.settings.language} setLanguage={setLanguage}>
      <Shell />
    </I18nProvider>
  );
}
