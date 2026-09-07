/**
 * Every tunable number in Momentum lives here.
 *
 * Scoring, rating and rank behaviour will need tuning once the app has been
 * used for real, and hunting constants through feature code is how tuning
 * turns into regressions. Nothing outside this file should hard-code a
 * threshold, a weight or a window length.
 */

/** Days after a day on which its check-ins may still be edited (today + 3). */
export const EDIT_WINDOW_DAYS = 3;

/** Scale questions are answered on this inclusive integer range. */
export const SCALE_MIN = 1;
export const SCALE_MAX = 10;

/**
 * The fixed 1–10 mapping (D13 of iteration 2), and the only one there is.
 *
 * ```
 *   1 2 3 4   red
 *   5         orange
 *   6         yellow
 *   7 8       green
 *   9 10      dark green
 * ```
 *
 * `from` is inclusive and `to` exclusive, so the boundaries are unambiguous
 * and the last band takes SCALE_MAX with it. The same bands drive colour,
 * label and summary text everywhere a 1–10 value appears, so the three can
 * never disagree — and colour is never the only carrier: the band is spelled
 * out in words wherever it is shown.
 */
export const SCALE_BANDS = [
  { id: 'poor', from: 1.0, to: 5.0 },
  { id: 'fair', from: 5.0, to: 6.0 },
  { id: 'okay', from: 6.0, to: 7.0 },
  { id: 'good', from: 7.0, to: 9.0 },
  { id: 'veryGood', from: 9.0, to: 10.0001 },
] as const;

export type ScaleBandId = (typeof SCALE_BANDS)[number]['id'];

/**
 * Performance bands for day and domain scores (percentages, 0–100).
 * Used by the heatmap and the trend annotations. Colour is never the only
 * carrier of meaning, so each band also has a label key in the string layer.
 */
export const SCORE_BANDS = [
  { id: 'low', from: 0, to: 40 },
  { id: 'fair', from: 40, to: 65 },
  { id: 'good', from: 65, to: 85 },
  { id: 'high', from: 85, to: 100.0001 },
] as const;

export type ScoreBandId = (typeof SCORE_BANDS)[number]['id'];

/** Rating engine — an internal 0–1000 number that drives the current rank. */
export const RATING = {
  MIN: 0,
  MAX: 1000,
  /** Day-one value. Not 0 (a punishing first impression), not the midpoint
   *  (which would guarantee a decline in week one). */
  START: 250,
  /** During the first N days of use the rating may rise but never fall. */
  CALIBRATION_DAYS: 14,
  /** Half-life in days of the exponentially weighted moving average. */
  HALF_LIFE_DAYS: 14,
  /** Streak bonus: total contribution is capped and each further day adds less. */
  STREAK_BONUS_CAP: 50,
  STREAK_BONUS_PER_DAY: 4,
  /** Inactivity decay per day, by how long the inactivity has lasted. */
  DECAY: {
    GRACE_DAYS: 2,
    SMALL_UNTIL_DAY: 7,
    SMALL_PER_DAY: 1.5,
    LARGE_PER_DAY: 3,
    /** A single inactivity episode can never cost more than this. */
    MAX_PER_EPISODE: 60,
  },
} as const;

/** Eight ranks, no divisions. Names stay English in every language. */
export const RANKS = [
  { id: 'rookie', name: 'Rookie', min: 0 },
  { id: 'challenger', name: 'Challenger', min: 120 },
  { id: 'contender', name: 'Contender', min: 260 },
  { id: 'elite', name: 'Elite', min: 410 },
  { id: 'veteran', name: 'Veteran', min: 560 },
  { id: 'master', name: 'Master', min: 700 },
  { id: 'champion', name: 'Champion', min: 830 },
  { id: 'legend', name: 'Legend', min: 950 },
] as const;

export type RankId = (typeof RANKS)[number]['id'];

/** The rating must fall this far below a threshold before a demotion sticks. */
export const RANK_DEMOTION_HYSTERESIS = 15;

/**
 * And it must stay there this many scored days running.
 *
 * Promotion is immediate, because reaching a rank is an achievement the
 * moment it happens. Demotion has to be a trend: a dip that recovers within
 * a couple of days was never a change in standing, and §13 requires that a
 * single bad day cannot cost a tier — including through its after-effects.
 */
export const RANK_DEMOTION_SUSTAIN_DAYS = 3;

/** Lifetime XP. Never decreases, never spendable, never purchasable. */
export const XP = {
  PER_ANSWERED_ITEM: 5,
  PER_COMPLETED_DAY: 20,
  PER_SPORTS_SESSION: 25,
  PER_WEEKLY_TARGET_MET: 60,
} as const;

/** Trend ranges offered on the Progress screen. 90 is reserved for later. */
export const TREND_RANGES = [7, 30] as const;
export const HEATMAP_DAYS = 30;
/** Window of the rolling average used to suppress daily noise in the curve. */
export const TREND_SMOOTHING_DAYS = 7;

/**
 * How far the smoothed value must move before the trend is called rising or
 * falling. Inside this band it is steady — the screen answers a directional
 * question, and calling every wobble a direction would make it meaningless.
 */
export const TREND_STEADY_BAND = 2;

/** Below this many scored days there is no trend to state, and the screen
 *  says so rather than drawing a line through nothing. */
export const TREND_MIN_SCORED_DAYS = 5;

/** A run of days with no data at least this long is worth annotating. */
export const INACTIVITY_ANNOTATION_DAYS = 4;

/**
 * Sports. The target is capped at seven — one session per day — because the
 * picker shows every choice as a bubble and a weekly quota above "every day"
 * stops describing a week.
 */
export const SPORTS = {
  MIN_TARGET_PER_WEEK: 1,
  MAX_TARGET_PER_WEEK: 7,
  DEFAULT_TARGET_PER_WEEK: 3,
} as const;

/**
 * Gym and Running each own a weekly quota (§4 of iteration 2).
 *
 * Deliberately two constants rather than one shared `SPORTS`: the product
 * decision is that the two targets move independently, and a single constant
 * is how they would quietly become coupled again.
 */
export const GYM = {
  MIN_TARGET_PER_WEEK: 1,
  MAX_TARGET_PER_WEEK: 7,
  DEFAULT_TARGET_PER_WEEK: 3,
} as const;

export const RUNNING = {
  MIN_TARGET_PER_WEEK: 1,
  MAX_TARGET_PER_WEEK: 7,
  DEFAULT_TARGET_PER_WEEK: 2,
} as const;

/**
 * Boss Rank.
 *
 * The Boss is a weighted mean of how far each active domain has climbed the
 * one shared ladder, so it needs no thresholds of its own — it borrows
 * `RANKS`. The only tunable is how small a weight the user may give a domain
 * before it stops meaning anything.
 */
export const BOSS = {
  /** No domain may end up counting for less than this share of the Boss. */
  MIN_WEIGHT: 0.05,
  /** Weight picker granularity, in relative-importance steps. */
  WEIGHT_STEP: 0.5,
} as const;

/** Onboarding recommends three to five questions. */
export const RECOMMENDED_QUESTION_COUNT = { min: 3, max: 5 } as const;
