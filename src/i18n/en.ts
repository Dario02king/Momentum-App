import type { Translations } from './de';

/**
 * Rank names (Rookie, Challenger, Elite, Legend …) and training terminology
 * are deliberately absent from both language files: they stay English in
 * every mode and live with the rank configuration instead.
 */
export const en: Translations = {
  'app.name': 'Momentum',
  'app.tagline': 'See where your life is heading.',

  'nav.today': 'Today',
  'nav.progress': 'Progress',
  'nav.rank': 'Rank',
  'nav.areas': 'Areas',

  'domain.mental': 'Mental Wellbeing',
  'domain.sports': 'Sports',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.done': 'Done',
  'common.back': 'Back',
  'common.continue': 'Continue',
  'common.settings': 'Settings',
  'common.language': 'Language',
  'common.today': 'Today',
  'common.yesterday': 'Yesterday',
  'common.loading': 'Loading',

  'scale.poor': 'Poor',
  'scale.okay': 'Okay',
  'scale.good': 'Good',
  'scale.veryGood': 'Very good',

  'score.low': 'Weak',
  'score.fair': 'Mixed',
  'score.good': 'Good',
  'score.high': 'Strong',
  'score.none': 'No data',

  'day.open': 'Still open',
  'day.missed': 'Missed',
  'day.neutral': 'Nothing due',

  'error.storage.title': 'Your data could not be loaded',
  'error.storage.body':
    'Momentum keeps everything locally on this device, which some browsers block in private mode.',
};
