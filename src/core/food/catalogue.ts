import type { Language } from '../model';

/**
 * The handful of foods Momentum ships with.
 *
 * Four properties, and the first two are the same ones the exercise
 * catalogue lives by:
 *
 * 1. **It is code, not data.** These ship with the app, so they are never
 *    written to a store and never appear in a backup — a user's export
 *    carries what *they* logged, not a copy of our sample content.
 * 2. **The ids are permanent.** A logged entry keeps `foodId`, so renaming a
 *    demo food is a rename and not the start of a different food.
 * 3. **It is a starting point, not a database.** Five entries, chosen to
 *    cover the shapes a first week runs into. There is no food API, no
 *    barcode scanner and no thousand-row table behind this, by design — the
 *    free entry beside it is the answer for everything else.
 * 4. **Nothing here is scored.** The figures are per 100 g and exist so a
 *    logged day can show what it added up to. Food's rank is the 1–10
 *    adherence the user entered; see `adherence.ts` for why.
 *
 * Values are ordinary per-100 g reference figures, rounded. They are
 * illustrative sample content and are not claimed to be exact for any
 * particular product.
 */
export interface DemoFood {
  id: string;
  /** German is the source of truth; English is the translation of it. */
  name: Record<Language, string>;
  /** Per 100 g. */
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** A plausible single portion, so logging one is a tap and not a sum. */
  defaultGrams: number;
}

export const DEMO_FOODS: DemoFood[] = [
  {
    id: 'food_oats',
    name: { de: 'Haferflocken', en: 'Rolled oats' },
    kcal: 372,
    proteinG: 13.5,
    carbsG: 59,
    fatG: 7,
    defaultGrams: 60,
  },
  {
    id: 'food_quark',
    name: { de: 'Magerquark', en: 'Low-fat quark' },
    kcal: 67,
    proteinG: 12,
    carbsG: 4,
    fatG: 0.3,
    defaultGrams: 200,
  },
  {
    id: 'food_chicken_breast',
    name: { de: 'Poulet-Brust', en: 'Chicken breast' },
    kcal: 108,
    proteinG: 23,
    carbsG: 0,
    fatG: 1.8,
    defaultGrams: 150,
  },
  {
    id: 'food_banana',
    name: { de: 'Banane', en: 'Banana' },
    kcal: 89,
    proteinG: 1.1,
    carbsG: 23,
    fatG: 0.3,
    defaultGrams: 120,
  },
  {
    id: 'food_wholegrain_bread',
    name: { de: 'Vollkornbrot', en: 'Wholegrain bread' },
    kcal: 232,
    proteinG: 8,
    carbsG: 40,
    fatG: 3,
    defaultGrams: 60,
  },
];

export function demoFoodById(id: string): DemoFood | undefined {
  return DEMO_FOODS.find((food) => food.id === id);
}

/** A nutrient figure for a portion, from a per-100 g value. Rounded once. */
export function forGrams(per100g: number, grams: number): number {
  return Math.round((per100g * grams) / 100);
}
