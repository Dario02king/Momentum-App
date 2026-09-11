import { describe, expect, it } from 'vitest';
import { sparkPoints } from './Sparkline';

/** The approved spark80 geometry: 74px of width, 3px inset, 16px of height. */
describe('sparkPoints', () => {
  it('spreads the points evenly and puts the first and last on the margins', () => {
    const points = sparkPoints([0, 10, 20]);
    expect(points.map((p) => p.x)).toEqual([3, 40, 77]);
    expect(points[0]!.y).toBe(20);   // the lowest value sits on the floor
    expect(points[2]!.y).toBe(4);    // the highest on the ceiling
  });

  it('draws a series with no span flat down the middle, never a full-height bar', () => {
    for (const values of [[7, 7, 7], [0, 0], [-3, -3, -3, -3]]) {
      const points = sparkPoints(values);
      expect(points.every((p) => p.y === 12)).toBe(true);
      expect(points.every((p) => Number.isFinite(p.y))).toBe(true);
    }
  });

  it('places a single observation in the middle, with nothing to join it to', () => {
    const points = sparkPoints([42]);
    expect(points).toHaveLength(1);
    expect(points[0]).toEqual({ x: 40, y: 12 });
  });

  it('has nothing to draw without points, and never invents one', () => {
    expect(sparkPoints([])).toEqual([]);
  });

  it('scales each series to itself: the same shape at any magnitude', () => {
    const small = sparkPoints([1, 2, 3]);
    const large = sparkPoints([100, 200, 300]);
    expect(small).toEqual(large);
  });

  it('keeps negative values inside the box', () => {
    const points = sparkPoints([-20, 0, -5]);
    expect(points.every((p) => p.y >= 4 && p.y <= 20)).toBe(true);
    expect(points[0]!.y).toBe(20);
    expect(points[1]!.y).toBe(4);
  });
});
