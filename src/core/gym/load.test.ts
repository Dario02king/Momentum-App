import { describe, expect, it } from 'vitest';
import { bodyweightOn, effectiveLoadGrams, needsBodyweight } from './load';

const kg = (value: number) => Math.round(value * 1000);

const weights = [
  { date: '2026-01-10', grams: kg(84) },
  { date: '2026-02-01', grams: kg(85) },
  { date: '2026-03-15', grams: kg(87) },
];

describe('the bodyweight in force on a day', () => {
  it('takes the measurement from that exact day', () => {
    expect(bodyweightOn(weights, '2026-02-01')).toBe(kg(85));
  });

  it('takes the latest one before it when there is none that day', () => {
    expect(bodyweightOn(weights, '2026-02-20')).toBe(kg(85));
    expect(bodyweightOn(weights, '2026-01-31')).toBe(kg(84));
  });

  it('never reaches forward to a measurement taken later', () => {
    // Replaying January must give January's body, however often the user has
    // weighed themselves since. This is the whole rule.
    expect(bodyweightOn(weights, '2026-01-20')).toBe(kg(84));
    expect(bodyweightOn(weights, '2026-01-20')).not.toBe(kg(87));
  });

  it('has nothing before the first measurement, rather than a zero', () => {
    expect(bodyweightOn(weights, '2026-01-09')).toBeNull();
    expect(bodyweightOn([], '2026-05-01')).toBeNull();
  });

  it('does not depend on the order the entries arrive in', () => {
    const shuffled = [weights[2]!, weights[0]!, weights[1]!];
    expect(bodyweightOn(shuffled, '2026-02-20')).toBe(kg(85));
  });

  it('ignores a nonsense measurement rather than using it', () => {
    const spoilt = [...weights, { date: '2026-04-01', grams: 0 }];
    expect(bodyweightOn(spoilt, '2026-04-02')).toBe(kg(87));
  });
});

describe('effective load', () => {
  it('is the bar for an external lift', () => {
    expect(effectiveLoadGrams({ loadType: 'external', weightGrams: kg(60), bodyweightGrams: kg(85) })).toBe(kg(60));
    // And the bodyweight is irrelevant to it.
    expect(effectiveLoadGrams({ loadType: 'external', weightGrams: kg(60), bodyweightGrams: null })).toBe(kg(60));
  });

  it('treats a set with no load type as external, which is what it was', () => {
    expect(effectiveLoadGrams({ weightGrams: kg(42.5), bodyweightGrams: null })).toBe(kg(42.5));
  });

  it('is the body alone for a bodyweight exercise with nothing added', () => {
    expect(effectiveLoadGrams({ loadType: 'bodyweight', weightGrams: 0, bodyweightGrams: kg(85) })).toBe(kg(85));
  });

  it('is the body plus what was added', () => {
    // The specification's own example: 85 kg + 15 kg is a 100 kg load.
    expect(
      effectiveLoadGrams({ loadType: 'bodyweight', weightGrams: kg(15), bodyweightGrams: kg(85) }),
    ).toBe(kg(100));
  });

  it('is the body minus the assistance', () => {
    // 85 kg − 25 kg is 60 kg, and then reps × 60 like any other set.
    expect(
      effectiveLoadGrams({ loadType: 'assisted', weightGrams: kg(25), bodyweightGrams: kg(85) }),
    ).toBe(kg(60));
  });

  it('drops a bodyweight set on a day with no bodyweight recorded', () => {
    // Not a zero, not a guess: no load anyone can measure.
    expect(effectiveLoadGrams({ loadType: 'bodyweight', weightGrams: kg(15), bodyweightGrams: null })).toBeNull();
    expect(effectiveLoadGrams({ loadType: 'assisted', weightGrams: kg(25), bodyweightGrams: null })).toBeNull();
  });

  it('never turns assistance heavier than the user into a positive load', () => {
    /*
     * 85 − 90 is not a 5 kg lift. Flipping the sign would invent a workout,
     * and clamping to some floor would invent a different one, so the set
     * describes no measurable work and is dropped.
     */
    expect(effectiveLoadGrams({ loadType: 'assisted', weightGrams: kg(90), bodyweightGrams: kg(85) })).toBeNull();
    expect(effectiveLoadGrams({ loadType: 'assisted', weightGrams: kg(85), bodyweightGrams: kg(85) })).toBeNull();
    // One gram under is still a real, if tiny, load.
    expect(effectiveLoadGrams({ loadType: 'assisted', weightGrams: kg(85) - 1, bodyweightGrams: kg(85) })).toBe(1);
  });

  it('refuses a load that is not a whole positive number of grams', () => {
    expect(effectiveLoadGrams({ weightGrams: -1, bodyweightGrams: null })).toBeNull();
    expect(effectiveLoadGrams({ weightGrams: 60.5, bodyweightGrams: null })).toBeNull();
    expect(effectiveLoadGrams({ weightGrams: Number.NaN, bodyweightGrams: null })).toBeNull();
    expect(effectiveLoadGrams({ weightGrams: Infinity, bodyweightGrams: null })).toBeNull();
    expect(effectiveLoadGrams({ loadType: 'external', weightGrams: 0, bodyweightGrams: kg(85) })).toBeNull();
  });

  it('stays integer, so two identical sets always compare equal', () => {
    const a = effectiveLoadGrams({ loadType: 'bodyweight', weightGrams: kg(15), bodyweightGrams: kg(85.5) })!;
    const b = effectiveLoadGrams({ loadType: 'bodyweight', weightGrams: kg(15), bodyweightGrams: kg(85.5) })!;
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBe(b);
    expect(8 * a).toBe(8 * b);
  });

  it('knows which types need a bodyweight before they can be scored', () => {
    expect(needsBodyweight('bodyweight')).toBe(true);
    expect(needsBodyweight('assisted')).toBe(true);
    expect(needsBodyweight('external')).toBe(false);
    expect(needsBodyweight(undefined)).toBe(false);
  });
});
