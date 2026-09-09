import { describe, expect, it } from 'vitest';
import { SCALE_MAX, SCALE_MIN } from '../config/constants';
import { scaleValueToPercent } from '../scoring/scale';
import {
  ADHERENCE_MAX,
  ADHERENCE_MIN,
  ADHERENCE_VALUES,
  adherenceBandOf,
  adherencePercent,
  isValidAdherence,
} from './adherence';
import { DEMO_FOODS, demoFoodById, forGrams } from './catalogue';

describe('the adherence scale', () => {
  it('is the same 1–10 the rest of the app uses', () => {
    // Not a coincidence to be kept in sync by hand: a second scale with its
    // own bounds would be a second thing for the user to learn.
    expect(ADHERENCE_MIN).toBe(SCALE_MIN);
    expect(ADHERENCE_MAX).toBe(SCALE_MAX);
    expect(ADHERENCE_VALUES).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('maps a value to the same percentage a scale answer would', () => {
    for (const value of ADHERENCE_VALUES) {
      expect(adherencePercent(value)).toBe(scaleValueToPercent(value));
    }
    expect(adherencePercent(1)).toBe(10);
    expect(adherencePercent(10)).toBe(100);
  });

  it('reads a value back with the words that go with it', () => {
    expect(adherenceBandOf(2)).toBe('poor');
    expect(adherenceBandOf(8)).toBe('good');
    expect(adherenceBandOf(10)).toBe('veryGood');
  });

  it('accepts only a whole number inside the scale', () => {
    expect(isValidAdherence(1)).toBe(true);
    expect(isValidAdherence(10)).toBe(true);
    expect(isValidAdherence(0)).toBe(false);
    expect(isValidAdherence(11)).toBe(false);
    expect(isValidAdherence(7.5)).toBe(false);
    expect(isValidAdherence('7')).toBe(false);
    expect(isValidAdherence(null)).toBe(false);
    expect(isValidAdherence(Number.NaN)).toBe(false);
  });
});

describe('the demo foods', () => {
  it('offers a handful, not a database', () => {
    expect(DEMO_FOODS.length).toBeGreaterThanOrEqual(3);
    expect(DEMO_FOODS.length).toBeLessThanOrEqual(5);
  });

  it('gives every one a permanent id and both languages', () => {
    const ids = new Set<string>();
    for (const food of DEMO_FOODS) {
      expect(food.id).toMatch(/^food_/);
      expect(ids.has(food.id)).toBe(false);
      ids.add(food.id);
      expect(food.name.de.length).toBeGreaterThan(0);
      expect(food.name.en.length).toBeGreaterThan(0);
      expect(food.defaultGrams).toBeGreaterThan(0);
      expect(food.kcal).toBeGreaterThan(0);
    }
    expect(demoFoodById(DEMO_FOODS[0]!.id)).toBe(DEMO_FOODS[0]);
    expect(demoFoodById('food_not_a_thing')).toBeUndefined();
  });

  it('scales a per-100 g figure to a portion', () => {
    expect(forGrams(372, 60)).toBe(223);
    expect(forGrams(67, 200)).toBe(134);
    // Rounded once, at the end — never a chain of rounded intermediates.
    expect(forGrams(0.3, 120)).toBe(0);
  });
});
