import { describe, expect, it } from 'vitest';
import {
  SCALE_VALUES,
  clampScaleValue,
  isValidScaleValue,
  scaleBandOf,
  scaleValueToPercent,
} from './scale';

describe('scale bands', () => {
  it('reads the whole range the way the specification defines it', () => {
    expect(SCALE_VALUES).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // The fixed mapping, value by value (D123): 1–4 weak, 5–6 mixed,
    // 7–8 good, 9–10 strong.
    expect(SCALE_VALUES.map(scaleBandOf)).toEqual([
      'weak',
      'weak',
      'weak',
      'weak',
      'mixed',
      'mixed',
      'good',
      'good',
      'strong',
      'strong',
    ]);
  });

  it('treats each band start as inclusive and each end as exclusive', () => {
    expect(scaleBandOf(4.9)).toBe('weak');
    expect(scaleBandOf(5)).toBe('mixed');
    expect(scaleBandOf(6.9)).toBe('mixed');
    expect(scaleBandOf(7)).toBe('good');
    expect(scaleBandOf(8.9)).toBe('good');
    expect(scaleBandOf(9)).toBe('strong');
    expect(scaleBandOf(10)).toBe('strong');
  });

  it('clamps values that fall outside the range', () => {
    expect(clampScaleValue(0)).toBe(1);
    expect(clampScaleValue(11)).toBe(10);
    expect(scaleBandOf(0)).toBe('weak');
    expect(scaleBandOf(99)).toBe('strong');
  });

  it('converts an answer to a percentage', () => {
    expect(scaleValueToPercent(1)).toBe(10);
    expect(scaleValueToPercent(7)).toBe(70);
    expect(scaleValueToPercent(10)).toBe(100);
  });

  it('rejects values that are not answers', () => {
    expect(isValidScaleValue(5)).toBe(true);
    expect(isValidScaleValue(0)).toBe(false);
    expect(isValidScaleValue(10.5)).toBe(false);
    expect(isValidScaleValue('7')).toBe(false);
    expect(isValidScaleValue(Number.NaN)).toBe(false);
  });
});
