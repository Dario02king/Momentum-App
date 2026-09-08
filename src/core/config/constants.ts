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

/**
 * The Wellbeing scoring model this build writes into new config snapshots.
 *
 * Changing it changes what *future* days mean and nothing else: every day
 * already lived resolves to the snapshot it was lived under, which records
 * the model it was scored by.
 */
export const SCORING_MODEL = 'categoryMean' as const;

/**
 * The Gym scoring model this build writes into new config snapshots.
 *
 * Same rule as `SCORING_MODEL`: it decides what *future* days mean and
 * nothing else. Every day already lived resolves to the snapshot it was lived
 * under, and a snapshot with no `gymModel` predates this change — those days
 * keep the attendance-only level the user actually saw.
 */
export const GYM_SCORING_MODEL = 'attendancePerformance' as const;

/** Onboarding recommends three to five questions. */
export const RECOMMENDED_QUESTION_COUNT = { min: 3, max: 5 } as const;

/**
 * The Gym rating model (Phase 4.1).
 *
 * Gym Rank is **40 % attendance and 60 % personal development**, and it is
 * emphatically not a measure of absolute strength — that is what Tombstones
 * are for. Every number below is relative to the user's own history, so
 * someone lifting light weights consistently and improving reaches the same
 * ranks as someone lifting heavy ones.
 */
export const GYM_RATING = {
  /** The 40/60 split of the target rating. The two must sum to 1. */
  ATTENDANCE_WEIGHT: 0.4,
  PERFORMANCE_WEIGHT: 0.6,

  /** The rolling short-term window, in days, ending on the calculation date. */
  TREND_WINDOW_DAYS: 60,
  /** Trend and year-to-date contribute equally to the Performance Score. */
  TREND_WEIGHT: 0.5,
  YTD_WEIGHT: 0.5,

  /**
   * The performance curve, as one parameter.
   *
   * `score / (1000 − score) = ODDS_PER_DECADE ^ (change% / DECADE_PERCENT)`,
   * so every ten points of improvement multiplies the odds by four: 0 % is
   * evens and scores 500, +10 % is 4:1 and scores 800, −10 % is 1:4 and
   * scores 200. See `core/gym/score.ts` for the derivation and the fit.
   */
  CURVE_ODDS_PER_DECADE: 4,
  CURVE_DECADE_PERCENT: 10,

  /** How much of the remaining gap to the target one update closes. */
  BASE_MOVEMENT: 0.1,
  /**
   * At or below this rating the full base movement applies, and above it the
   * *upward* step is scaled by the remaining headroom. Downward movement is
   * never slowed: a high rank is harder to climb, not protected from falling.
   */
  MOVEMENT_FULL_SPEED_BELOW: 500,

  /** Net completed weeks the Endurance Phase asks for before a first promotion. */
  ENDURANCE_WEEKS_REQUIRED: 4,
  ENDURANCE_WEEK_MET: 1,
  ENDURANCE_WEEK_MISSED: -0.5,

  /** Consecutive days with no saved session that make one abstinence block. */
  ABSTINENCE_BLOCK_DAYS: 7,

  /** Gym training age at which Maintenance becomes a legitimate state. */
  MAINTENANCE_MIN_MONTHS: 12,
  /**
   * How close to 0 % counts as "unchanged" for Maintenance, in percentage
   * points. Aggregating ratios over groups leaves float dust well below
   * 1e-9 %; a quarter of a point is far under one rep or one micro-plate on
   * any real best set, so it can only ever absorb noise.
   */
  MAINTENANCE_TOLERANCE_PERCENT: 0.25,
} as const;

/**
 * Primary and secondary muscle influence (D92).
 *
 * One exercise is worth 100 %, however many groups it touches. Primaries
 * share the first number, secondaries the second, and each share is split
 * equally inside its role.
 */
export const MUSCLE_ROLE_WEIGHTS = {
  PRIMARY: 0.7,
  SECONDARY: 0.3,
} as const;

/**
 * Inactivity decay, by Gym training age (Phase 4.1 §14).
 *
 * Each phase is one number: the share of the rank progress held at the start
 * of the abstinence episode that each completed 7-day block removes. They are
 * **cumulative against that baseline and never compounded against the
 * remainder**, so the 25 % phase runs 80 → 60 → 40 → 20 → 0, not 80 → 60 →
 * 45 → 33.75.
 *
 * `fromMonth` is inclusive and phases are non-overlapping: a user whose Gym
 * training age is 2 completed months is in their third month and decays at
 * 25 % a block.
 */
export const GYM_DECAY_PHASES = [
  { id: 'early', fromMonth: 0, perBlock: 0.5 },
  { id: 'settling', fromMonth: 2, perBlock: 0.25 },
  { id: 'established', fromMonth: 4, perBlock: 0.2 },
  { id: 'mature', fromMonth: 12, perBlock: 0.1 },
] as const;

export type GymDecayPhaseId = (typeof GYM_DECAY_PHASES)[number]['id'];
