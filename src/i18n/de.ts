/**
 * German is the default language and the source of truth for the key set:
 * every other language is typed against it, so a missing translation is a
 * compile error rather than a key leaking into the interface.
 *
 * Copy rules: Hochdeutsch, sentence case, no exclamation marks, no
 * cheerleading. The app states what is true and stays out of the way.
 */
export const de = {
  'app.name': 'Momentum',
  'app.tagline': 'Sieh, wohin dein Leben steuert.',

  'nav.today': 'Heute',
  'nav.progress': 'Verlauf',
  'nav.rank': 'Rang',
  'nav.areas': 'Bereiche',

  'domain.mental': 'Mental Wellbeing',
  'domain.sports': 'Sport',

  'common.save': 'Sichern',
  'common.cancel': 'Abbrechen',
  'common.delete': 'Löschen',
  'common.edit': 'Bearbeiten',
  'common.done': 'Fertig',
  'common.back': 'Zurück',
  'common.continue': 'Weiter',
  'common.settings': 'Einstellungen',
  'common.language': 'Sprache',
  'common.today': 'Heute',
  'common.yesterday': 'Gestern',
  'common.loading': 'Wird geladen',

  'scale.poor': 'Schlecht',
  'scale.okay': 'Okay',
  'scale.good': 'Gut',
  'scale.veryGood': 'Sehr gut',

  'score.low': 'Schwach',
  'score.fair': 'Wechselhaft',
  'score.good': 'Gut',
  'score.high': 'Stark',
  'score.none': 'Keine Daten',

  'day.open': 'Noch offen',
  'day.missed': 'Verpasst',
  'day.neutral': 'Nichts fällig',

  'error.storage.title': 'Daten konnten nicht geladen werden',
  'error.storage.body':
    'Momentum speichert alles lokal auf diesem Gerät. Im privaten Modus mancher Browser ist das nicht möglich.',
} as const;

export type TranslationKey = keyof typeof de;
export type Translations = Record<TranslationKey, string>;
