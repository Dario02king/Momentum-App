import { describe, expect, it, vi } from 'vitest';

/**
 * Proof that model *selection* is connected, not just the call.
 *
 * The previous test shows `activeDecayModel()` is asked. This one shows the
 * answer decides the outcome: swapping the model in an isolated file changes
 * what the production fold produces. Together they close the hole that made
 * `DECAY_MODEL_APPROVED` meaningless for six phases.
 *
 * The substitution lives only in this file's module registry. Production
 * constants are untouched, and the last case asserts exactly that.
 */

const SUBSTITUTE_PER_DAY = 7;

vi.mock('../decay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./index')>();
  return {
    ...actual,
    // A model that is deliberately nothing like the approved one: a flat
    // charge from the very first silent day, no grace, no episode cap.
    activeDecayModel: () => ({
      id: 'test-substitute',
      provisional: true,
      describe: 'A substitute used only to prove selection is wired.',
      perDay: () => SUBSTITUTE_PER_DAY,
    }),
  };
});

const { computeRating } = await import('../rating');
type DayState = Parameters<typeof computeRating>[0][number];

const scored = (recorded: boolean): DayState => ({
  date: '2026-01-01',
  status: 'scored',
  score: recorded ? 90 : null,
  recordedScore: recorded ? 90 : null,
  dueItems: 1,
  answeredItems: recorded ? 1 : 0,
  recorded,
  complete: recorded,
});

describe('replacing the model replaces the behaviour', () => {
  it('charges what the substituted model says, not the approved schedule', () => {
    const result = computeRating([
      ...Array.from({ length: 20 }, () => scored(true)),
      ...Array.from({ length: 10 }, () => scored(false)),
    ]);
    const charged = result.points.filter((point) => point.decay > 0).map((point) => point.decay);

    // Ten charges of 7 — including the two days the approved model grants as
    // grace, which is how we know the approved schedule is not still running
    // underneath.
    expect(charged).toEqual(Array.from({ length: 10 }, () => SUBSTITUTE_PER_DAY));
  });

  it('is not bounded by the approved episode cap either', () => {
    const result = computeRating([
      ...Array.from({ length: 5 }, () => scored(true)),
      ...Array.from({ length: 40 }, () => scored(false)),
    ]);
    const total = result.points.reduce((sum, point) => sum + point.decay, 0);
    // The approved model would stop at 60. This one does not, because the cap
    // belongs to the model rather than to the fold.
    expect(total).toBe(40 * SUBSTITUTE_PER_DAY);
  });

  it('changes nothing about the real module’s approval state', async () => {
    // The substitution is this file's module registry and nowhere else.
    const real = await vi.importActual<typeof import('./index')>('./index');
    expect(real.DECAY_MODEL_APPROVED).toBe(true);
    expect(real.activeDecayModel().provisional).toBe(false);
    expect(real.activeDecayModel().id).toBe('rc2-general');
  });
});
