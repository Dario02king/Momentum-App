import { describe, expect, it } from 'vitest';
import { itemPercent, scoreDay, type DayInput } from './dayScore';

function day(overrides: Partial<DayInput> = {}): DayInput {
  return {
    date: '2025-03-31',
    editState: 'closed',
    mental: null,
    sports: null,
    ...overrides,
  };
}

function mental(
  due: { id: string; type: 'boolean' | 'scale' }[],
  answers: Record<string, boolean | number> = {},
) {
  return { due, answers: new Map(Object.entries(answers)) };
}

describe('one answered item as a percentage', () => {
  it('scores a yes/no answer at the extremes', () => {
    expect(itemPercent('boolean', true)).toBe(100);
    expect(itemPercent('boolean', false)).toBe(0);
  });

  it('scores a scale answer as value times ten', () => {
    expect(itemPercent('scale', 1)).toBe(10);
    expect(itemPercent('scale', 7)).toBe(70);
    expect(itemPercent('scale', 10)).toBe(100);
  });
});

describe('Mental Wellbeing for a day', () => {
  it('divides by the number of items due, not the number answered', () => {
    const score = scoreDay(
      day({
        mental: mental(
          [
            { id: 'a', type: 'boolean' },
            { id: 'b', type: 'boolean' },
          ],
          { a: true },
        ),
      }),
    );
    // One of two answered on a closed day: 100 + 0 over two items.
    expect(score.score).toBe(50);
    expect(score.domains[0]?.itemsAnswered).toBe(1);
    expect(score.domains[0]?.itemsDue).toBe(2);
  });

  it('mixes yes/no and scale answers', () => {
    const score = scoreDay(
      day({
        mental: mental(
          [
            { id: 'a', type: 'boolean' },
            { id: 'b', type: 'scale' },
          ],
          { a: true, b: 6 },
        ),
      }),
    );
    expect(score.score).toBe(80); // (100 + 60) / 2
  });

  it('exposes each question score for the drill-down', () => {
    const score = scoreDay(
      day({
        mental: mental(
          [
            { id: 'a', type: 'boolean' },
            { id: 'b', type: 'scale' },
          ],
          { a: false, b: 9 },
        ),
      }),
    );
    expect(score.questionScores.get('a')).toBe(0);
    expect(score.questionScores.get('b')).toBe(90);
  });
});

describe('missing data — one rule, no exceptions', () => {
  it('a day with nothing due is neutral, not zero', () => {
    const score = scoreDay(day({ mental: mental([]) }));
    expect(score.status).toBe('neutral');
    expect(score.score).toBeNull();
  });

  it('an unanswered day inside the edit window is open, not missed', () => {
    const score = scoreDay(
      day({ editState: 'open', mental: mental([{ id: 'a', type: 'boolean' }]) }),
    );
    expect(score.status).toBe('open');
    expect(score.score).toBeNull();
  });

  it('a partly answered day inside the window is still open', () => {
    const score = scoreDay(
      day({
        editState: 'open',
        mental: mental(
          [
            { id: 'a', type: 'boolean' },
            { id: 'b', type: 'boolean' },
          ],
          { a: true },
        ),
      }),
    );
    expect(score.status).toBe('open');
    expect(score.score).toBeNull();
  });

  it('a fully answered day inside the window is scored right away', () => {
    const score = scoreDay(
      day({
        editState: 'open',
        mental: mental([{ id: 'a', type: 'boolean' }], { a: true }),
      }),
    );
    expect(score.status).toBe('scored');
    expect(score.score).toBe(100);
  });

  it('the same day counts as missed once the window has closed', () => {
    const open = scoreDay(
      day({ editState: 'open', mental: mental([{ id: 'a', type: 'boolean' }]) }),
    );
    const closed = scoreDay(
      day({ editState: 'closed', mental: mental([{ id: 'a', type: 'boolean' }]) }),
    );
    expect(open.score).toBeNull();
    expect(closed.status).toBe('scored');
    expect(closed.score).toBe(0);
  });

  it('a future day is never scored', () => {
    const score = scoreDay(
      day({ editState: 'future', mental: mental([{ id: 'a', type: 'boolean' }]) }),
    );
    expect(score.status).toBe('open');
    expect(score.score).toBeNull();
  });
});

describe('Sports for a day', () => {
  it('scores the week towards its target', () => {
    const score = scoreDay(
      day({ sports: { target: 3, sessionsInWeek: 2, weekInProgress: false } }),
    );
    expect(score.domains[0]?.score).toBeCloseTo(66.67, 1);
  });

  it('caps at 100 when the target is beaten', () => {
    const score = scoreDay(
      day({ sports: { target: 3, sessionsInWeek: 5, weekInProgress: false } }),
    );
    expect(score.domains[0]?.score).toBe(100);
  });

  it('a finished week with nothing logged is a genuine zero', () => {
    const score = scoreDay(
      day({ sports: { target: 3, sessionsInWeek: 0, weekInProgress: false } }),
    );
    expect(score.domains[0]?.score).toBe(0);
    expect(score.score).toBe(0);
  });

  it('a running week with nothing logged has no data yet', () => {
    // The same principle as an open day: it cannot have been missed yet.
    const score = scoreDay(
      day({ sports: { target: 3, sessionsInWeek: 0, weekInProgress: true } }),
    );
    expect(score.domains[0]?.score).toBeNull();
    expect(score.status).toBe('neutral');
  });

  it('a running week reports its progress once anything is logged', () => {
    const score = scoreDay(
      day({ sports: { target: 4, sessionsInWeek: 1, weekInProgress: true } }),
    );
    expect(score.domains[0]?.score).toBe(25);
  });
});

describe('the overall daily score', () => {
  it('is the unweighted mean of the domains', () => {
    const score = scoreDay(
      day({
        mental: mental([{ id: 'a', type: 'boolean' }], { a: true }),
        sports: { target: 4, sessionsInWeek: 1, weekInProgress: false },
      }),
    );
    expect(score.score).toBe(62.5); // (100 + 25) / 2
  });

  it('does not let a domain with more items dominate one with fewer', () => {
    // Five perfect mental items and one missed sports week still average to 50.
    const score = scoreDay(
      day({
        mental: mental(
          [1, 2, 3, 4, 5].map((n) => ({ id: `q${n}`, type: 'boolean' as const })),
          { q1: true, q2: true, q3: true, q4: true, q5: true },
        ),
        sports: { target: 3, sessionsInWeek: 0, weekInProgress: false },
      }),
    );
    expect(score.score).toBe(50);
  });

  it('excludes a domain with no data from the denominator', () => {
    const score = scoreDay(
      day({
        mental: mental([{ id: 'a', type: 'boolean' }], { a: true }),
        sports: { target: 3, sessionsInWeek: 0, weekInProgress: true },
      }),
    );
    // Sports has no data this week, so the day is Mental Wellbeing alone —
    // not 100 averaged with a zero.
    expect(score.score).toBe(100);
  });

  it('scores a sports-only day from sports alone', () => {
    const score = scoreDay(
      day({ sports: { target: 2, sessionsInWeek: 1, weekInProgress: false } }),
    );
    expect(score.status).toBe('scored');
    expect(score.score).toBe(50);
  });

  it('is neutral when both domains are off', () => {
    expect(scoreDay(day()).status).toBe('neutral');
  });
});
