import type { DateKey, WeekKey } from '../dates/types';
import type { RankId } from '../config/constants';

/**
 * Schema v1.
 *
 * Two rules shape these records, both aimed at versions 2 and 3:
 *
 * 1. Domains are *records*, not hard-coded screens. Adding a `food` domain
 *    later means inserting a row, not migrating Mental Wellbeing history.
 * 2. A sports session already has a place to hang workout detail
 *    (`detail`), so version 2 can attach exercises, sets and weights as an
 *    additive write rather than a migration.
 */
export const SCHEMA_VERSION = 1;

/** `food` is reserved for version 3 and deliberately not handled in the UI. */
export type DomainType = 'mental' | 'sports';

/** Mental Wellbeing carries no configuration of its own — its questions are
 *  records in their own right. */
export type MentalDomainSettings = Record<string, never>;

/**
 * A weekly quota: the user aims for `targetPerWeek` sessions and logs them on
 * whatever days they happen. This is the shape any future domain with a
 * weekly target reuses — no fixed training days, no per-item schedules.
 */
export interface SportsDomainSettings {
  targetPerWeek: number;
}

interface DomainBase {
  id: string;
  enabled: boolean;
  /** Display order in Today and Areas. */
  order: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A domain carries its own configuration, so a version 3 food domain is a new
 * member of this union plus a settings type — no change to the records that
 * Mental Wellbeing history already depends on.
 */
export type DomainRecord =
  | (DomainBase & { type: 'mental'; settings: MentalDomainSettings })
  | (DomainBase & { type: 'sports'; settings: SportsDomainSettings });

/** Default configuration for a newly enabled domain. */
export type DomainSettingsFor<T extends DomainType> = Extract<
  DomainRecord,
  { type: T }
>['settings'];

export type QuestionType = 'boolean' | 'scale';

/**
 * `paused` questions stop being asked but stay visible in Areas.
 * `archived` questions disappear from Areas — their history is never deleted.
 */
export type QuestionStatus = 'active' | 'paused' | 'archived';

/**
 * A Mental Wellbeing question. Asked once per calendar day, every day.
 *
 * Questions carry no schedule of their own: anything that is genuinely a
 * weekly quota belongs to a domain with a weekly target, the way Sports
 * works, rather than to a question pretending to be due on some days and not
 * on others. That keeps the daily check-in a single unambiguous act and
 * keeps "was this due?" out of the scoring path entirely.
 */
export interface QuestionRecord {
  id: string;
  domainId: string;
  /** The literal sentence asked, e.g. "Hast du dein Bett gemacht?". */
  text: string;
  type: QuestionType;
  status: QuestionStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

/** `true`/`false` for boolean questions, 1–10 for scale questions. */
export type AnswerValue = boolean | number;

/**
 * One answer per question per calendar day — the id enforces it, so a question
 * can never be asked twice on the same day.
 */
export interface AnswerRecord {
  id: string;
  date: DateKey;
  questionId: string;
  domainId: string;
  value: AnswerValue;
  valueType: QuestionType;
  /** The configuration in force when this answer was written (§18). */
  configSnapshotId: string;
  createdAt: string;
  updatedAt: string;
}

export function answerId(date: DateKey, questionId: string): string {
  return `${date}#${questionId}`;
}

/**
 * Version 2 workout detail. Nothing in version 1 writes or reads this; it
 * exists so that attaching exercises later needs no schema migration.
 */
export interface SessionDetail {
  kind: string;
  [key: string]: unknown;
}

export interface SportsSessionRecord {
  id: string;
  domainId: string;
  /** Local day the session belongs to. */
  date: DateKey;
  /** Monday-to-Sunday week the session counts towards. */
  weekKey: WeekKey;
  performedAt: string;
  activityType: string | null;
  note: string | null;
  durationMinutes: number | null;
  detail: SessionDetail | null;
  configSnapshotId: string;
  createdAt: string;
  updatedAt: string;
}

/** A question as it stood when a snapshot was taken. */
export interface QuestionConfigSnapshot {
  id: string;
  domainId: string;
  text: string;
  type: QuestionType;
  status: QuestionStatus;
}

export type DomainConfigSnapshot = {
  [T in DomainType]: {
    id: string;
    type: T;
    enabled: boolean;
    settings: DomainSettingsFor<T>;
  };
}[DomainType];

/**
 * The scoring-relevant configuration in force from `effectiveFrom` onwards.
 *
 * Version 1 deliberately uses snapshots rather than a bitemporal revision
 * system: a new snapshot is appended whenever scoring-relevant configuration
 * changes, and any past day is evaluated against the latest snapshot whose
 * `effectiveFrom` is on or before it. If the sports target rises in April,
 * January is still scored against the old target.
 */
export interface AppConfigSnapshot {
  domains: DomainConfigSnapshot[];
  questions: QuestionConfigSnapshot[];
  scoring: {
    editWindowDays: number;
    scaleMin: number;
    scaleMax: number;
  };
}

/** The sports target a given snapshot was taken under, or null if the domain
 *  was not enabled then. */
export function sportsTargetOf(snapshot: AppConfigSnapshot): number | null {
  const sports = snapshot.domains.find((domain) => domain.type === 'sports');
  return sports && sports.enabled ? sports.settings.targetPerWeek : null;
}

export interface ConfigSnapshotRecord {
  id: string;
  effectiveFrom: DateKey;
  createdAt: string;
  config: AppConfigSnapshot;
}

export type Language = 'de' | 'en';

export interface SettingsRecord {
  /** Singleton. */
  id: 'settings';
  language: Language;
  /** The first day the app was used — the origin of every history range. */
  firstUseDate: DateKey;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RankEventKind = 'promotion' | 'demotion';

/**
 * Rank changes are derived from the rating, but the crossings are logged so
 * the Rank screen can show history and play a promotion reveal exactly once.
 */
export interface RankEventRecord {
  id: string;
  date: DateKey;
  kind: RankEventKind;
  fromRankId: RankId | null;
  toRankId: RankId;
  rating: number;
  /** Set once the promotion reveal has been shown, so it never replays. */
  acknowledgedAt: string | null;
  createdAt: string;
}
