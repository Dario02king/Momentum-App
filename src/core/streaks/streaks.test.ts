import { describe, expect, it } from 'vitest';
import { mentalStreak, sportsStreak, type StreakDay, type StreakWeek } from './index';

const day = (complete: boolean, counts = true): StreakDay => ({
  date: '2025-01-01',
  complete,
  counts,
});
const week = (met: boolean, inProgress = false): StreakWeek => ({
  weekKey: '2025-W01',
  met,
  inProgress,
});

describe('check-in streak', () => {
  it('counts consecutive completed days', () => {
    expect(mentalStreak([day(true), day(true), day(true)])).toEqual({ current: 3, best: 3 });
  });

  it('breaks on an incomplete day but keeps the best', () => {
    const streak = mentalStreak([day(true), day(true), day(true), day(false), day(true)]);
    expect(streak.current).toBe(1);
    expect(streak.best).toBe(3);
  });

  it('keeps the best streak after the current one ends', () => {
    const streak = mentalStreak([day(true), day(true), day(true), day(true), day(false)]);
    expect(streak.current).toBe(0);
    expect(streak.best).toBe(4);
  });

  it('skips days that do not count rather than breaking on them', () => {
    // A day nothing was due on, or one still inside the edit window.
    const streak = mentalStreak([day(true), day(false, false), day(true)]);
    expect(streak.current).toBe(2);
    expect(streak.best).toBe(2);
  });

  it('has no streak at all with no days', () => {
    expect(mentalStreak([])).toEqual({ current: 0, best: 0 });
  });
});

describe('weekly target streak', () => {
  it('counts consecutive weeks the target was met', () => {
    expect(sportsStreak([week(true), week(true)])).toEqual({ current: 2, best: 2 });
  });

  it('breaks on a finished week that missed the target', () => {
    const streak = sportsStreak([week(true), week(true), week(false), week(true)]);
    expect(streak.current).toBe(1);
    expect(streak.best).toBe(2);
  });

  it('does not break on the week still running', () => {
    // Three sessions short on a Tuesday is not a broken streak yet.
    const streak = sportsStreak([week(true), week(true), week(false, true)]);
    expect(streak.current).toBe(2);
    expect(streak.best).toBe(2);
  });

  it('extends once the running week meets its target', () => {
    const streak = sportsStreak([week(true), week(true), week(true, true)]);
    expect(streak.current).toBe(3);
  });
});
