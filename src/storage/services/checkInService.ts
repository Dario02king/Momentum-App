import { today } from '../../core/clock';
import { EDIT_WINDOW_DAYS } from '../../core/config/constants';
import {
  dayEditState,
  isSameWeek,
  weekKeyOf,
  type DateKey,
  type DayEditState,
  type WeekKey,
} from '../../core/dates';
import { WEEKLY_DOMAIN_TYPES, weeklyTargetOf } from '../../core/domains';
import { isValidScaleValue } from '../../core/scoring/scale';
import type {
  AnswerRecord,
  AnswerValue,
  QuestionRecord,
  StoredDomainType,
} from '../../core/model';
import { weekProgress, type WeekProgress } from '../../domains/sports/weekProgress';
import { ensureCurrentSnapshot } from '../configService';
import {
  answersRepository,
  domainsRepository,
  gymSessionsRepository,
  questionsRepository,
  runsRepository,
  sportsSessionsRepository,
} from '../repositories';

/**
 * The daily check-in.
 *
 * Everything the Today screen reads and writes goes through here, including
 * the two rules that must not be re-implemented in a component:
 *
 * - Daily answers may be written for today and the three preceding days.
 *   Older days are closed and read-only (§17).
 * - A training session may be edited or deleted within the week it belongs
 *   to; sessions are diary entries, not daily check-ins, so they get their
 *   own rule.
 *
 * Training is plural now. Gym and Running are separate quotas with separate
 * logs, and RC2's generic Sport is a third that the product no longer creates
 * but still has to show a migrated user who chose to keep it. All three are
 * the same shape here, so the Today screen has one card to render rather than
 * three cases to branch on.
 */

/** Thrown when a write targets a day the user may no longer change. */
export class EditWindowError extends Error {
  constructor(
    readonly date: DateKey,
    readonly state: DayEditState,
  ) {
    super(`Day ${date} is ${state} and cannot be edited`);
    this.name = 'EditWindowError';
  }
}

export class InvalidAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAnswerError';
  }
}

export interface CheckInItem {
  question: QuestionRecord;
  /** `null` until the question has been answered on this day. */
  answer: AnswerRecord | null;
}

export interface MentalDayView {
  items: CheckInItem[];
  answeredCount: number;
  /** Every active question answered — the day's check-in is complete. */
  complete: boolean;
}

/**
 * One logged training session, whichever log it lives in.
 *
 * A view type rather than a record: Gym sets and run distances belong to
 * their own screens, and the Today card only ever needs "when, and roughly
 * what". Phases 4 and 5 add the detail behind this, not instead of it.
 */
export interface TrainingSession {
  id: string;
  domain: StoredDomainType;
  date: DateKey;
  performedAt: string;
  note: string | null;
  durationMinutes: number | null;
  /**
   * Measured distance in whole metres, for a run. `null` everywhere else, and
   * `null` on a run the user logged without one — which is allowed, and leaves
   * that run counting for attendance and nothing more.
   */
  distanceMetres: number | null;
  /** Carried over from RC2's Sport log, so a screen can say so. */
  legacyCarryOver: boolean;
}

export interface TrainingDayView {
  domain: StoredDomainType;
  weekKey: WeekKey;
  progress: WeekProgress;
  /** This week's sessions, oldest first. */
  sessions: TrainingSession[];
  /** Sessions logged on the day being viewed. */
  sessionsToday: TrainingSession[];
}

export interface DayView {
  date: DateKey;
  editState: DayEditState;
  editable: boolean;
  /** `null` when Wellbeing is disabled or was never enabled. */
  mental: MentalDayView | null;
  /** One entry per enabled weekly-quota domain, in display order. */
  training: TrainingDayView[];
  /** True when nothing is set up — the day has nothing to ask. */
  empty: boolean;
}

function assertEditable(date: DateKey, reference: DateKey): void {
  const state = dayEditState(date, reference, EDIT_WINDOW_DAYS);
  if (state !== 'open') throw new EditWindowError(date, state);
}

const minutesFromSeconds = (seconds: number | null): number | null =>
  seconds === null ? null : Math.round(seconds / 60);

/** Every training log, behind one interface. */
async function loadWeek(domain: StoredDomainType, weekKey: WeekKey): Promise<TrainingSession[]> {
  if (domain === 'gym') {
    return (await gymSessionsRepository.listByWeek(weekKey)).map((session) => ({
      id: session.id,
      domain,
      date: session.date,
      performedAt: session.performedAt,
      note: session.note,
      durationMinutes: null,
      distanceMetres: null,
      legacyCarryOver: session.legacyCarryOver,
    }));
  }
  if (domain === 'running') {
    return (await runsRepository.listByWeek(weekKey)).map((run) => ({
      id: run.id,
      domain,
      date: run.date,
      performedAt: run.performedAt,
      note: run.note,
      durationMinutes: minutesFromSeconds(run.durationSeconds),
      distanceMetres: run.distanceMetres,
      legacyCarryOver: run.legacyCarryOver,
    }));
  }
  return (await sportsSessionsRepository.listByWeek(weekKey)).map((session) => ({
    id: session.id,
    domain: 'sports',
    date: session.date,
    performedAt: session.performedAt,
    note: session.note,
    durationMinutes: session.durationMinutes,
    distanceMetres: null,
    legacyCarryOver: false,
  }));
}

/**
 * Reads everything due on a day.
 *
 * Active questions are due, full stop — there is no schedule to evaluate.
 * A disabled domain is absent rather than empty, so scoring and the UI both
 * distinguish "nothing due" from "nothing tracked".
 */
export async function loadDay(date: DateKey = today(), reference: DateKey = today()): Promise<DayView> {
  const [domains, answers] = await Promise.all([
    domainsRepository.list(),
    answersRepository.listByDate(date),
  ]);

  const mentalDomain = domains.find((domain) => domain.type === 'mental') ?? null;

  let mental: MentalDayView | null = null;
  if (mentalDomain?.enabled) {
    const active = (await questionsRepository.listActive()).filter(
      (question) => question.domainId === mentalDomain.id,
    );
    const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
    const items: CheckInItem[] = active.map((question) => ({
      question,
      answer: byQuestion.get(question.id) ?? null,
    }));
    const answeredCount = items.filter((item) => item.answer !== null).length;
    mental = {
      items,
      answeredCount,
      complete: items.length > 0 && answeredCount === items.length,
    };
  }

  const weekKey = weekKeyOf(date);
  const training: TrainingDayView[] = [];
  for (const type of WEEKLY_DOMAIN_TYPES) {
    const domain = domains.find((entry) => entry.type === type);
    const target = domain ? weeklyTargetOf(domain) : null;
    if (!domain || target === null) continue;
    const sessions = await loadWeek(type, weekKey);
    training.push({
      domain: type,
      weekKey,
      progress: weekProgress(sessions.length, target, weekKey),
      sessions,
      sessionsToday: sessions.filter((session) => session.date === date),
    });
  }

  const editState = dayEditState(date, reference, EDIT_WINDOW_DAYS);
  return {
    date,
    editState,
    editable: editState === 'open',
    mental,
    training,
    empty: mental === null && training.length === 0,
  };
}

function validate(question: QuestionRecord, value: AnswerValue): AnswerValue {
  if (question.type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new InvalidAnswerError('A yes/no question takes a boolean answer');
    }
    return value;
  }
  if (!isValidScaleValue(value) || !Number.isInteger(value)) {
    throw new InvalidAnswerError('A scale question takes a whole number from 1 to 10');
  }
  return value;
}

/**
 * Writes one answer. Saving is the whole interaction — there is no confirm
 * step, so this has to be safe to call on every tap.
 */
export async function saveAnswer(
  date: DateKey,
  questionId: string,
  value: AnswerValue,
  reference: DateKey = today(),
): Promise<AnswerRecord> {
  assertEditable(date, reference);
  const question = await questionsRepository.get(questionId);
  if (!question) throw new InvalidAnswerError(`Unknown question ${questionId}`);
  const snapshot = await ensureCurrentSnapshot();
  return answersRepository.save({
    date,
    questionId,
    domainId: question.domainId,
    value: validate(question, value),
    valueType: question.type,
    configSnapshotId: snapshot.id,
  });
}

/**
 * Returns a question to unanswered — which is not the same as answering
 * "no". Only an explicit clear action reaches this; selecting an option
 * never removes an answer, so a stray second tap cannot destroy data.
 */
export async function clearAnswer(
  date: DateKey,
  questionId: string,
  reference: DateKey = today(),
): Promise<void> {
  assertEditable(date, reference);
  await answersRepository.clear(date, questionId);
}

export interface SessionInput {
  note?: string | null;
  durationMinutes?: number | null;
  /**
   * Measured distance in whole metres. Optional: a run saves without it, and
   * without a duration, because logging has to stay one tap. Supplying both
   * is what unlocks performance (D102).
   */
  distanceMetres?: number | null;
  /** Moving a session within its own week — the day it actually happened. */
  date?: DateKey;
}

/** Whole metres, or `null`. One rounding rule, in one place. */
function metresFrom(value: number | null | undefined): number | null {
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

/** A session may be logged for any day of the week it belongs to. */
function assertSessionWeekEditable(date: DateKey, reference: DateKey): void {
  if (!isSameWeek(date, reference)) {
    throw new EditWindowError(date, 'closed');
  }
}

export async function logSession(
  domain: StoredDomainType,
  date: DateKey = today(),
  input: SessionInput = {},
  reference: DateKey = today(),
): Promise<TrainingSession> {
  assertSessionWeekEditable(date, reference);
  const record = await domainsRepository.findByType(domain);
  if (!record || !record.enabled) {
    throw new InvalidAnswerError(`${domain} is not enabled`);
  }
  const snapshot = await ensureCurrentSnapshot();

  if (domain === 'gym') {
    const session = await gymSessionsRepository.create({
      date,
      note: input.note ?? null,
      configSnapshotId: snapshot.id,
    });
    return {
      id: session.id,
      domain,
      date: session.date,
      performedAt: session.performedAt,
      note: session.note,
      durationMinutes: null,
      distanceMetres: null,
      legacyCarryOver: false,
    };
  }

  if (domain === 'running') {
    const run = await runsRepository.create({
      date,
      note: input.note ?? null,
      durationSeconds:
        input.durationMinutes === undefined || input.durationMinutes === null
          ? null
          : Math.round(input.durationMinutes * 60),
      distanceMetres: metresFrom(input.distanceMetres),
      configSnapshotId: snapshot.id,
    });
    return {
      id: run.id,
      domain,
      date: run.date,
      performedAt: run.performedAt,
      note: run.note,
      durationMinutes: minutesFromSeconds(run.durationSeconds),
      distanceMetres: run.distanceMetres,
      legacyCarryOver: false,
    };
  }

  const session = await sportsSessionsRepository.create({
    domainId: record.id,
    date,
    note: input.note ?? null,
    durationMinutes: input.durationMinutes ?? null,
    configSnapshotId: snapshot.id,
  });
  return {
    id: session.id,
    domain: 'sports',
    date: session.date,
    performedAt: session.performedAt,
    note: session.note,
    durationMinutes: session.durationMinutes,
    distanceMetres: null,
    legacyCarryOver: false,
  };
}

export async function updateSession(
  domain: StoredDomainType,
  id: string,
  input: SessionInput,
  reference: DateKey = today(),
): Promise<void> {
  if (domain === 'gym') {
    const session = await gymSessionsRepository.get(id);
    if (!session) return;
    assertSessionWeekEditable(session.date, reference);
    const date = input.date ?? session.date;
    if (date !== session.date) assertSessionWeekEditable(date, reference);
    await gymSessionsRepository.put({
      ...session,
      date,
      weekKey: weekKeyOf(date),
      note: input.note ?? null,
    });
    return;
  }

  if (domain === 'running') {
    const run = await runsRepository.get(id);
    if (!run) return;
    assertSessionWeekEditable(run.date, reference);
    const date = input.date ?? run.date;
    if (date !== run.date) assertSessionWeekEditable(date, reference);
    await runsRepository.put({
      ...run,
      date,
      weekKey: weekKeyOf(date),
      note: input.note ?? null,
      durationSeconds:
        input.durationMinutes === undefined || input.durationMinutes === null
          ? null
          : Math.round(input.durationMinutes * 60),
      // Absent means the user cleared it; a run without a distance is still a
      // run, and simply stops carrying performance.
      distanceMetres: metresFrom(input.distanceMetres),
    });
    return;
  }

  const session = await sportsSessionsRepository.get(id);
  if (!session) return;
  assertSessionWeekEditable(session.date, reference);
  const date = input.date ?? session.date;
  if (date !== session.date) assertSessionWeekEditable(date, reference);
  await sportsSessionsRepository.update(id, {
    date,
    note: input.note ?? null,
    durationMinutes: input.durationMinutes ?? null,
  });
}

export async function deleteSession(
  domain: StoredDomainType,
  id: string,
  reference: DateKey = today(),
): Promise<void> {
  if (domain === 'gym') {
    const session = await gymSessionsRepository.get(id);
    if (!session) return;
    assertSessionWeekEditable(session.date, reference);
    await gymSessionsRepository.remove(id);
    return;
  }
  if (domain === 'running') {
    const run = await runsRepository.get(id);
    if (!run) return;
    assertSessionWeekEditable(run.date, reference);
    await runsRepository.remove(id);
    return;
  }
  const session = await sportsSessionsRepository.get(id);
  if (!session) return;
  assertSessionWeekEditable(session.date, reference);
  await sportsSessionsRepository.remove(id);
}
