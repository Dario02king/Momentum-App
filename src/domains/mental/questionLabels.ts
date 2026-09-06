import type { QuestionStatus, QuestionType } from '../../core/model';
import type { TranslationKey } from '../../i18n';

/** Short badge text — "Ja/Nein" or "Skala". Never colour on its own. */
export function questionTypeBadgeKey(type: QuestionType): TranslationKey {
  return type === 'scale' ? 'question.typeScaleBadge' : 'question.typeBooleanBadge';
}

export function questionTypeLabelKey(type: QuestionType): TranslationKey {
  return type === 'scale' ? 'question.typeScale' : 'question.typeBoolean';
}

/**
 * Status is only worth saying when it is not the normal one.
 *
 * Every active question is asked daily, so labelling each row "Täglich" adds
 * a word to every line and distinguishes nothing. Paused and archived are
 * the states worth calling out.
 */
export function questionStatusBadgeKey(status: QuestionStatus): TranslationKey | null {
  if (status === 'paused') return 'question.statusPaused';
  if (status === 'archived') return 'question.statusArchived';
  return null;
}
