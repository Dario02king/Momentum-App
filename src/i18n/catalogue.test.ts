import { describe, expect, it } from 'vitest';
import { de, type TranslationKey } from './de';
import { en } from './en';
import { translate } from './index';

/**
 * German is the source of truth for the key set and English is typed against
 * it, so a missing or misspelled key is already a compile error. What the
 * type cannot see is the inside of the string: a placeholder renamed in one
 * language only still compiles, and ships a literal `{total}` to the screen.
 */

const placeholders = (template: string): string[] =>
  [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();

const keys = Object.keys(de) as TranslationKey[];

describe('the string catalogues', () => {
  it('has strings to check', () => {
    expect(keys.length).toBeGreaterThan(50);
  });

  it('uses the same placeholders in every language', () => {
    const drifted = keys
      .filter((key) => placeholders(de[key]).join() !== placeholders(en[key]).join())
      .map((key) => `${key}: de(${placeholders(de[key])}) en(${placeholders(en[key])})`);

    expect(drifted).toEqual([]);
  });

  it('leaves no placeholder unfilled when the expected params are given', () => {
    for (const key of keys) {
      const params = Object.fromEntries(placeholders(de[key]).map((name) => [name, 'x']));
      for (const language of ['de', 'en'] as const) {
        expect(translate(language, key, params), key).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('has no empty string in either language', () => {
    const empty = keys.filter((key) => de[key].trim() === '' || en[key].trim() === '');
    expect(empty).toEqual([]);
  });
});
