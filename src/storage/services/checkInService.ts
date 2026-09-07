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
import { isValidScaleValue } from '../../core/scoring/scale';
import type {
  AnswerRecord,
  AnswerValue,
  QuestionRecord,
  SportsSessionRecord,
} from '../../core/model';
import { weekProgress, type WeekProgress } from '../../domains/sports/weekProgress';
import { ensureCurrentSnapshot } from '../configService';
import {
  answersRepository,
  domainsRepository,
  questionsRepository,
  sportsSessionsRepository,
} from '../repositories';
import { sportsTargetOfDomain } from './configurationService';

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

export interface SportsDayView {
  weekKey: WeekKey;
  progress: WeekProgress;
  /** This week's sessions, oldest first. */
  sessions: SportsSessionRecord[];
  /** Sessions logged on the day being viewed. */
  sessionsToday: SportsSessionRecord[];
}

export interface DayView {
  date: DateKey;
  editState: DayEditState;
  editable: boolean;
  /** `null` when the domain is disabled or was never enabled. */
  mental: MentalDayView | null;
  sports: SportsDayView | null;
  /** True when neither domain is set up — the day has nothing to ask. */
  empty: boolean;
}

function assertEditable(date: DateKey, reference: DateKey): void {
  const state = dayEditState(date, reference, EDIT_WINDOW_DAYS);
  if (state !== 'open') throw new EditWindowError(date, state);
}

/**
 * Reads everything due on a day.
 *
 * Active questions are due, full stop — there is no schedule to evaluate.
 * A disabled domain returns `null` rather than an empty view, so scoring and
 * the UI both distinguish "nothing due" from "nothing tracked".
 */
export async function loadDay(date: DateKey = today(), reference: DateKey = today()): Promise<DayView> {
  const [domains, answers] = await Promise.all([
    domainsRepository.list(),
    answersRepository.listByDate(date),
  ]);

  const mentalDomain = domains.find((domain) => domain.type === 'mental') ?? null;
  const sportsDomain = domains.find((domain) => domain.type === 'sports') ?? null;

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

  let sports: SportsDayView | null = null;
  const target = sportsTargetOfDomain(sportsDomain);
  if (sportsDomain?.enabled && target !== null) {
    const weekKey = weekKeyOf(date);
    const sessions = await sportsSessionsRepository.listByWeek(weekKey);
    sports = {
      weekKey,
      progress: weekProgress(sessions.length, target, weekKey),
      sessions,
      sessionsToday: sessions.filter((session) => session.date === date),
    };
  }

  const editState = dayEditState(date, reference, EDIT_WINDOW_DAYS);
  return {
    date,
    editState,
    editable: editState === 'open',
    mental,
    sports,
    empty: mental === null && sports === null,
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
  activityType?: string | null;
  note?: string | null;
  durationMinutes?: number | null;
  /** Moving a session within its own week — the day it actually happened. */
  date?: DateKey;
}

/** A session may be logged for any day of the week it belongs to. */
function assertSessionWeekEditable(date: DateKey, reference: DateKey): void {
  if (!isSameWeek(date, reference)) {
    throw new EditWindowError(date, 'closed');
  }
}

export async function logSession(
  date: DateKey = today(),
  input: SessionInput = {},
  reference: DateKey = today(),
): Promise<SportsSessionRecord> {
  assertSessionWeekEditable(date, reference);
  const domain = await domainsRepository.findByType('sports');
  if (!domain || !domain.enabled) {
    throw new InvalidAnswerError('Sports is not enabled');
  }
  const snapshot = await ensureCurrentSnapshot();
  return sportsSessionsRepository.create({
    domainId: domain.id,
    date,
    activityType: input.activityType ?? null,
    note: input.note ?? null,
    durationMinutes: input.durationMinutes ?? null,
    configSnapshotId: snapshot.id,
  });
}

export async function updateSession(
  id: string,
  input: SessionInput,
  reference: DateKey = today(),
): Promise<SportsSessionRecord | undefined> {
  const session = await sportsSessionsRepository.get(id);
  if (!session) return undefined;
  assertSessionWeekEditable(session.date, reference);
  // A session may be moved to the day it actually happened, as long as that
  // day is in the same week — the week is what the target counts.
  const date = input.date ?? session.date;
  if (date !== session.date) assertSessionWeekEditable(date, reference);
  return sportsSessionsRepository.update(id, {
    date,
    activityType: input.activityType ?? null,
    note: input.note ?? null,
    durationMinutes: input.durationMinutes ?? null,
  });
}

export async function deleteSession(id: string, reference: DateKey = today()): Promise<void> {
  const session = await sportsSessionsRepository.get(id);
  if (!session) return;
  assertSessionWeekEditable(session.date, reference);
  await sportsSessionsRepository.remove(id);
}
