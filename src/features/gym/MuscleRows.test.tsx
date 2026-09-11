import { describe, expect, it } from 'vitest';
import { de } from '../../i18n/de';
import { en } from '../../i18n/en';
import type { Translator } from '../../i18n';
import { lastTrainedText } from './MuscleRows';

const translator = (catalogue: typeof de): Translator =>
  ((key, params) => {
    const text = catalogue[key as keyof typeof de] as string;
    return params ? text.replace(/\{(\w+)\}/g, (_, name) => String(params[name])) : text;
  }) as Translator;

/**
 * Recency is a difference of two local calendar days, never a conversion of
 * a moment: a session logged at 23:29 carries that day's key and reads as
 * "heute" on the day it happened.
 */
describe('lastTrainedText', () => {
  const t = translator(de);

  it('says today, yesterday, or how many days ago', () => {
    expect(lastTrainedText('2026-06-15', '2026-06-15', t)).toBe('Heute');
    expect(lastTrainedText('2026-06-14', '2026-06-15', t)).toBe('Gestern');
    expect(lastTrainedText('2026-06-13', '2026-06-15', t)).toBe('Vor 2 Tagen');
    expect(lastTrainedText('2026-05-15', '2026-06-15', t)).toBe('Vor 31 Tagen');
  });

  it('says nothing where nothing was trained', () => {
    expect(lastTrainedText(null, '2026-06-15', t)).toBeNull();
  });

  it('crosses a month, a year and the March clock change without drifting', () => {
    expect(lastTrainedText('2025-12-31', '2026-01-01', t)).toBe('Gestern');
    expect(lastTrainedText('2026-03-28', '2026-03-29', t)).toBe('Gestern');
    expect(lastTrainedText('2026-02-28', '2026-03-01', t)).toBe('Gestern');
  });

  it('reads in English too', () => {
    const e = translator(en as typeof de);
    expect(lastTrainedText('2026-06-15', '2026-06-15', e)).toBe('Today');
    expect(lastTrainedText('2026-06-12', '2026-06-15', e)).toBe('3 days ago');
  });
});
