import { nowIso, today } from '../../core/clock';
import type { DateKey } from '../../core/dates';
import { compareDateKeys } from '../../core/dates';
import { createId } from '../../core/ids';
import {
  earliestEndFor,
  isEditable,
  pauseLengthDays,
  standingOf,
  validateDraft,
  validateEndEarly,
  type PauseDraft,
  type PauseProblem,
  type PauseStanding,
} from '../../core/pause';
import type { PausePeriodRecord } from '../../core/model';
import { pausePeriodsRepository } from '../repositories';

/**
 * Declaring, listing and ending a pause.
 *
 * Every rule lives in `core/pause`; this file is the thin layer that reads
 * and writes them. That split matters here more than usual, because the same
 * rules have to answer two questions — "may this be stored" for the write and
 * "why is this button unavailable" for the screen — and two implementations
 * of *that* would disagree the first time an edge case appeared.
 *
 * **Nothing here can rewrite a lived day.** A pause may not start in the
 * past, may not be moved once it has begun, and may only ever be shortened to
 * today or later. That is enforced on the write rather than trusted to the
 * form, so a stale screen cannot smuggle one through.
 */

export class PauseError extends Error {
  constructor(readonly problem: PauseProblem) {
    super(`Pause rejected: ${problem}`);
    this.name = 'PauseError';
  }
}

export interface PauseView {
  record: PausePeriodRecord;
  standing: PauseStanding;
  /** Whole calendar days, inclusive. `null` for an open-ended legacy row. */
  days: number | null;
  /** Whether it may still be edited or deleted outright. */
  editable: boolean;
  /** The earliest date a running pause may be made to end. */
  earliestEnd: DateKey;
}

export interface PauseOverview {
  /** Every pause, newest start first. */
  pauses: PauseView[];
  /** The one covering today, if any. */
  active: PauseView | null;
  /** The next one that has not begun, if any. */
  upcoming: PauseView | null;
  /** Whether today falls inside a pause — what Today shows. */
  pausedToday: boolean;
}

function view(record: PausePeriodRecord, reference: DateKey): PauseView {
  return {
    record,
    standing: standingOf(record, reference),
    days: record.to === null ? null : pauseLengthDays(record.from, record.to),
    editable: isEditable(record, reference),
    earliestEnd: earliestEndFor(record, reference),
  };
}

export async function loadPauses(reference: DateKey = today()): Promise<PauseOverview> {
  const all = await pausePeriodsRepository.getAll();
  const pauses = all
    .map((record) => view(record, reference))
    .sort((a, b) => compareDateKeys(b.record.from, a.record.from));
  const active = pauses.find((entry) => entry.standing === 'active') ?? null;
  const upcoming =
    [...pauses].reverse().find((entry) => entry.standing === 'upcoming') ?? null;
  return { pauses, active, upcoming, pausedToday: active !== null };
}

/**
 * Declares a pause, starting today or later.
 *
 * `to` is required. The schema still allows an open-ended pause so that an
 * older file can be read back, but no product flow creates one: an
 * open-ended pause is an indefinite freeze, and a pause is for a holiday.
 */
export async function createPause(
  draft: PauseDraft,
  reference: DateKey = today(),
): Promise<PausePeriodRecord> {
  const existing = await pausePeriodsRepository.getAll();
  const problem = validateDraft(draft, existing, reference);
  if (problem) throw new PauseError(problem);

  const stamp = nowIso();
  const record: PausePeriodRecord = {
    id: createId('pause'),
    from: draft.from,
    to: draft.to,
    reason: draft.reason?.trim() ? draft.reason.trim() : null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await pausePeriodsRepository.put(record);
  return record;
}

/** Changes a pause that has not begun. One that has is immutable. */
export async function updatePause(
  id: string,
  draft: PauseDraft,
  reference: DateKey = today(),
): Promise<PausePeriodRecord> {
  const existing = await pausePeriodsRepository.getAll();
  const current = existing.find((pause) => pause.id === id);
  if (!current) throw new PauseError('notFound');
  if (!isEditable(current, reference)) throw new PauseError('alreadyBegun');

  const problem = validateDraft(draft, existing, reference, id);
  if (problem) throw new PauseError(problem);

  const record: PausePeriodRecord = {
    ...current,
    from: draft.from,
    to: draft.to,
    reason: draft.reason?.trim() ? draft.reason.trim() : null,
    updatedAt: nowIso(),
  };
  await pausePeriodsRepository.put(record);
  return record;
}

/** Deletes a pause that has not begun. Deleting a lived one would rewrite it. */
export async function deletePause(id: string, reference: DateKey = today()): Promise<void> {
  const existing = await pausePeriodsRepository.getAll();
  const current = existing.find((pause) => pause.id === id);
  if (!current) throw new PauseError('notFound');
  if (!isEditable(current, reference)) throw new PauseError('alreadyBegun');
  await pausePeriodsRepository.remove(id);
}

/**
 * Ends a running pause early, from today or later.
 *
 * Never earlier than today: the days already covered were lived through as
 * paused days, and un-pausing them afterwards is the retroactive rewrite the
 * whole prospective rule exists to forbid.
 */
export async function endPauseEarly(
  id: string,
  newEnd: DateKey = today(),
  reference: DateKey = today(),
): Promise<PausePeriodRecord> {
  const existing = await pausePeriodsRepository.getAll();
  const current = existing.find((pause) => pause.id === id);
  if (!current) throw new PauseError('notFound');

  const problem = validateEndEarly(current, newEnd, reference);
  if (problem) throw new PauseError(problem);

  const record: PausePeriodRecord = { ...current, to: newEnd, updatedAt: nowIso() };
  await pausePeriodsRepository.put(record);
  return record;
}
