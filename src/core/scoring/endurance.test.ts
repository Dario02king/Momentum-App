import { describe, expect, it } from 'vitest';
import { TRAINING_RATING } from '../config/constants';
import { enduranceState, type EnduranceWeek } from './endurance';

const week = (weekKey: string, sessions: number, target = 3, inProgress = false): EnduranceWeek => ({
  weekKey,
  sessions,
  target,
  inProgress,
});

const keys = (count: number) =>
  Array.from({ length: count }, (_, index) => `2026-W${`${index + 1}`.padStart(2, '0')}`);

describe('the Endurance Phase', () => {
  it('unlocks after four met weeks', () => {
    const state = enduranceState(keys(4).map((key) => week(key, 3)));
    expect(state.progress).toBe(4);
    expect(state.unlocked).toBe(true);
    expect(state.unlockedAt).toBe('2026-W04');
    expect(state.remaining).toBe(0);
  });

  it('takes half a week off for a missed week, and does not reset', () => {
    const state = enduranceState([
      week('2026-W01', 3),
      week('2026-W02', 3),
      week('2026-W03', 1),
      week('2026-W04', 3),
    ]);
    // The specification's own worked example: 1.0, 2.0, 1.5, 2.5.
    expect(state.points.map((point) => point.progress)).toEqual([1, 2, 1.5, 2.5]);
    expect(state.unlocked).toBe(false);
    expect(state.remaining).toBe(1.5);
  });

  it('never goes below zero', () => {
    const state = enduranceState(keys(6).map((key) => week(key, 0)));
    expect(state.progress).toBe(0);
    expect(state.points.every((point) => point.progress >= 0)).toBe(true);
  });

  it('does not unlock merely because 28 days went by', () => {
    // Four completed weeks, none of them met. Time is not the requirement.
    const state = enduranceState(keys(4).map((key) => week(key, 1)));
    expect(state.points).toHaveLength(4);
    expect(state.unlocked).toBe(false);
    expect(state.progress).toBe(0);
  });

  it('needs the extra weeks a setback costs', () => {
    const state = enduranceState([
      week('2026-W01', 3),
      week('2026-W02', 3),
      week('2026-W03', 1),
      week('2026-W04', 3),
      week('2026-W05', 3),
      week('2026-W06', 3),
    ]);
    expect(state.points.map((point) => point.progress)).toEqual([1, 2, 1.5, 2.5, 3.5, 4.5]);
    expect(state.unlockedAt).toBe('2026-W06');
  });

  it('stays unlocked once it has been, whatever happens afterwards', () => {
    const state = enduranceState([
      ...keys(4).map((key) => week(key, 3)),
      week('2026-W05', 0),
      week('2026-W06', 0),
      week('2026-W07', 0),
      week('2026-W08', 0),
      week('2026-W09', 0),
    ]);
    expect(state.progress).toBe(1.5);
    expect(state.unlocked).toBe(true);
    expect(state.unlockedAt).toBe('2026-W04');
    expect(state.points.every((point) => point.unlocked || point.weekKey < '2026-W04')).toBe(true);
  });

  it('does not judge the week the user is still living', () => {
    const state = enduranceState([
      week('2026-W01', 3),
      week('2026-W02', 0, 3, true),
    ]);
    expect(state.points).toHaveLength(1);
    expect(state.progress).toBe(1);
  });

  it('counts a week met when the target is beaten, not merely reached', () => {
    expect(enduranceState([week('2026-W01', 5, 3)]).progress).toBe(1);
    expect(enduranceState([week('2026-W01', 3, 3)]).progress).toBe(1);
    expect(enduranceState([week('2026-W01', 2, 3)]).progress).toBe(0);
  });

  it('reports the requirement it is measuring against', () => {
    expect(enduranceState([]).required).toBe(TRAINING_RATING.ENDURANCE_WEEKS_REQUIRED);
    expect(enduranceState([]).progress).toBe(0);
    expect(enduranceState([]).unlocked).toBe(false);
  });
});
