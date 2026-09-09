import { describe, expect, it, vi } from 'vitest';
import { RATING } from '../config/constants';

/**
 * Proof that `core/decay` is on the production execution path.
 *
 * Until D72 was approved this module was a contract nobody called: the fold
 * ran a second, inline copy of the same schedule, so `DECAY_MODEL_APPROVED`
 * was a claim about dead code and every test of it was self-consistent and
 * meaningless. These two files exist so that can never quietly happen again.
 *
 * Here the real model is wrapped in a spy that delegates to it, so the
 * assertions are about *whether it is called and with what* — the numbers are
 * unchanged by construction.
 */

const recorder = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));

vi.mock('../decay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./index')>();
  return {
    ...actual,
    activeDecayModel: () => {
      const model = actual.activeDecayModel();
      return {
        ...model,
        perDay: (day: Parameters<typeof model.perDay>[0]) => {
          recorder.calls.push({ ...day });
          return model.perDay(day);
        },
      };
    },
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

/** Twenty recorded days, then twelve silent ones. */
const history = (): DayState[] => [
  ...Array.from({ length: 20 }, () => scored(true)),
  ...Array.from({ length: 12 }, () => scored(false)),
];

describe('the production fold reaches decay through core/decay', () => {
  it('asks the active model once per inactive day, and never otherwise', () => {
    recorder.calls.length = 0;
    computeRating(history());
    // Twelve silent days, twelve questions. A recorded day asks nothing.
    expect(recorder.calls).toHaveLength(12);
  });

  it('hands it the episode as it actually stands', () => {
    recorder.calls.length = 0;
    computeRating(history());

    expect(recorder.calls.map((call) => call.consecutiveInactiveDays)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    // `episodeSoFar` accumulates what the model itself has already returned,
    // which is what makes the per-episode cap the model's own business.
    expect(recorder.calls[0]!.episodeSoFar).toBe(0);
    expect(recorder.calls[3]!.episodeSoFar).toBe(1.5);
    expect(recorder.calls[11]!.episodeSoFar).toBe(1.5 * 5 + 3 * 4);
  });

  it('passes the domain through when the caller knows it', () => {
    recorder.calls.length = 0;
    computeRating(history(), { domain: 'food' });
    expect(recorder.calls.every((call) => call.domain === 'food')).toBe(true);

    recorder.calls.length = 0;
    computeRating(history());
    // The legacy fold spans every domain and has no single answer, so it says
    // nothing rather than naming one.
    expect(recorder.calls.every((call) => call.domain === undefined)).toBe(true);
  });

  it('leaves the two dormant suspensions unset, because nothing populates them', () => {
    // If either of these ever arrives set, a rest-day or pause semantic has
    // been decided by a refactor rather than by a product decision.
    recorder.calls.length = 0;
    computeRating(history());
    expect(recorder.calls.every((call) => call.restDay === false)).toBe(true);
    expect(recorder.calls.every((call) => call.paused === false)).toBe(true);
  });

  it('restarts the episode when a day is recorded again', () => {
    recorder.calls.length = 0;
    computeRating([
      ...Array.from({ length: 10 }, () => scored(true)),
      ...Array.from({ length: 5 }, () => scored(false)),
      scored(true),
      ...Array.from({ length: 4 }, () => scored(false)),
    ]);
    expect(recorder.calls.map((call) => call.consecutiveInactiveDays)).toEqual([
      1, 2, 3, 4, 5, 1, 2, 3, 4,
    ]);
    expect(recorder.calls[5]!.episodeSoFar).toBe(0);
  });

  it('reports exactly what the model returned', () => {
    recorder.calls.length = 0;
    const result = computeRating(history());
    const charged = result.points.filter((point) => point.decay > 0).map((point) => point.decay);
    expect(charged).toEqual([1.5, 1.5, 1.5, 1.5, 1.5, 3, 3, 3, 3, 3]);
    // And the grace period cost nothing at all.
    expect(result.points.filter((point) => point.decay === 0 && !point.skipped)).toHaveLength(22);
    expect(RATING.DECAY.GRACE_DAYS).toBe(2);
  });
});
