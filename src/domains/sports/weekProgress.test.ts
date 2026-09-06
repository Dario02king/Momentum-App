import { describe, expect, it } from 'vitest';
import { weekProgress } from './weekProgress';

const WEEK = '2025-W14';

describe('weekly training progress', () => {
  it('reports progress towards the target', () => {
    const progress = weekProgress(2, 3, WEEK);
    expect(progress.completed).toBe(2);
    expect(progress.target).toBe(3);
    expect(progress.remaining).toBe(1);
    expect(progress.score).toBeCloseTo(66.67, 1);
    expect(progress.met).toBe(false);
  });

  it('caps the score at 100 rather than rewarding overshoot', () => {
    const progress = weekProgress(5, 3, WEEK);
    expect(progress.score).toBe(100);
    expect(progress.met).toBe(true);
    expect(progress.exceeded).toBe(true);
    expect(progress.remaining).toBe(0);
  });

  it('handles a week with nothing logged', () => {
    const progress = weekProgress(0, 3, WEEK);
    expect(progress.score).toBe(0);
    expect(progress.remaining).toBe(3);
    expect(progress.met).toBe(false);
  });

  it('treats meeting the target exactly as met but not exceeded', () => {
    const progress = weekProgress(3, 3, WEEK);
    expect(progress.met).toBe(true);
    expect(progress.exceeded).toBe(false);
    expect(progress.score).toBe(100);
  });

  it('never divides by a nonsensical target', () => {
    expect(weekProgress(1, 0, WEEK).score).toBe(100);
    expect(weekProgress(0, 0, WEEK).target).toBe(1);
  });
});
