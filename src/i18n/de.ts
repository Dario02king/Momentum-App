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
  'common.add': 'Hinzufügen',
  'common.skip': 'Überspringen',
  'common.close': 'Schliessen',

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

  'domain.mental.description': 'Tägliche Fragen zu dir.',
  'domain.sports.description': 'Ein Wochenziel für deine Trainings.',

  'onboarding.step': 'Schritt {current} von {total}',
  'onboarding.welcome.body': 'Ein kurzer Check-in am Tag. Mehr braucht es nicht.',
  'onboarding.welcome.start': 'Los geht\u2019s',
  'onboarding.questions.title': 'Worauf achtest du?',
  'onboarding.questions.body': 'Wähle drei bis fünf Fragen. Ändern kannst du sie jederzeit.',
  'onboarding.questions.custom': 'Eigene Frage',
  'onboarding.questions.selected': '{count} ausgewählt',
  'onboarding.questions.recommendation': 'Drei bis fünf sind ein guter Anfang.',
  'onboarding.sports.title': 'Wie oft willst du trainieren?',
  'onboarding.sports.body': 'Trainings pro Woche. Die Tage wählst du selbst.',
  'onboarding.sports.skip': 'Ohne Sport starten',
  'onboarding.sports.perWeek': '{count} pro Woche',
  'onboarding.sports.unit': 'Trainings pro Woche',
  'onboarding.sports.unitEmpty': 'Wähle eine Zahl',
  'onboarding.summary.title': 'Alles bereit',
  'onboarding.summary.body': 'Du kannst jederzeit unter Bereiche nachjustieren.',
  'onboarding.summary.questions': '{count} Fragen täglich',
  'onboarding.summary.questionsOne': 'Eine Frage täglich',
  'onboarding.summary.sports': '{count} Trainings pro Woche',
  'onboarding.summary.empty': 'Noch nichts eingerichtet',
  'onboarding.summary.emptyBody':
    'Auch gut. Du kannst unter Bereiche starten, sobald du so weit bist.',
  'onboarding.summary.start': 'Starten',

  'areas.subtitle': 'Was Momentum für dich verfolgt.',
  'areas.mental.questions': 'Fragen',
  'areas.mental.add': 'Frage hinzufügen',
  'areas.mental.emptyTitle': 'Noch keine Fragen',
  'areas.mental.emptyBody': 'Drei bis fünf Fragen genügen, um eine Richtung zu erkennen.',
  'areas.mental.offTitle': 'Mental Wellbeing ist aus',
  'areas.mental.offBody': 'Deine bisherigen Antworten bleiben erhalten.',
  'areas.sports.offTitle': 'Sport ist aus',
  'areas.sports.offBody': 'Deine bisherigen Trainings bleiben erhalten.',
  'areas.sports.target': 'Ziel',
  'areas.sports.targetValue': '{count} Trainings / Woche',
  'areas.archiveShow': 'Archiv ({count})',
  'areas.archiveHide': 'Archiv ausblenden',
  'areas.archiveEmpty': 'Nichts archiviert',

  'question.new': 'Neue Frage',
  'question.edit': 'Frage bearbeiten',
  'question.textLabel': 'Frage',
  'question.textPlaceholder': 'Hast du dein Bett gemacht?',
  'question.textHint': 'Formuliere sie so, dass du sie ohne Nachdenken beantworten kannst.',
  'question.typeLabel': 'Antwortart',
  'question.typeBoolean': 'Ja / Nein',
  'question.typeScale': 'Skala 1–10',
  'question.typeBooleanBadge': 'Ja/Nein',
  'question.typeScaleBadge': 'Skala',
  'question.typeBooleanHint': 'Erledigt oder nicht. Für die meisten Dinge die bessere Wahl.',
  'question.typeScaleHint': 'Von 1 bis 10, für Dinge ohne klares Ende wie Schlaf oder Energie.',
  'question.daily': 'Täglich',
  'question.pause': 'Pausieren',
  'question.resume': 'Fortsetzen',
  'question.archive': 'Archivieren',
  'question.archiveConfirm': 'Frage archivieren?',
  'question.archiveExplain':
    'Sie wird nicht mehr gestellt. Dein bisheriger Verlauf bleibt vollständig erhalten.',
  'question.statusPaused': 'Pausiert',
  'question.statusArchived': 'Archiviert',
  'question.emptyText': 'Gib der Frage einen Text.',

  'today.date': '{weekday}, {date}',
  'today.progress': '{done} von {total} beantwortet',
  'today.allDone': 'Für heute erledigt',
  'today.emptyTitle': 'Noch nichts eingerichtet',
  'today.emptyBody': 'Lege unter Bereiche fest, was Momentum für dich verfolgen soll.',
  'today.emptyAction': 'Zu den Bereichen',
  'today.noQuestionsTitle': 'Keine Fragen aktiv',
  'today.noQuestionsBody': 'Unter Bereiche kannst du jederzeit welche hinzufügen.',
  'today.closed': 'Dieser Tag ist abgeschlossen.',

  'answer.yes': 'Ja',
  'answer.no': 'Nein',
  'answer.for': 'Antwort auf: {question}',
  'answer.clear': 'Antwort entfernen',
  'answer.scaleValue': '{value} von 10 – {band}',

  'sports.thisWeek': 'Diese Woche',
  'sports.progress': '{done} / {target} Trainings',
  'sports.remaining': 'Noch {count}',
  'sports.met': 'Ziel erreicht',
  'sports.exceeded': 'Ziel übertroffen',
  'sports.log': 'Training eintragen',
  'sports.session': 'Training',
  'sports.sessionCount': '{count} heute',
  'sports.type': 'Art',
  'sports.typePlaceholder': 'Laufen, Kraft, …',
  'sports.note': 'Notiz',
  'sports.notePlaceholder': 'Optional',
  'sports.duration': 'Dauer',
  'sports.durationUnit': 'Minuten',
  'sports.delete': 'Training löschen',
  'sports.weekClosed': 'Diese Woche ist abgeschlossen.',

  'placeholder.body': 'Dieser Bereich entsteht in einer späteren Stufe.',

  'error.storage.title': 'Daten konnten nicht geladen werden',
  'error.storage.body':
    'Momentum speichert alles lokal auf diesem Gerät. Im privaten Modus mancher Browser ist das nicht möglich.',
} as const;

export type TranslationKey = keyof typeof de;
export type Translations = Record<TranslationKey, string>;
