import { describe, expect, it } from 'vitest';
import { LANGUAGES, translate } from '../../i18n';
import { bandOf, summarise } from './Heatmap';

/**
 * The invariants behind the Progress screen's accessible layer.
 *
 * These deliberately do not assert markup. What matters is not that a table
 * has a particular class but that the *facts* a sighted user reads off the
 * chart and the grid are still carried in words: the strips are decorative,
 * so if these strings stop stating a number, that number stops existing for
 * anyone not looking at the picture, and nothing else would notice.
 */

const placeholders = (template: string): string[] =>
  [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!);

describe('the row summary behind each strip', () => {
  it('counts what was recorded and what was not', () => {
    expect(summarise([80, null, 40, null, 0])).toEqual({
      recorded: 3,
      total: 5,
      missing: 2,
      average: 40,
    });
  });

  it('has no average when nothing was recorded, rather than zero', () => {
    // Zero would read as "a bad month"; the truth is "no month yet".
    expect(summarise([null, null]).average).toBeNull();
    expect(summarise([]).average).toBeNull();
  });

  it('counts a recorded zero as recorded', () => {
    // A day scored 0 is data. Only `null` is an absence.
    expect(summarise([0, 0]).recorded).toBe(2);
    expect(summarise([0, 0]).average).toBe(0);
  });

  it('states every count it promises, in every language', () => {
    for (const language of LANGUAGES) {
      const text = translate(language, 'heatmap.rowSummary', {
        recorded: 24,
        total: 30,
        missing: 6,
      });
      for (const value of ['24', '30', '6']) expect(text).toContain(value);
    }
  });
});

describe('the chart label, which replaces the shape', () => {
  it('carries the range, the direction and the values it plotted', () => {
    for (const language of LANGUAGES) {
      const text = translate(language, 'progress.chartLabel', {
        days: 30,
        direction: translate(language, 'progress.rising'),
        from: 412,
        to: 642,
        min: 400,
        max: 700,
      });
      for (const value of ['30', '412', '642', '400', '700']) expect(text).toContain(value);
      expect(text).toContain(translate(language, 'progress.rising'));
    }
  });

  it('keeps the same set of facts in both languages', () => {
    const [first, ...rest] = LANGUAGES.map((language) =>
      placeholders(translate(language, 'progress.chartLabel')).sort().join(),
    );
    for (const other of rest) expect(other).toBe(first);
  });
});

describe('the values a reader hears', () => {
  it('are rounded, like the ones on screen', () => {
    // The replay produces values such as 70.8333…; announcing that verbatim
    // is thirteen spoken decimal places for a number the screen shows as 71.
    const spoken = (value: number) => `${Math.round(value)} %`;
    expect(spoken(70.83333333333333)).toBe('71 %');
    expect(spoken(0)).toBe('0 %');
    expect(summarise([70.83333333333333, 45.83333333333333]).average).toBe(58);
  });
});

describe('the bands the bar heights are coloured by', () => {
  it('puts every score in exactly one band', () => {
    for (let value = 0; value <= 100; value += 1) {
      expect(bandOf(value)).toMatch(/^(weak|mixed|good|strong)$/);
    }
  });

  it('rises with the score, so colour never contradicts height', () => {
    const order = ['weak', 'mixed', 'good', 'strong'];
    let seen = 0;
    for (let value = 0; value <= 100; value += 1) {
      const index = order.indexOf(bandOf(value));
      expect(index).toBeGreaterThanOrEqual(seen);
      seen = index;
    }
  });
});
