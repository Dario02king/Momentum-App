import { describe, expect, it } from 'vitest';
import { RATING } from '../config/constants';
import { decayForDay } from '../rating';
import { DECAY_MODEL_APPROVED, PROVISIONAL_DECAY, activeDecayModel, decayIsProvisional } from './index';

const day = (overrides: Partial<Parameters<typeof PROVISIONAL_DECAY.perDay>[0]> = {}) => ({
  domain: 'mental' as const,
  consecutiveInactiveDays: 1,
  episodeSoFar: 0,
  restDay: false,
  paused: false,
  ...overrides,
});

describe('the decay model in force', () => {
  it('is still provisional, and says so', () => {
    // The gate is a product decision, not something a build can pass itself.
    // If this ever fails without the approved formula landing with it, the
    // placeholder has quietly become the formula.
    expect(DECAY_MODEL_APPROVED).toBe(false);
    expect(activeDecayModel().provisional).toBe(true);
    expect(decayIsProvisional()).toBe(true);
  });

  it('cannot claim to be approved while a provisional model is in force', () => {
    expect(DECAY_MODEL_APPROVED).toBe(!activeDecayModel().provisional);
  });
});

describe('the placeholder reproduces RC2 exactly', () => {
  it('matches RC2 day for day across a long absence', () => {
    // Anything else would mean phases 2 to 6 were built on a number nobody
    // approved, and the approved formula would then read as a regression.
    for (let days = 0; days <= 40; days += 1) {
      expect(PROVISIONAL_DECAY.perDay(day({ consecutiveInactiveDays: days }))).toBe(
        decayForDay(days),
      );
    }
  });

  it('keeps the RC2 cap on a single episode', () => {
    const capped = PROVISIONAL_DECAY.perDay(
      day({ consecutiveInactiveDays: 30, episodeSoFar: RATING.DECAY.MAX_PER_EPISODE }),
    );
    expect(capped).toBe(0);
  });

  it('never returns a negative amount', () => {
    expect(
      PROVISIONAL_DECAY.perDay(day({ consecutiveInactiveDays: 30, episodeSoFar: 10_000 })),
    ).toBe(0);
  });
});

describe('the two already-approved suspensions', () => {
  it('does not decay a declared rest day', () => {
    expect(PROVISIONAL_DECAY.perDay(day({ consecutiveInactiveDays: 10, restDay: true }))).toBe(0);
  });

  it('does not decay a day inside a pause', () => {
    expect(PROVISIONAL_DECAY.perDay(day({ consecutiveInactiveDays: 10, paused: true }))).toBe(0);
  });

  it('changes nothing for data that has neither, which is all RC2 data', () => {
    expect(PROVISIONAL_DECAY.perDay(day({ consecutiveInactiveDays: 10 }))).toBe(decayForDay(10));
  });
});
