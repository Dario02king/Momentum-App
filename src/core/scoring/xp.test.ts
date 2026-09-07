import { describe, expect, it } from 'vitest';
import { XP } from '../config/constants';
import { computeXp, type XpDay, type XpWeek } from './xp';

const day = (overrides: Partial<XpDay> = {}): XpDay => ({
  answeredItems: 0,
  complete: false,
  counts: true,
  ...overrides,
});
const week = (overrides: Partial<XpWeek> = {}): XpWeek => ({
  sessions: 0,
  met: false,
  inProgress: false,
  ...overrides,
});

describe('lifetime XP', () => {
  it('awards each answered item and a bonus for a complete day', () => {
    expect(computeXp([day({ answeredItems: 3, complete: true })], [])).toBe(
      3 * XP.PER_ANSWERED_ITEM + XP.PER_COMPLETED_DAY,
    );
  });

  it('awards partial days without the completion bonus', () => {
    expect(computeXp([day({ answeredItems: 2 })], [])).toBe(2 * XP.PER_ANSWERED_ITEM);
  });

  it('awards sessions and a bonus for a finished week that met its target', () => {
    expect(computeXp([], [week({ sessions: 3, met: true })])).toBe(
      3 * XP.PER_SPORTS_SESSION + XP.PER_WEEKLY_TARGET_MET,
    );
  });

  it('holds the weekly bonus until the week has finished', () => {
    expect(computeXp([], [week({ sessions: 3, met: true, inProgress: true })])).toBe(
      3 * XP.PER_SPORTS_SESSION,
    );
  });

  it('awards nothing for a day that does not count', () => {
    expect(computeXp([day({ answeredItems: 3, complete: true, counts: false })], [])).toBe(0);
  });

  it('is never negative', () => {
    expect(computeXp([day({ answeredItems: -5 })], [week({ sessions: -3 })])).toBe(0);
    expect(computeXp([], [])).toBe(0);
  });

  it('never decreases as history grows', () => {
    const days: XpDay[] = Array.from({ length: 60 }, (_, index) =>
      day({
        answeredItems: index % 4,
        complete: index % 3 === 0,
        counts: index % 7 !== 0,
      }),
    );
    let previous = 0;
    for (let end = 0; end <= days.length; end += 1) {
      const total = computeXp(days.slice(0, end), []);
      expect(total).toBeGreaterThanOrEqual(previous);
      previous = total;
    }
  });

  it('does not fall when a bad day is added', () => {
    const before = computeXp([day({ answeredItems: 3, complete: true })], []);
    const after = computeXp(
      [day({ answeredItems: 3, complete: true }), day({ answeredItems: 0 })],
      [],
    );
    // A missed day earns nothing; it never costs what was already earned.
    expect(after).toBe(before);
  });
});
