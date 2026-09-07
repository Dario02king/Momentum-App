import { QUESTION_CATEGORIES, type Language, type QuestionCategory, type QuestionType } from '../../core/model';
import type { TranslationKey } from '../../i18n';

export interface SuggestedQuestion {
  id: string;
  category: QuestionCategory;
  text: string;
  type: QuestionType;
}

/**
 * The library of Wellbeing questions offered during setup.
 *
 * Organised by the part of life a question belongs to (D17), because that is
 * how the daily score is computed: the mean within a category, then the mean
 * across categories. Six questions about the household cannot drown out the
 * one that asks how the user actually feels — and a user picking from a flat
 * list would produce exactly that imbalance without ever intending to.
 *
 * Each one is a literal sentence rather than a keyword, and each is
 * answerable without thinking. The mix of types is deliberate: a state with
 * no "done" moment is a scale, an action is yes/no.
 *
 * A suggestion is only a seed. Once picked, its text is copied into a normal
 * question record and belongs to the user, so later edits to this list never
 * disturb anyone's history. The five that RC2 shipped keep their exact
 * wording, so a migrated question and a newly picked one are the same
 * question rather than two that merely look alike.
 */
const LIBRARY: Record<Language, SuggestedQuestion[]> = {
  de: [
    // Alltag — kochen, aufräumen, Routinen.
    { id: 'cook', category: 'alltag', text: 'Hast du heute selbst gekocht?', type: 'boolean' },
    { id: 'tidy', category: 'alltag', text: 'Hast du heute aufgeräumt?', type: 'boolean' },
    { id: 'routine', category: 'alltag', text: 'Wie gut hat dein Alltag heute funktioniert?', type: 'scale' },
    { id: 'outside', category: 'alltag', text: 'Warst du heute an der frischen Luft?', type: 'boolean' },

    // Gesundheit — Energie, Schlaf, körperliches Wohlbefinden.
    { id: 'sleep', category: 'gesundheit', text: 'Wie gut hast du geschlafen?', type: 'scale' },
    { id: 'energy', category: 'gesundheit', text: 'Wie hoch war dein Energielevel?', type: 'scale' },
    { id: 'body', category: 'gesundheit', text: 'Wie hat sich dein Körper heute angefühlt?', type: 'scale' },
    { id: 'water', category: 'gesundheit', text: 'Hast du heute genug getrunken?', type: 'boolean' },

    // Mental — Stimmung, Motivation, seelischer Zustand.
    { id: 'satisfaction', category: 'mental', text: 'Wie zufrieden bist du heute mit deinem Tag?', type: 'scale' },
    { id: 'mood', category: 'mental', text: 'Wie war deine Stimmung heute?', type: 'scale' },
    { id: 'motivation', category: 'mental', text: 'Wie motiviert warst du heute?', type: 'scale' },
    { id: 'time', category: 'mental', text: 'Hast du dir heute bewusst Zeit für dich genommen?', type: 'boolean' },
    { id: 'good', category: 'mental', text: 'Hast du heute etwas gemacht, das dir gutgetan hat?', type: 'boolean' },
  ],
  en: [
    { id: 'cook', category: 'alltag', text: 'Did you cook for yourself today?', type: 'boolean' },
    { id: 'tidy', category: 'alltag', text: 'Did you tidy up today?', type: 'boolean' },
    { id: 'routine', category: 'alltag', text: 'How well did your day run?', type: 'scale' },
    { id: 'outside', category: 'alltag', text: 'Did you get outside today?', type: 'boolean' },

    { id: 'sleep', category: 'gesundheit', text: 'How well did you sleep?', type: 'scale' },
    { id: 'energy', category: 'gesundheit', text: 'How high was your energy level?', type: 'scale' },
    { id: 'body', category: 'gesundheit', text: 'How did your body feel today?', type: 'scale' },
    { id: 'water', category: 'gesundheit', text: 'Did you drink enough today?', type: 'boolean' },

    { id: 'satisfaction', category: 'mental', text: 'How satisfied are you with your day?', type: 'scale' },
    { id: 'mood', category: 'mental', text: 'How was your mood today?', type: 'scale' },
    { id: 'motivation', category: 'mental', text: 'How motivated were you today?', type: 'scale' },
    { id: 'time', category: 'mental', text: 'Did you take time for yourself today?', type: 'boolean' },
    { id: 'good', category: 'mental', text: 'Did you do something today that was good for you?', type: 'boolean' },
  ],
};

/**
 * The categories a user picks from, in the order they are offered.
 *
 * "Eigene" is not among them: it is where a question the user writes lands,
 * not a shelf with anything on it.
 */
export const PICKABLE_CATEGORIES: QuestionCategory[] = QUESTION_CATEGORIES.filter(
  (category) => category !== 'eigene',
);

export const CATEGORY_LABEL_KEYS = {
  alltag: 'category.alltag',
  gesundheit: 'category.gesundheit',
  mental: 'category.mental',
  eigene: 'category.eigene',
} as const satisfies Record<QuestionCategory, TranslationKey>;

export const CATEGORY_DESCRIPTION_KEYS = {
  alltag: 'category.alltag.description',
  gesundheit: 'category.gesundheit.description',
  mental: 'category.mental.description',
  eigene: 'category.eigene.description',
} as const satisfies Record<QuestionCategory, TranslationKey>;

export function suggestedQuestions(language: Language): SuggestedQuestion[] {
  return LIBRARY[language];
}

export function suggestionsByCategory(
  language: Language,
): { category: QuestionCategory; questions: SuggestedQuestion[] }[] {
  const all = suggestedQuestions(language);
  return PICKABLE_CATEGORIES.map((category) => ({
    category,
    questions: all.filter((question) => question.category === category),
  }));
}
