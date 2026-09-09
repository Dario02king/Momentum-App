import { describe, expect, it } from 'vitest';
import type { QuestionCategory, ScoringModel } from '../model';
import { itemPercent, scoreDay, type DayInput, type WeeklyDayInput } from './dayScore';

/**
 * `sports` here is shorthand for "the one weekly-quota domain", which is what
 * every one of these cases is about. The rule under test is the same whether
 * that quota belongs to RC2's Sport domain, to Gym or to Running.
 */
function day(
  overrides: Partial<Omit<DayInput, 'weekly'>> & {
    sports?: Omit<WeeklyDayInput, 'domain'> | null;
  } = {},
): DayInput {
  const { sports = null, food = null, ...rest } = overrides;
  return {
    date: '2025-03-31',
    editState: 'closed',
    mental: null,
    weekly: sports ? [{ domain: 'sports', ...sports }] : [],
    food,
    ...rest,
  };
}

/**
 * The existing cases all predate categories, so they run under the flat
 * model — which is exactly the point: they are the regression that proves the
 * old arithmetic still produces the old numbers.
 */
function mental(
  due: { id: string; type: 'boolean' | 'scale'; category?: QuestionCategory }[],
  answers: Record<string, boolean | number> = {},
  model: ScoringModel = 'flat',
) {
  return {
    due: due.map((question) => ({ category: 'eigene' as QuestionCategory, ...question })),
    answers: new Map(Object.entries(answers)),
    model,
  };
}

/** The same, under the two-level mean. */
function grouped(
  due: { id: string; type: 'boolean' | 'scale'; category: QuestionCategory }[],
  answers: Record<string, boolean | number> = {},
) {
  return mental(due, answers, 'categoryMean');
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

describe('the two-level mean (D18)', () => {
  /** The worked example from the decision, to the point. */
  const example = grouped(
    [
      { id: 'a1', type: 'scale', category: 'alltag' },
      { id: 'a2', type: 'scale', category: 'alltag' },
      { id: 'g1', type: 'scale', category: 'gesundheit' },
      { id: 'm1', type: 'scale', category: 'mental' },
      { id: 'm2', type: 'scale', category: 'mental' },
      { id: 'm3', type: 'scale', category: 'mental' },
      { id: 'm4', type: 'scale', category: 'mental' },
    ],
    { a1: 8, a2: 6, g1: 5, m1: 9, m2: 7, m3: 8, m4: 8 },
  );

  it('means within a category, then across categories', () => {
    // Alltag 7, Gesundheit 5, Mental 8 → 6.67, scored ×10 as a percentage.
    const score = scoreDay(day({ mental: example }));
    expect(score.score).toBeCloseTo(66.667, 3);
  });

  it('is not the flat mean of every question', () => {
    // (8+6+5+9+7+8+8)/7 = 7.286, which would overweight Mental for having
    // four questions in it.
    const score = scoreDay(day({ mental: example }));
    expect(score.score).not.toBeCloseTo(72.857, 3);
  });

  it('does not change what a category is worth when a question is added', () => {
    const before = scoreDay(
      day({
        mental: grouped(
          [
            { id: 'a1', type: 'scale', category: 'alltag' },
            { id: 'm1', type: 'scale', category: 'mental' },
          ],
          { a1: 10, m1: 6 },
        ),
      }),
    ).score;
    // A second Alltag question at the same level as the first: the category
    // mean is unchanged, so the day is unchanged.
    const after = scoreDay(
      day({
        mental: grouped(
          [
            { id: 'a1', type: 'scale', category: 'alltag' },
            { id: 'a2', type: 'scale', category: 'alltag' },
            { id: 'm1', type: 'scale', category: 'mental' },
          ],
          { a1: 10, a2: 10, m1: 6 },
        ),
      }),
    ).score;
    expect(after).toBeCloseTo(before ?? -1, 10);
  });

  it('treats "Eigene" as a category of its own', () => {
    // Not a bucket that is folded into something else, and not weighted
    // differently for being the user's own writing.
    const score = scoreDay(
      day({
        mental: grouped(
          [
            { id: 'm1', type: 'scale', category: 'mental' },
            { id: 'e1', type: 'scale', category: 'eigene' },
          ],
          { m1: 10, e1: 4 },
        ),
      }),
    );
    expect(score.score).toBeCloseTo(70, 10);
  });

  it('gives a custom question the weight of whichever category it is in', () => {
    // Moved into Mental, it shares Mental's slice rather than adding one.
    const own = scoreDay(
      day({
        mental: grouped(
          [
            { id: 'm1', type: 'scale', category: 'mental' },
            { id: 'e1', type: 'scale', category: 'eigene' },
          ],
          { m1: 10, e1: 4 },
        ),
      }),
    ).score;
    const moved = scoreDay(
      day({
        mental: grouped(
          [
            { id: 'm1', type: 'scale', category: 'mental' },
            { id: 'e1', type: 'scale', category: 'mental' },
          ],
          { m1: 10, e1: 4 },
        ),
      }),
    ).score;
    expect(own).toBeCloseTo(70, 10);
    expect(moved).toBeCloseTo(70, 10);
    // Same here by coincidence of the numbers; the shapes differ.
    expect(
      scoreDay(
        day({
          mental: grouped(
            [
              { id: 'm1', type: 'scale', category: 'mental' },
              { id: 'm2', type: 'scale', category: 'mental' },
              { id: 'e1', type: 'scale', category: 'eigene' },
            ],
            { m1: 10, m2: 10, e1: 4 },
          ),
        }),
      ).score,
    ).toBeCloseTo(70, 10);
  });
});

describe('what an unanswered question means under category scoring', () => {
  const due = [
    { id: 'a1', type: 'scale' as const, category: 'alltag' as const },
    { id: 'a2', type: 'scale' as const, category: 'alltag' as const },
    { id: 'm1', type: 'scale' as const, category: 'mental' as const },
  ];

  it('is a miss on a closed day, inside its own category', () => {
    // Alltag: one of two answered at 8 → 4. Mental: 10. Day: 7.
    const score = scoreDay(day({ mental: grouped(due, { a1: 8, m1: 10 }) }));
    expect(score.score).toBeCloseTo(70, 10);
  });

  it('never becomes a zero in the number the rating tracks', () => {
    // The rating divides by what was answered: Alltag 8, Mental 10 → 9.
    const score = scoreDay(day({ mental: grouped(due, { a1: 8, m1: 10 }) }));
    expect(score.recordedScore).toBeCloseTo(90, 10);
  });

  it('leaves a category with nothing answered out of the rating entirely', () => {
    // Alltag has no data at all. The rating sees Mental alone, not a zero.
    const score = scoreDay(day({ mental: grouped(due, { m1: 10 }) }));
    expect(score.recordedScore).toBeCloseTo(100, 10);
  });

  it('still counts that category as missed in the history number', () => {
    // History says what happened: two Alltag questions were due and neither
    // was answered, so Alltag is a zero and the day reads (0 + 100) / 2.
    const score = scoreDay(day({ mental: grouped(due, { m1: 10 }) }));
    expect(score.score).toBeCloseTo(50, 10);
  });

  it('has no score at all on an open day with nothing recorded', () => {
    const score = scoreDay(day({ editState: 'open', mental: grouped(due, {}) }));
    expect(score.status).toBe('open');
    expect(score.score).toBeNull();
    expect(score.recordedScore).toBeNull();
  });

  it('scores an open day on what was reported, over its categories', () => {
    const score = scoreDay(day({ editState: 'open', mental: grouped(due, { a1: 8, m1: 10 }) }));
    expect(score.status).toBe('open');
    expect(score.recordedScore).toBeCloseTo(90, 10);
  });
});

describe('the flat model, which every earlier day keeps', () => {
  const due = [
    { id: 'a1', type: 'scale' as const, category: 'alltag' as const },
    { id: 'a2', type: 'scale' as const, category: 'alltag' as const },
    { id: 'm1', type: 'scale' as const, category: 'mental' as const },
  ];

  it('still divides by every question due, ignoring categories', () => {
    // (80 + 0 + 100) / 3 — the arithmetic these days were lived under.
    const score = scoreDay(day({ mental: mental(due, { a1: 8, m1: 10 }) }));
    expect(score.score).toBeCloseTo(60, 10);
  });

  it('gives a different answer from the category model, which is the point', () => {
    const flat = scoreDay(day({ mental: mental(due, { a1: 8, m1: 10 }) })).score;
    const grouped2 = scoreDay(day({ mental: grouped(due, { a1: 8, m1: 10 }) })).score;
    expect(flat).not.toBeCloseTo(grouped2 ?? -1, 3);
  });
});
