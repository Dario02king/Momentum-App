import { isValidDateKey, isValidWeekKey } from '../dates';
import {
  SCHEMA_VERSION,
  type AnswerRecord,
  type ConfigSnapshotRecord,
  type DomainRecord,
  type ExerciseRecord,
  type FoodEntryRecord,
  type GymPlanRecord,
  type GymSessionRecord,
  type GymSetRecord,
  type PausePeriodRecord,
  type ProfileRecord,
  type QuestionRecord,
  type RankEventRecord,
  type RestDayRecord,
  type RunRecord,
  type SettingsRecord,
  type SportsSessionRecord,
  type TombstoneUnlockRecord,
  type WeightEntryRecord,
} from '../model';

/**
 * The backup file (§19).
 *
 * Two rules shape it:
 *
 * 1. **Canonical source data only.** Ratings, ranks, streaks, XP, trends and
 *    day scores are all replayed from answers, sessions and configuration
 *    snapshots, so exporting them would mean shipping two versions of the
 *    truth that could disagree. What is exported is what cannot be derived.
 * 2. **Validate everything before touching anything.** A backup is opened by
 *    a user who may have edited it, renamed something else to `.json`, or
 *    kept it from a future version of the app. None of those may leave a
 *    half-replaced profile behind.
 */

export const BACKUP_FORMAT = 'momentum-backup';

/**
 * The envelope version, separate from the record schema version.
 *
 * They move for different reasons: the envelope changes when the file's
 * shape changes, the schema when a record's shape does. Keeping both means a
 * future reader can tell which of the two it does not understand.
 */
export const BACKUP_FORMAT_VERSION = 2;

/**
 * Version 2 adds collections; it removes and renames nothing.
 *
 * That is what makes a version 1 backup still import: the reader refuses only
 * a file *newer* than it understands (`formatVersion > BACKUP_FORMAT_VERSION`),
 * and every collection version 2 introduced is read as empty when absent. A
 * user restoring a file exported before the upgrade gets their whole profile
 * back, with the new areas simply not started yet.
 */

export interface BackupData {
  settings: SettingsRecord | null;
  domains: DomainRecord[];
  questions: QuestionRecord[];
  answers: AnswerRecord[];
  sportsSessions: SportsSessionRecord[];
  configSnapshots: ConfigSnapshotRecord[];
  /** Retained because it is part of schema v1; rank history is derived. */
  rankEvents: RankEventRecord[];
  /* ── Added in format version 2. Absent in a version 1 file. ─────────── */
  profile: ProfileRecord | null;
  exercises: ExerciseRecord[];
  gymPlans: GymPlanRecord[];
  gymSessions: GymSessionRecord[];
  gymSets: GymSetRecord[];
  runs: RunRecord[];
  foodEntries: FoodEntryRecord[];
  weightEntries: WeightEntryRecord[];
  restDays: RestDayRecord[];
  pausePeriods: PausePeriodRecord[];
  tombstones: TombstoneUnlockRecord[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  app: { name: string; version: string };
  data: BackupData;
}

/** What the confirmation step shows before anything is replaced. */
export interface BackupSummary {
  exportedAt: string;
  questions: number;
  answers: number;
  sessions: number;
  firstDay: string | null;
  lastDay: string | null;
}

export type BackupProblem =
  | 'notJson'
  | 'notABackup'
  | 'newerFormat'
  | 'newerSchema'
  | 'malformed';

export type ValidationResult =
  | { ok: true; backup: BackupFile; summary: BackupSummary }
  | { ok: false; problem: BackupProblem; details: string[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';
const isIsoish = (value: unknown): boolean => isString(value) && !Number.isNaN(Date.parse(value));

function checkArray(
  value: unknown,
  name: string,
  check: (item: Record<string, unknown>, index: number) => string | null,
  problems: string[],
): unknown[] {
  if (!Array.isArray(value)) {
    problems.push(`${name} is missing or not a list`);
    return [];
  }
  const ids = new Set<string>();
  value.forEach((item, index) => {
    if (!isObject(item)) {
      problems.push(`${name}[${index}] is not a record`);
      return;
    }
    const id = item.id;
    if (!isString(id) || id.length === 0) {
      problems.push(`${name}[${index}] has no id`);
    } else if (ids.has(id)) {
      problems.push(`${name} contains the id ${id} twice`);
    } else {
      ids.add(id);
    }
    const problem = check(item, index);
    if (problem) problems.push(`${name}[${index}] ${problem}`);
  });
  return value;
}

const KNOWN_DOMAIN_TYPES = ['mental', 'gym', 'running', 'food', 'sports'];
/** Domains that carry a weekly quota, so a missing target is a real defect. */
const WEEKLY_DOMAIN_TYPES = ['sports', 'gym', 'running'];

function validateDomain(item: Record<string, unknown>): string | null {
  if (typeof item.type !== 'string' || !KNOWN_DOMAIN_TYPES.includes(item.type)) {
    return 'has an unknown type';
  }
  if (typeof item.enabled !== 'boolean') return 'has no enabled flag';
  if (WEEKLY_DOMAIN_TYPES.includes(item.type)) {
    const settings = item.settings;
    if (!isObject(settings) || typeof settings.targetPerWeek !== 'number') {
      return 'has no weekly target';
    }
  }
  return null;
}

/** A dated record with nothing else to check beyond the shared rules. */
function validateDated(item: Record<string, unknown>): string | null {
  return isValidDateKey(item.date) ? null : 'has no valid date';
}

function validateTrainingSession(item: Record<string, unknown>): string | null {
  if (!isValidDateKey(item.date)) return 'has no valid date';
  if (!isValidWeekKey(item.weekKey)) return 'has no valid week';
  return null;
}

function validateFoodEntry(item: Record<string, unknown>): string | null {
  if (!isValidDateKey(item.date)) return 'has no valid date';
  if (typeof item.kcal !== 'number' || !Number.isFinite(item.kcal)) return 'has no energy value';
  return null;
}

function validateWeightEntry(item: Record<string, unknown>): string | null {
  if (!isValidDateKey(item.date)) return 'has no valid date';
  if (typeof item.kg !== 'number' || !Number.isFinite(item.kg)) return 'has no weight';
  return null;
}

function validatePause(item: Record<string, unknown>): string | null {
  if (!isValidDateKey(item.from)) return 'has no valid start date';
  if (item.to !== null && !isValidDateKey(item.to)) return 'has an invalid end date';
  return null;
}

function validateQuestion(item: Record<string, unknown>): string | null {
  if (!isString(item.text)) return 'has no text';
  if (item.type !== 'boolean' && item.type !== 'scale') return 'has an unknown answer type';
  if (item.status !== 'active' && item.status !== 'paused' && item.status !== 'archived') {
    return 'has an unknown status';
  }
  if (!isString(item.domainId)) return 'has no area';
  return null;
}

function validateAnswer(item: Record<string, unknown>): string | null {
  if (!isValidDateKey(item.date)) return 'has no valid date';
  if (!isString(item.questionId)) return 'has no question';
  if (item.valueType === 'boolean') {
    if (typeof item.value !== 'boolean') return 'has a value that is not yes or no';
  } else if (item.valueType === 'scale') {
    const value = item.value;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 10) {
      return 'has a scale value outside 1 to 10';
    }
  } else {
    return 'has an unknown answer type';
  }
  return null;
}

function validateSession(item: Record<string, unknown>): string | null {
  if (!isValidDateKey(item.date)) return 'has no valid date';
  if (!isValidWeekKey(item.weekKey)) return 'has no valid week';
  if (!isIsoish(item.performedAt)) return 'has no valid time';
  return null;
}

function validateSnapshot(item: Record<string, unknown>): string | null {
  if (!isValidDateKey(item.effectiveFrom)) return 'has no valid start date';
  const config = item.config;
  if (!isObject(config)) return 'has no configuration';
  if (!Array.isArray(config.domains) || !Array.isArray(config.questions)) {
    return 'has an incomplete configuration';
  }
  return null;
}

function validateSettings(value: unknown, problems: string[]): void {
  if (value === null) return;
  if (!isObject(value)) {
    problems.push('settings is not a record');
    return;
  }
  if (value.language !== 'de' && value.language !== 'en') problems.push('settings has no language');
  if (!isValidDateKey(value.firstUseDate)) problems.push('settings has no valid first day');
}

function summarise(data: BackupData, exportedAt: string): BackupSummary {
  const days = [
    ...data.answers.map((answer) => answer.date),
    ...data.sportsSessions.map((session) => session.date),
    ...data.gymSessions.map((session) => session.date),
    ...data.runs.map((run) => run.date),
    ...data.foodEntries.map((entry) => entry.date),
  ].sort();
  return {
    exportedAt,
    questions: data.questions.length,
    answers: data.answers.length,
    // What the confirmation step calls "sessions" is every training session,
    // whichever log now holds it.
    sessions: data.sportsSessions.length + data.gymSessions.length + data.runs.length,
    firstDay: days[0] ?? null,
    lastDay: days[days.length - 1] ?? null,
  };
}

/**
 * Validates a parsed backup completely, before any caller touches storage.
 *
 * Every problem found is reported rather than only the first, because a user
 * who has to fix a file benefits from the whole list.
 */
export function validateBackup(input: unknown): ValidationResult {
  if (!isObject(input)) {
    return { ok: false, problem: 'notABackup', details: ['The file is not a Momentum backup'] };
  }
  if (input.format !== BACKUP_FORMAT) {
    return { ok: false, problem: 'notABackup', details: ['The file is not a Momentum backup'] };
  }

  const formatVersion = input.formatVersion;
  if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion) || formatVersion < 1) {
    return { ok: false, problem: 'malformed', details: ['The backup has no valid version'] };
  }
  if (formatVersion > BACKUP_FORMAT_VERSION) {
    // A newer app wrote it. Refuse rather than guess at fields we do not know.
    return {
      ok: false,
      problem: 'newerFormat',
      details: [`The backup was made by a newer version of Momentum (${formatVersion})`],
    };
  }

  const schemaVersion = input.schemaVersion;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return { ok: false, problem: 'malformed', details: ['The backup has no valid data version'] };
  }
  if (schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      problem: 'newerSchema',
      details: [`The backup holds data from a newer version of Momentum (${schemaVersion})`],
    };
  }

  const data = input.data;
  if (!isObject(data)) {
    return { ok: false, problem: 'malformed', details: ['The backup contains no data'] };
  }

  const problems: string[] = [];
  validateSettings(data.settings, problems);
  const domains = checkArray(data.domains, 'domains', validateDomain, problems);
  const questions = checkArray(data.questions, 'questions', validateQuestion, problems);
  const answers = checkArray(data.answers, 'answers', validateAnswer, problems);
  const sessions = checkArray(data.sportsSessions, 'sessions', validateSession, problems);
  const snapshots = checkArray(data.configSnapshots, 'configSnapshots', validateSnapshot, problems);
  const rankEvents = checkArray(data.rankEvents ?? [], 'rankEvents', () => null, problems);

  /*
   * Format version 2 collections. `?? []` is what makes a version 1 file
   * import: the collections did not exist when it was written, and "absent"
   * means "this profile has not started that area", not "the file is broken".
   */
  const exercises = checkArray(data.exercises ?? [], 'exercises', () => null, problems);
  const gymPlans = checkArray(data.gymPlans ?? [], 'gymPlans', () => null, problems);
  const gymSessions = checkArray(
    data.gymSessions ?? [],
    'gymSessions',
    validateTrainingSession,
    problems,
  );
  const gymSets = checkArray(data.gymSets ?? [], 'gymSets', validateDated, problems);
  const runs = checkArray(data.runs ?? [], 'runs', validateTrainingSession, problems);
  const foodEntries = checkArray(data.foodEntries ?? [], 'foodEntries', validateFoodEntry, problems);
  const weightEntries = checkArray(
    data.weightEntries ?? [],
    'weightEntries',
    validateWeightEntry,
    problems,
  );
  const restDays = checkArray(data.restDays ?? [], 'restDays', validateDated, problems);
  const pausePeriods = checkArray(data.pausePeriods ?? [], 'pausePeriods', validatePause, problems);
  const tombstones = checkArray(data.tombstones ?? [], 'tombstones', () => null, problems);

  // Self-consistency: our own exports always satisfy this, and a file that
  // does not would restore a profile with answers to questions that are not
  // there.
  const questionIds = new Set(questions.map((question) => (question as QuestionRecord).id));
  for (const answer of answers as AnswerRecord[]) {
    if (!questionIds.has(answer.questionId)) {
      problems.push(`an answer refers to a question that is not in the backup`);
      break;
    }
  }
  const domainIds = new Set(domains.map((domain) => (domain as DomainRecord).id));
  for (const question of questions as QuestionRecord[]) {
    if (!domainIds.has(question.domainId)) {
      problems.push('a question refers to an area that is not in the backup');
      break;
    }
  }

  if (problems.length > 0) return { ok: false, problem: 'malformed', details: problems };

  const exportedAt = isIsoish(input.exportedAt) ? (input.exportedAt as string) : '';
  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion,
    schemaVersion,
    exportedAt,
    app: isObject(input.app)
      ? { name: String(input.app.name ?? 'Momentum'), version: String(input.app.version ?? '') }
      : { name: 'Momentum', version: '' },
    data: {
      settings: (data.settings ?? null) as SettingsRecord | null,
      domains: domains as DomainRecord[],
      questions: questions as QuestionRecord[],
      answers: answers as AnswerRecord[],
      sportsSessions: sessions as SportsSessionRecord[],
      configSnapshots: snapshots as ConfigSnapshotRecord[],
      rankEvents: rankEvents as RankEventRecord[],
      profile: (data.profile ?? null) as ProfileRecord | null,
      exercises: exercises as ExerciseRecord[],
      gymPlans: gymPlans as GymPlanRecord[],
      gymSessions: gymSessions as GymSessionRecord[],
      gymSets: gymSets as GymSetRecord[],
      runs: runs as RunRecord[],
      foodEntries: foodEntries as FoodEntryRecord[],
      weightEntries: weightEntries as WeightEntryRecord[],
      restDays: restDays as RestDayRecord[],
      pausePeriods: pausePeriods as PausePeriodRecord[],
      tombstones: tombstones as TombstoneUnlockRecord[],
    },
  };

  return { ok: true, backup, summary: summarise(backup.data, exportedAt) };
}

/** Parses text and validates it, so a caller handles one failure shape. */
export function parseBackup(text: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'notJson', details: ['The file could not be read'] };
  }
  return validateBackup(parsed);
}

export function backupFileName(day: string): string {
  return `momentum-backup-${day}.json`;
}
