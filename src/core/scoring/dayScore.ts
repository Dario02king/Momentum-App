import type { DateKey, DayEditState } from '../dates';
import type { DomainType, QuestionType } from '../model';
import { scaleValueToPercent } from './scale';

/**
 * Scoring a single day (§11).
 *
 * Pure functions over an explicit description of what was due and what was
 * answered. Nothing here reads storage, so every rule below is testable in
 * isolation — and the historical reconstruction that feeds it can resolve
 * each past day against the configuration that was actually in force then.
 */

/**
 * - `neutral` — nothing was due. Excluded from every average, never scored.
 * - `open`    — something was due and is still answerable inside the edit
 *               window. Also excluded: an open day never hurts the user.
 * - `scored`  — the day counts. Anything left unanswered on a closed day is
 *               a miss and scores zero.
 */
export type DayStatus = 'neutral' | 'open' | 'scored';

export interface DueQuestion {
  id: string;
  type: QuestionType;
}

export interface MentalDayInput {
  /** Questions that were active on this day, from that day's configuration. */
  due: DueQuestion[];
  /** Answers keyed by question id. Missing means unanswered. */
  answers: Map<string, boolean | number>;
}

export interface SportsDayInput {
  /** The target in force for the week this day belongs to. */
  target: number;
  /** Sessions logged in that whole week. */
  sessionsInWeek: number;
  /** A week still running cannot have missed its target yet. */
  weekInProgress: boolean;
}

export interface DayInput {
  date: DateKey;
  editState: DayEditState;
  /** `null` when the domain is disabled or was never enabled. */
  mental: MentalDayInput | null;
  sports: SportsDayInput | null;
}

export interface DomainScore {
  domain: DomainType;
  /** `null` means no data — excluded from the mean, never counted as zero. */
  score: number | null;
  itemsDue: number;
  itemsAnswered: number;
}

export interface DayScore {
  date: DateKey;
  status: DayStatus;
  /**
   * The overall score, or `null` for a neutral or open day.
   *
   * On a closed day this divides by the items that were **due**, so an
   * unanswered item is a miss. That is the honest reading for history.
   */
  score: number | null;
  /**
   * The same day scored over the items the user actually **reported**.
   *
   * History wants "you missed two of three". The rating wants "of what you
   * told me, how did it go" — because dividing by items due conflates not
   * doing a thing with not saying so, and would make honestly logging partial
   * progress cost more than staying silent.
   */
  recordedScore: number | null;
  domains: DomainScore[];
  /** How much of the day was reported, for weighting the rating. */
  dueItems: number;
  answeredItems: number;
  /** Per-question percentages, for the Progress drill-down. */
  questionScores: Map<string, number>;
}

/** One answered item as a percentage: yes = 100, no = 0, a scale = value × 10. */
export function itemPercent(type: QuestionType, value: boolean | number): number {
  if (type === 'boolean') return value ? 100 : 0;
  return scaleValueToPercent(Number(value));
}

/**
 * Mental Wellbeing for one day: the sum of answered-item percentages divided
 * by the number of items **due**, not the number answered. On a closed day
 * an unanswered item is a miss and drags the day down, which is the point.
 */
function scoreMental(
  input: MentalDayInput,
  countUnansweredAsMissed: boolean,
): {
  score: number | null;
  recorded: number | null;
  answered: number;
  questionScores: Map<string, number>;
} {
  const questionScores = new Map<string, number>();
  if (input.due.length === 0) {
    return { score: null, recorded: null, answered: 0, questionScores };
  }

  let total = 0;
  let answered = 0;
  for (const question of input.due) {
    const value = input.answers.get(question.id);
    if (value === undefined) continue;
    const percent = itemPercent(question.type, value);
    questionScores.set(question.id, percent);
    total += percent;
    answered += 1;
  }

  const recorded = answered === 0 ? null : total / answered;
  if (answered === 0 && !countUnansweredAsMissed) {
    return { score: null, recorded, answered, questionScores };
  }
  const denominator = countUnansweredAsMissed ? input.due.length : answered;
  return { score: total / denominator, recorded, answered, questionScores };
}

/**
 * Sports for one day: the week's progress towards its target, capped at 100.
 *
 * A week still in progress with nothing logged has no data yet rather than a
 * score of zero — the same principle as an open day. Once anything is logged
 * the week reports its running progress, and a finished week reports the
 * truth even when that truth is zero.
 */
function scoreSports(input: SportsDayInput): number | null {
  if (input.weekInProgress && input.sessionsInWeek === 0) return null;
  const target = Math.max(1, input.target);
  return Math.min(100, (input.sessionsInWeek / target) * 100);
}

export function scoreDay(input: DayInput): DayScore {
  const closed = input.editState === 'closed';
  const domains: DomainScore[] = [];
  const recordedDomains: (number | null)[] = [];
  let questionScores = new Map<string, number>();

  let mentalHasDue = false;
  let mentalIncomplete = false;
  let dueItems = 0;
  let answeredItems = 0;

  if (input.mental) {
    mentalHasDue = input.mental.due.length > 0;
    const result = scoreMental(input.mental, closed);
    questionScores = result.questionScores;
    mentalIncomplete = mentalHasDue && result.answered < input.mental.due.length;
    dueItems = input.mental.due.length;
    answeredItems = result.answered;
    recordedDomains.push(result.recorded);
    domains.push({
      domain: 'mental',
      score: result.score,
      itemsDue: input.mental.due.length,
      itemsAnswered: result.answered,
    });
  }

  if (input.sports) {
    const sports = scoreSports(input.sports);
    recordedDomains.push(sports);
    domains.push({
      domain: 'sports',
      score: sports,
      itemsDue: input.sports.target,
      itemsAnswered: input.sports.sessionsInWeek,
    });
  }

  const recordedScored = recordedDomains.filter((value): value is number => value !== null);
  const recordedScore = recordedScored.length
    ? recordedScored.reduce((sum, value) => sum + value, 0) / recordedScored.length
    : null;

  const nothingDue = !mentalHasDue && input.sports === null;
  if (nothingDue) {
    return {
      date: input.date,
      status: 'neutral',
      score: null,
      recordedScore,
      domains,
      dueItems,
      answeredItems,
      questionScores,
    };
  }

  // Still inside the edit window with work outstanding: the day is open, and
  // an open day is never counted against the user.
  if (!closed && mentalIncomplete) {
    return {
      date: input.date,
      status: 'open',
      score: null,
      recordedScore,
      domains,
      dueItems,
      answeredItems,
      questionScores,
    };
  }

  /**
   * The overall score is the unweighted mean of the domain scores, so a
   * domain with five questions cannot outweigh one with one. Domains with no
   * data are excluded from the denominator entirely.
   */
  const scored = domains.filter((domain) => domain.score !== null);
  if (scored.length === 0) {
    return {
      date: input.date,
      status: closed && mentalHasDue ? 'scored' : 'neutral',
      score: closed && mentalHasDue ? 0 : null,
      recordedScore,
      domains,
      dueItems,
      answeredItems,
      questionScores,
    };
  }

  const overall = scored.reduce((sum, domain) => sum + (domain.score ?? 0), 0) / scored.length;
  return {
    date: input.date,
    status: 'scored',
    score: overall,
    recordedScore,
    domains,
    dueItems,
    answeredItems,
    questionScores,
  };
}
