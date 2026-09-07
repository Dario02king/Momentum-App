import { today } from '../../core/clock';
import {
  compareDateKeys,
  daysBetween,
  dayEditState,
  endOfWeek,
  startOfWeek,
  weekKeyOf,
  type DateKey,
} from '../../core/dates';
import { sportsTargetOf, type AppConfigSnapshot, type ConfigSnapshotRecord } from '../../core/model';
import type { WeekKey } from '../../core/dates';
import { scoreDay, type DayScore, type DueQuestion } from '../../core/scoring/dayScore';
import {
  answersRepository,
  configSnapshotsRepository,
  questionsRepository,
  sportsSessionsRepository,
} from '../repositories';

/**
 * Reconstructs the past.
 *
 * Every day is scored against the configuration that was in force on that
 * day, resolved from the snapshot log — which is the entire reason those
 * snapshots exist. Raising the sports target in April cannot change what
 * January scored, and a question archived last week still counts for the
 * days it was actually asked.
 */

export interface HistoryQuestionRow {
  id: string;
  text: string;
  /** One entry per day in the range, aligned with `days`. */
  scores: (number | null)[];
}

export interface HistoryWeek {
  weekKey: WeekKey;
  /** The target in force when the week began, or `null` if sports was off. */
  target: number | null;
  sessions: number;
  met: boolean;
  inProgress: boolean;
}

export interface History {
  from: DateKey;
  to: DateKey;
  days: DayScore[];
  /** Convenience series aligned with `days`, for the trend and the heatmap. */
  overall: (number | null)[];
  mental: (number | null)[];
  sports: (number | null)[];
  /** Every question that was due at some point in the range. */
  questions: HistoryQuestionRow[];
  /** Whether anything at all was recorded on each day, aligned with `days`.
   *  A missed day scores zero, which reads as data — this says it was not. */
  activity: boolean[];
  /** Every Monday-to-Sunday week the range touches, oldest first. */
  weeks: HistoryWeek[];
  /** True when the range contains nothing to show at all. */
  empty: boolean;
}

/**
 * The configuration in force on a day, or `null` if the day predates any.
 *
 * There is deliberately no fallback to the earliest snapshot here. A day
 * before the user ever configured anything had nothing due, so it is neutral
 * — not a day of missed questions. Falling back would score every day before
 * onboarding as a zero and fill a new user's first screen with red.
 */
function resolveSnapshot(
  snapshots: ConfigSnapshotRecord[],
  date: DateKey,
): AppConfigSnapshot | null {
  let match: ConfigSnapshotRecord | undefined;
  for (const snapshot of snapshots) {
    if (compareDateKeys(snapshot.effectiveFrom, date) <= 0) match = snapshot;
    else break;
  }
  return match?.config ?? null;
}

function mentalDueOn(config: AppConfigSnapshot): DueQuestion[] {
  const domain = config.domains.find((entry) => entry.type === 'mental');
  if (!domain || !domain.enabled) return [];
  return config.questions
    .filter((question) => question.domainId === domain.id && question.status === 'active')
    .map((question) => ({ id: question.id, type: question.type }));
}

export async function loadHistory(
  from: DateKey,
  to: DateKey,
  reference: DateKey = today(),
): Promise<History> {
  const dates = daysBetween(from, to);
  if (dates.length === 0) {
    return {
      from,
      to,
      days: [],
      overall: [],
      mental: [],
      sports: [],
      questions: [],
      activity: [],
      weeks: [],
      empty: true,
    };
  }

  // Sessions are counted by week, and the range's edge days belong to weeks
  // that reach beyond it — so the query has to cover those whole weeks.
  const [snapshots, answers, sessions, liveQuestions] = await Promise.all([
    configSnapshotsRepository.list(),
    answersRepository.listByDateRange(from, to),
    sportsSessionsRepository.listByDateRange(startOfWeek(from), endOfWeek(to)),
    questionsRepository.list(),
  ]);

  // Snapshots store questions sorted by id, which is meaningless to a reader.
  // The drill-down follows the order the questions appear in Areas.
  const displayOrder = new Map(liveQuestions.map((question, index) => [question.id, index]));

  const answersByDate = new Map<DateKey, Map<string, boolean | number>>();
  for (const answer of answers) {
    let day = answersByDate.get(answer.date);
    if (!day) {
      day = new Map();
      answersByDate.set(answer.date, day);
    }
    day.set(answer.questionId, answer.value);
  }

  const sessionsByWeek = new Map<string, number>();
  for (const session of sessions) {
    sessionsByWeek.set(session.weekKey, (sessionsByWeek.get(session.weekKey) ?? 0) + 1);
  }

  const questionText = new Map<string, string>();
  const questionOrder: string[] = [];
  /** What was due on each day, kept so a question can be told apart from
   *  one that simply did not exist yet. */
  const dueByDate = new Map<DateKey, Set<string>>();

  const days: DayScore[] = dates.map((date) => {
    const config = resolveSnapshot(snapshots, date);
    const due = config ? mentalDueOn(config) : [];
    dueByDate.set(date, new Set(due.map((question) => question.id)));

    if (config) {
      for (const question of config.questions) {
        if (!questionText.has(question.id)) questionOrder.push(question.id);
        // The latest wording wins, so a renamed question reads consistently.
        questionText.set(question.id, question.text);
      }
    }

    const target = config ? sportsTargetOf(config) : null;
    const weekKey = weekKeyOf(date);

    return scoreDay({
      date,
      editState: dayEditState(date, reference),
      mental: config ? { due, answers: answersByDate.get(date) ?? new Map() } : null,
      sports:
        target === null
          ? null
          : {
              target,
              sessionsInWeek: sessionsByWeek.get(weekKey) ?? 0,
              // A week that has not finished yet cannot have missed its target.
              weekInProgress: compareDateKeys(endOfWeek(date), reference) >= 0,
            },
    });
  });

  const domainSeries = (domain: 'mental' | 'sports') =>
    days.map((day) => {
      if (day.status === 'open' || day.status === 'neutral') return null;
      return day.domains.find((entry) => entry.domain === domain)?.score ?? null;
    });

  const everDue = new Set<string>();
  for (const ids of dueByDate.values()) for (const id of ids) everDue.add(id);

  const questions: HistoryQuestionRow[] = questionOrder
    .filter((id) => everDue.has(id))
    .sort(
      (a, b) =>
        (displayOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (displayOrder.get(b) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((id) => ({
      id,
      text: questionText.get(id) ?? '',
      scores: days.map((day) => {
        // Not asked that day — paused, archived, or not yet created. That is
        // absent, which is a different thing from a zero.
        if (!dueByDate.get(day.date)?.has(id)) return null;
        if (day.status === 'open' || day.status === 'neutral') return null;
        // Due, the day is closed, and nothing was recorded: a genuine miss.
        return day.questionScores.get(id) ?? 0;
      }),
    }));

  /*
   * Weeks, for the training streak and for XP. The target is resolved at the
   * week's Monday: a mid-week change takes effect from the following week
   * rather than retroactively rewriting the days already lived in this one.
   */
  const weekKeys: WeekKey[] = [];
  const seenWeeks = new Set<WeekKey>();
  for (const date of dates) {
    const weekKey = weekKeyOf(date);
    if (!seenWeeks.has(weekKey)) {
      seenWeeks.add(weekKey);
      weekKeys.push(weekKey);
    }
  }
  const weeks: HistoryWeek[] = weekKeys.map((weekKey) => {
    const monday = startOfWeek(
      dates.find((date) => weekKeyOf(date) === weekKey) ?? from,
    );
    const config = resolveSnapshot(snapshots, monday);
    const target = config ? sportsTargetOf(config) : null;
    const count = sessionsByWeek.get(weekKey) ?? 0;
    return {
      weekKey,
      target,
      sessions: count,
      met: target !== null && count >= target,
      inProgress: compareDateKeys(endOfWeek(monday), reference) >= 0,
    };
  });

  const sessionDates = new Set(sessions.map((session) => session.date));
  const activity = dates.map(
    (date) => (answersByDate.get(date)?.size ?? 0) > 0 || sessionDates.has(date),
  );

  const overall = days.map((day) => day.score);
  return {
    from,
    to,
    days,
    overall,
    mental: domainSeries('mental'),
    sports: domainSeries('sports'),
    questions,
    activity,
    weeks,
    empty: overall.every((value) => value === null),
  };
}
