import { describe, expect, it } from 'vitest';
import type { DateKey } from '../dates';
import type { DayState } from '../rating';
import { buildLedger, ledgerInvariants } from './index';

function scoredDay(date: DateKey, score: number): DayState {
  return {
    date,
    status: 'scored',
    score,
    recordedScore: score,
    dueItems: 1,
    answeredItems: 1,
    recorded: true,
    complete: true,
  };
}

function silentDay(date: DateKey): DayState {
  return {
    date,
    status: 'scored',
    score: 0,
    recordedScore: null,
    dueItems: 1,
    answeredItems: 0,
    recorded: false,
    complete: false,
  };
}

const dates = (count: number, from = 1): DateKey[] =>
  Array.from({ length: count }, (_, index) => {
    const day = String(from + index).padStart(2, '0');
    return `2026-01-${day}` as DateKey;
  });

describe('the three quantities', () => {
  it('answers three different questions, so they move independently', () => {
    const good = dates(40).map((date) => scoredDay(date, 95));
    const then = dates(40, 41).map(silentDay);
    const ledger = buildLedger({
      domain: 'mental',
      days: [...good, ...then],
      xpDays: good.map(() => ({ answeredItems: 1, complete: true, counts: true })),
      xpWeeks: [],
    });

    // Momentum fell: forty silent days is the question it answers.
    expect(ledger.momentum).toBeLessThan(ledger.peakMomentum);
    // The peak did not: it records that the user got there.
    expect(ledger.peakMomentum).toBeGreaterThan(500);
    // XP did not move at all: it counts what was done, and nothing was undone.
    expect(ledger.lifetimeXp).toBeGreaterThan(0);
    // And the rank reached is not taken away by the absence.
    expect(ledger.peakRank.index).toBeGreaterThanOrEqual(ledger.rank.index);
  });

  it('holds its invariants for every shape of history', () => {
    const shapes: DayState[][] = [
      [],
      dates(10).map((date) => scoredDay(date, 100)),
      dates(10).map((date) => scoredDay(date, 0)),
      dates(30).map(silentDay),
      dates(60).map((date, index) => (index % 3 === 0 ? silentDay(date) : scoredDay(date, 70))),
    ];
    for (const days of shapes) {
      const ledger = buildLedger({ domain: 'gym', days, xpDays: [], xpWeeks: [] });
      expect(ledgerInvariants(ledger)).toEqual({
        peakNeverBelowCurrent: true,
        peakRankNeverBelowCurrent: true,
        xpNeverNegative: true,
      });
    }
  });

  it('reports a domain with no scored day as not started', () => {
    // The Boss leaves an unstarted domain out rather than counting it zero,
    // and this flag is how it knows.
    const ledger = buildLedger({
      domain: 'food',
      days: dates(5).map((date) => ({
        date,
        status: 'neutral' as const,
        score: null,
        recordedScore: null,
        dueItems: 0,
        answeredItems: 0,
        recorded: false,
        complete: false,
      })),
      xpDays: [],
      xpWeeks: [],
    });
    expect(ledger.started).toBe(false);
    expect(ledger.momentum).toBe(250);
  });

  it('lands its ladder position on the rank it reports', () => {
    const ledger = buildLedger({
      domain: 'running',
      days: dates(60).map((date) => scoredDay(date, 88)),
      xpDays: [],
      xpWeeks: [],
    });
    expect(Math.floor(ledger.progress)).toBe(ledger.rank.index);
  });

  it('is a pure function of its input — replaying twice cannot differ', () => {
    const days = dates(45).map((date, index) =>
      index % 4 === 0 ? silentDay(date) : scoredDay(date, 60 + (index % 30)),
    );
    const input = { domain: 'mental' as const, days, xpDays: [], xpWeeks: [] };
    expect(buildLedger(input).momentum).toBe(buildLedger(input).momentum);
  });
});
