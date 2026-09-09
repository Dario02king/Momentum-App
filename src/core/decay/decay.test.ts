import { describe, expect, it } from 'vitest';
import { RATING } from '../config/constants';
import { decayForDay } from '../rating';
import { APPROVED_DECAY, DECAY_MODEL_APPROVED, activeDecayModel, decayIsProvisional } from './index';

const day = (overrides: Partial<Parameters<typeof APPROVED_DECAY.perDay>[0]> = {}) => ({
  domain: 'mental' as const,
  consecutiveInactiveDays: 1,
  episodeSoFar: 0,
  restDay: false,
  paused: false,
  ...overrides,
});

describe('the decay model in force', () => {
  it('is the approved model, and says so', () => {
    // D72 is closed: the product owner ratified RC2's formula unchanged. The
    // gate was never something a build could pass itself, which is why this
    // moved only when the decision did.
    expect(DECAY_MODEL_APPROVED).toBe(true);
    expect(activeDecayModel().provisional).toBe(false);
    expect(decayIsProvisional()).toBe(false);
  });

  it('cannot claim to be approved while a provisional model is in force', () => {
    expect(DECAY_MODEL_APPROVED).toBe(!activeDecayModel().provisional);
  });
});

describe('the approved model is RC2 exactly', () => {
  it('matches RC2 day for day across a long absence', () => {
    // Ratifying was a decision, not a change. Anything else here would mean
    // approving D72 had silently moved numbers phases 2 to 7 were built on.
    for (let days = 0; days <= 40; days += 1) {
      expect(APPROVED_DECAY.perDay(day({ consecutiveInactiveDays: days }))).toBe(
        decayForDay(days),
      );
    }
  });

  it('keeps the RC2 cap on a single episode', () => {
    const capped = APPROVED_DECAY.perDay(
      day({ consecutiveInactiveDays: 30, episodeSoFar: RATING.DECAY.MAX_PER_EPISODE }),
    );
    expect(capped).toBe(0);
  });

  it('never returns a negative amount', () => {
    expect(
      APPROVED_DECAY.perDay(day({ consecutiveInactiveDays: 30, episodeSoFar: 10_000 })),
    ).toBe(0);
  });
});

/*
 * The suspensions are part of the contract's shape and nothing populates
 * them. What a rest day or a pause should actually suspend is a separate
 * unresolved product question that D72 did not answer; these cases pin the
 * short-circuit so that wiring an input later is wiring an input, not
 * reopening this contract.
 */
describe('the two dormant suspensions', () => {
  it('does not decay a declared rest day', () => {
    expect(APPROVED_DECAY.perDay(day({ consecutiveInactiveDays: 10, restDay: true }))).toBe(0);
  });

  it('does not decay a day inside a pause', () => {
    expect(APPROVED_DECAY.perDay(day({ consecutiveInactiveDays: 10, paused: true }))).toBe(0);
  });

  it('changes nothing for data that has neither, which is all RC2 data', () => {
    expect(APPROVED_DECAY.perDay(day({ consecutiveInactiveDays: 10 }))).toBe(decayForDay(10));
  });
});
