import type { Language, QuestionType } from '../../core/model';

export interface SuggestedQuestion {
  id: string;
  text: string;
  type: QuestionType;
}

/**
 * The starting set offered during onboarding.
 *
 * Each one is a literal sentence rather than a keyword, and each is
 * answerable without thinking. The mix is deliberate: the three states with
 * no "done" moment are scales, the two actions are yes/no.
 *
 * A suggestion is only a seed. Once picked, its text is copied into a normal
 * question record and belongs to the user, so later edits to this list never
 * disturb anyone's history.
 */
const SUGGESTIONS: Record<Language, SuggestedQuestion[]> = {
  de: [
    { id: 'sleep', text: 'Wie gut hast du geschlafen?', type: 'scale' },
    { id: 'energy', text: 'Wie hoch war dein Energielevel?', type: 'scale' },
    { id: 'satisfaction', text: 'Wie zufrieden bist du heute mit deinem Tag?', type: 'scale' },
    { id: 'time', text: 'Hast du dir heute bewusst Zeit für dich genommen?', type: 'boolean' },
    { id: 'good', text: 'Hast du heute etwas gemacht, das dir gutgetan hat?', type: 'boolean' },
  ],
  en: [
    { id: 'sleep', text: 'How well did you sleep?', type: 'scale' },
    { id: 'energy', text: 'How high was your energy level?', type: 'scale' },
    { id: 'satisfaction', text: 'How satisfied are you with your day?', type: 'scale' },
    { id: 'time', text: 'Did you take time for yourself today?', type: 'boolean' },
    { id: 'good', text: 'Did you do something today that was good for you?', type: 'boolean' },
  ],
};

export function suggestedQuestions(language: Language): SuggestedQuestion[] {
  return SUGGESTIONS[language];
}
