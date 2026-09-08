import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS } from '../../core/model';
import { translate } from '../../i18n';
import { I18nProvider } from '../../i18n/I18nProvider';
import { BodyRenderer, MUSCLE_LABEL_KEYS, MUSCLE_STATE_KEYS, type MuscleView } from './index';

const render = (node: React.ReactNode, language: 'de' | 'en' = 'de') =>
  renderToStaticMarkup(
    <I18nProvider language={language} setLanguage={() => undefined}>
      {node}
    </I18nProvider>,
  );

const views = (overrides: Partial<Record<string, MuscleView['state']>> = {}): MuscleView[] =>
  MUSCLE_GROUPS.map((muscle) => ({ muscle, state: overrides[muscle] ?? 'noData' }));

/**
 * The body figure is a picture of a table. Everything asserted here is about
 * the table, because the table is the version that can be read.
 */

describe('what the body renderer says', () => {
  it('lists every muscle group, whatever its state', () => {
    const html = render(<BodyRenderer muscles={views()} />);
    for (const muscle of MUSCLE_GROUPS) {
      expect(html).toContain(translate('de', MUSCLE_LABEL_KEYS[muscle]));
    }
  });

  it('states each one in words, never in colour alone', () => {
    const html = render(
      <BodyRenderer
        muscles={views({ chest: 'improved', quadriceps: 'declined', core: 'awaitingBaseline' })}
      />,
    );
    expect(html).toContain(translate('de', MUSCLE_STATE_KEYS.improved));
    expect(html).toContain(translate('de', MUSCLE_STATE_KEYS.declined));
    expect(html).toContain(translate('de', MUSCLE_STATE_KEYS.awaitingBaseline));
    expect(html).toContain(translate('de', MUSCLE_STATE_KEYS.noData));
  });

  it('tells an untrained group apart from one that got worse', () => {
    // The two things a single grey would conflate.
    const html = render(<BodyRenderer muscles={views({ chest: 'declined' })} />);
    expect(html).toContain('body-renderer__muscle--declined');
    expect(html).toContain('body-renderer__muscle--noData');
    expect(translate('de', MUSCLE_STATE_KEYS.noData)).not.toBe(
      translate('de', MUSCLE_STATE_KEYS.declined),
    );
  });

  it('shows a value beside the state when it has one', () => {
    const html = render(
      <BodyRenderer muscles={[{ muscle: 'chest', state: 'improved', detail: '+12 %' }]} />,
    );
    expect(html).toContain('+12 %');
  });

  it('keeps the figures out of the accessibility tree', () => {
    // Ten paths announced twice would say what the list says, at length.
    const html = render(<BodyRenderer muscles={views()} />);
    const figures = html.match(/<svg[^>]*>/g) ?? [];
    expect(figures).toHaveLength(2);
    expect(figures.every((tag) => tag.includes('aria-hidden="true"'))).toBe(true);
  });

  it('draws one figure per side, with both showing shoulders', () => {
    const html = render(<BodyRenderer muscles={views({ shoulders: 'improved' })} />);
    // Shoulders appear on the front and on the back, both lit.
    expect(html.split('body-renderer__muscle--improved').length - 1).toBe(4);
  });
});

describe('as a control', () => {
  it('is a list of plain text until it is given something to do', () => {
    expect(render(<BodyRenderer muscles={views()} />)).not.toContain('<button');
  });

  it('names every button after its muscle group when it is interactive', () => {
    const html = render(<BodyRenderer muscles={views()} onSelect={() => undefined} />);
    expect(html.split('<button').length - 1).toBe(MUSCLE_GROUPS.length);
    expect(html).toContain(translate('de', MUSCLE_LABEL_KEYS.hamstringsGlutes));
  });

  it('marks the selected group as pressed, and outlines it', () => {
    const html = render(
      <BodyRenderer muscles={views()} selected="chest" onSelect={() => undefined} />,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('body-renderer__muscle--selected');
  });

  it('works in both languages', () => {
    for (const language of ['de', 'en'] as const) {
      const html = render(<BodyRenderer muscles={views({ chest: 'improved' })} />, language);
      expect(html).toContain(translate(language, MUSCLE_STATE_KEYS.improved));
      expect(html).toContain(translate(language, MUSCLE_LABEL_KEYS.chest));
    }
  });
});
