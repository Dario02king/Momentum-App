import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, diffInDays, startOfDay, toDateKey } from './dateKey';
import { daysOfWeek, startOfWeek, weekKeyOf } from './week';

/**
 * Runs under TZ=America/Sao_Paulo (see vitest.workspace.ts).
 *
 * Brazil used to start DST at midnight: on 2017-10-15 the clock jumped from
 * 00:00 straight to 01:00, so that local midnight never happened, and a day
 * there is 23 hours long measured from its first real instant. Any helper
 * that assumes every day has a 00:00, or that a day is 24 hours, misfiles
 * check-ins here.
 */
describe('a day whose local midnight does not exist', () => {
  const skipped = '2017-10-15';

  it('confirms the fixture: there is no 00:00 on this day', () => {
    // Guard against a tzdata version without the historical rule; if this
    // ever fails the rest of the file is testing nothing.
    const midnight = new Date(2017, 9, 15, 0, 0, 0);
    expect(midnight.getHours()).toBe(1);
    expect(toDateKey(midnight)).toBe(skipped);
  });

  it('keeps arithmetic on the correct day', () => {
    expect(addDays('2017-10-14', 1)).toBe(skipped);
    expect(addDays(skipped, 1)).toBe('2017-10-16');
    expect(addDays(skipped, -1)).toBe('2017-10-14');
    expect(diffInDays('2017-10-14', '2017-10-16')).toBe(2);
  });

  it('resolves the first instant of the day to an hour that exists', () => {
    expect(toDateKey(startOfDay(skipped))).toBe(skipped);
    expect(startOfDay(skipped).getHours()).toBe(1);
  });

  it('assigns the day to the right Monday-to-Sunday week', () => {
    expect(startOfWeek(skipped)).toBe('2017-10-09'); // Sunday belongs to the week before
    expect(weekKeyOf(skipped)).toBe('2017-W41');
    expect(daysOfWeek(skipped)).toHaveLength(7);
    expect(new Set(daysOfWeek(skipped)).size).toBe(7);
  });

  it('produces distinct days across the whole transition month', () => {
    const days = daysBetween('2017-10-01', '2017-10-31');
    expect(days).toHaveLength(31);
    expect(new Set(days).size).toBe(31);
  });
});
