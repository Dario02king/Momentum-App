import { describe, expect, it } from 'vitest';
import { scoreDay, type DayInput, type FoodDayInput } from './dayScore';

/**
 * Food's day score, and the three states it has to keep apart.
 *
 * The rules under test are not new ones: they are the app's existing
 * two-numbers rule and its "absence is not failure" rule, applied to a domain
 * whose daily item happens to be a single 1–10 rating.
 */

function day(overrides: Partial<DayInput> = {}): DayInput {
  return {
    date: '2026-03-02',
    editState: 'closed',
    mental: null,
    weekly: [],
    food: null,
    ...overrides,
  };
}

const food = (adherence: number | null): FoodDayInput => ({ adherence });

const foodPart = (result: ReturnType<typeof scoreDay>) =>
  result.domains.find((entry) => entry.domain === 'food');

describe('a day with Food switched off', () => {
  it('has no food entry at all — not an unrated one', () => {
    const result = scoreDay(day({ food: null }));
    expect(foodPart(result)).toBeUndefined();
    expect(result.status).toBe('neutral');
    expect(result.score).toBeNull();
  });
});

describe('a rated day', () => {
  it('scores the rating the user entered, times ten', () => {
    const result = scoreDay(day({ food: food(7) }));
    expect(foodPart(result)).toEqual({
      domain: 'food',
      score: 70,
      itemsDue: 1,
      itemsAnswered: 1,
    });
    expect(result.status).toBe('scored');
    expect(result.score).toBe(70);
    expect(result.recordedScore).toBe(70);
  });

  it('reports a genuinely bad day as a real result, not as absence', () => {
    const result = scoreDay(day({ food: food(1) }));
    expect(foodPart(result)?.score).toBe(10);
    expect(foodPart(result)?.itemsAnswered).toBe(1);
    expect(result.recordedScore).toBe(10);
  });
});

describe('an unrated day', () => {
  it('is open while the user can still rate it, and costs nothing', () => {
    const result = scoreDay(day({ editState: 'open', food: food(null) }));
    expect(result.status).toBe('open');
    expect(result.score).toBeNull();
    // Nothing was reported, so the rating has no data for this day either.
    expect(result.recordedScore).toBeNull();
  });

  it('is a miss for history once the day has closed', () => {
    const result = scoreDay(day({ editState: 'closed', food: food(null) }));
    expect(result.status).toBe('scored');
    expect(foodPart(result)?.score).toBe(0);
    expect(foodPart(result)?.itemsAnswered).toBe(0);
  });

  it('is still no data for the rating, even on a closed day', () => {
    // The whole of D35 in one assertion: admitting a bad day must never cost
    // more than staying silent, so silence cannot enter the recorded mean.
    const result = scoreDay(day({ editState: 'closed', food: food(null) }));
    expect(result.recordedScore).toBeNull();
  });
});

describe('Food beside the other domains', () => {
  it('is one domain in the unweighted mean, however many questions there are', () => {
    const result = scoreDay(
      day({
        mental: {
          due: [
            { id: 'q1', type: 'boolean', category: 'alltag' },
            { id: 'q2', type: 'boolean', category: 'alltag' },
            { id: 'q3', type: 'boolean', category: 'alltag' },
          ],
          answers: new Map<string, boolean | number>([
            ['q1', true],
            ['q2', true],
            ['q3', true],
          ]),
          model: 'categoryMean',
        },
        food: food(5),
      }),
    );
    // (100 + 50) / 2, not (100 + 100 + 100 + 50) / 4.
    expect(result.score).toBe(75);
  });

  it('leaves the day-level reported counts to Wellbeing, as Gym and Running do', () => {
    const withFood = scoreDay(day({ food: food(9) }));
    expect(withFood.dueItems).toBe(0);
    expect(withFood.answeredItems).toBe(0);
  });

  it('cannot change a weekly domain’s own figure', () => {
    const weekly = {
      domain: 'gym' as const,
      target: 3,
      sessionsInWeek: 2,
      weekInProgress: false,
    };
    const without = scoreDay(day({ weekly: [weekly] }));
    const withFood = scoreDay(day({ weekly: [weekly], food: food(2) }));
    const gymOf = (result: ReturnType<typeof scoreDay>) =>
      result.domains.find((entry) => entry.domain === 'gym');
    expect(gymOf(withFood)).toEqual(gymOf(without));
  });

  it('keeps a day open while Food is unrated, even when everything else is done', () => {
    const result = scoreDay(
      day({
        editState: 'open',
        mental: {
          due: [{ id: 'q1', type: 'boolean', category: 'alltag' }],
          answers: new Map<string, boolean | number>([['q1', true]]),
          model: 'categoryMean',
        },
        food: food(null),
      }),
    );
    expect(result.status).toBe('open');
  });
});
