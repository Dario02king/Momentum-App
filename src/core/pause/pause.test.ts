import { describe, expect, it } from 'vitest';
import { PAUSE } from '../config/constants';
import { addDays } from '../dates';
import type { PausePeriodRecord } from '../model';
import {
  coversDate,
  earliestEndFor,
  isEditable,
  isPausedOn,
  pauseLengthDays,
  pausedFlags,
  standingOf,
  validateDraft,
  validateEndEarly,
} from './index';

/** A Monday, so nothing here depends on where a week falls. */
const TODAY = '2026-03-02';

const pause = (from: string, to: string | null, id = 'p1'): PausePeriodRecord => ({
  id,
  from,
  to,
  reason: null,
  createdAt: '2026-03-01T09:00:00.000Z',
  updatedAt: '2026-03-01T09:00:00.000Z',
});

describe('which dates a pause covers', () => {
  it('includes both ends', () => {
    const p = pause(TODAY, addDays(TODAY, 6));
    expect(coversDate(p, TODAY)).toBe(true);
    expect(coversDate(p, addDays(TODAY, 6))).toBe(true);
    expect(coversDate(p, addDays(TODAY, -1))).toBe(false);
    expect(coversDate(p, addDays(TODAY, 7))).toBe(false);
  });

  it('treats an open-ended pause as running forever', () => {
    // The schema still permits it so an older file reads back; no product
    // flow creates one, and the reader must not crash on the possibility.
    const p = pause(TODAY, null);
    expect(coversDate(p, addDays(TODAY, 4000))).toBe(true);
  });

  it('counts length inclusively', () => {
    expect(pauseLengthDays(TODAY, TODAY)).toBe(1);
    expect(pauseLengthDays(TODAY, addDays(TODAY, 27))).toBe(28);
  });

  it('answers a whole range in one pass, and agrees with the single lookup', () => {
    const pauses = [pause(addDays(TODAY, 2), addDays(TODAY, 4), 'a'), pause(addDays(TODAY, 9), addDays(TODAY, 9), 'b')];
    const dates = Array.from({ length: 12 }, (_, index) => addDays(TODAY, index));
    const flags = pausedFlags(pauses, dates);
    expect(flags).toEqual([false, false, true, true, true, false, false, false, false, true, false, false]);
    dates.forEach((date, index) => expect(isPausedOn(pauses, date)).toBe(flags[index]));
  });

  it('says nothing is paused when there are no pauses', () => {
    const dates = Array.from({ length: 5 }, (_, index) => addDays(TODAY, index));
    expect(pausedFlags([], dates)).toEqual([false, false, false, false, false]);
  });
});

describe('what may be declared', () => {
  it('may begin today', () => {
    expect(validateDraft({ from: TODAY, to: addDays(TODAY, 3) }, [], TODAY)).toBeNull();
  });

  it('may begin in the future', () => {
    expect(
      validateDraft({ from: addDays(TODAY, 30), to: addDays(TODAY, 40) }, [], TODAY),
    ).toBeNull();
  });

  it('may never begin in the past', () => {
    // The whole prospective rule in one assertion: a user cannot watch decay
    // happen and then backdate a pause to undo it.
    expect(validateDraft({ from: addDays(TODAY, -1), to: TODAY }, [], TODAY)).toBe('startInPast');
  });

  it('needs an end date', () => {
    expect(validateDraft({ from: TODAY, to: null }, [], TODAY)).toBe('endMissing');
  });

  it('rejects an end before the start', () => {
    expect(validateDraft({ from: addDays(TODAY, 5), to: addDays(TODAY, 4) }, [], TODAY)).toBe(
      'endBeforeStart',
    );
  });

  it('accepts exactly the maximum and rejects one day more', () => {
    expect(PAUSE.MAX_DAYS).toBe(28);
    expect(validateDraft({ from: TODAY, to: addDays(TODAY, 27) }, [], TODAY)).toBeNull();
    expect(validateDraft({ from: TODAY, to: addDays(TODAY, 28) }, [], TODAY)).toBe('tooLong');
  });

  it('rejects an overlap, in either direction and when merely touching', () => {
    const existing = [pause(addDays(TODAY, 10), addDays(TODAY, 20))];
    expect(validateDraft({ from: addDays(TODAY, 15), to: addDays(TODAY, 25) }, existing, TODAY)).toBe('overlaps');
    expect(validateDraft({ from: addDays(TODAY, 5), to: addDays(TODAY, 12) }, existing, TODAY)).toBe('overlaps');
    expect(validateDraft({ from: addDays(TODAY, 12), to: addDays(TODAY, 14) }, existing, TODAY)).toBe('overlaps');
    expect(validateDraft({ from: addDays(TODAY, 20), to: addDays(TODAY, 22) }, existing, TODAY)).toBe('overlaps');
    // Adjacent but not overlapping is fine.
    expect(validateDraft({ from: addDays(TODAY, 21), to: addDays(TODAY, 25) }, existing, TODAY)).toBeNull();
  });

  it('ignores the pause being edited when checking overlap', () => {
    const existing = [pause(addDays(TODAY, 10), addDays(TODAY, 20), 'self')];
    expect(
      validateDraft({ from: addDays(TODAY, 11), to: addDays(TODAY, 19) }, existing, TODAY, 'self'),
    ).toBeNull();
  });
});

describe('standing, editing and ending', () => {
  it('classifies a pause against today', () => {
    expect(standingOf(pause(addDays(TODAY, 3), addDays(TODAY, 5)), TODAY)).toBe('upcoming');
    expect(standingOf(pause(TODAY, addDays(TODAY, 5)), TODAY)).toBe('active');
    expect(standingOf(pause(addDays(TODAY, -9), addDays(TODAY, -2)), TODAY)).toBe('past');
  });

  it('allows editing only before it has begun', () => {
    expect(isEditable(pause(addDays(TODAY, 3), addDays(TODAY, 5)), TODAY)).toBe(true);
    expect(isEditable(pause(TODAY, addDays(TODAY, 5)), TODAY)).toBe(false);
    expect(isEditable(pause(addDays(TODAY, -9), addDays(TODAY, -2)), TODAY)).toBe(false);
  });

  it('lets a running pause end today, never earlier', () => {
    const running = pause(addDays(TODAY, -3), addDays(TODAY, 10));
    expect(earliestEndFor(running, TODAY)).toBe(TODAY);
    expect(validateEndEarly(running, TODAY, TODAY)).toBeNull();
    // Yesterday was lived as a paused day; un-pausing it now would rewrite it.
    expect(validateEndEarly(running, addDays(TODAY, -1), TODAY)).toBe('endsInPast');
  });

  it('only ever shortens', () => {
    const running = pause(addDays(TODAY, -3), addDays(TODAY, 10));
    expect(validateEndEarly(running, addDays(TODAY, 5), TODAY)).toBeNull();
    expect(validateEndEarly(running, addDays(TODAY, 11), TODAY)).toBe('extendsBeyondOriginal');
  });
});
