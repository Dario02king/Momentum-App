import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { de } from '../../i18n/de';
import type { TrainingPlanRecord } from '../../core/model';
import { PlanEditor } from './PlanEditor';

/**
 * The plan editor's initial state (WP2-1 closeout).
 *
 * "Neuer Plan" opens an editor with nothing in it: no name, no exercises,
 * the save action not ready. Momentum pre-creates and prefills nothing —
 * Push A, Pull A, Legs, Full Body and Upper Body appear in the helper
 * sentence as examples of what a user might call a plan, and nowhere else.
 * Rendered as markup on the server side so the test reads exactly what the
 * first paint would contain, before any effect or input.
 */

const render = (plan: TrainingPlanRecord | null) =>
  renderToStaticMarkup(
    <I18nProvider language="de" setLanguage={() => undefined}>
      <PlanEditor
        plan={plan}
        slots={{ used: 0, max: 5, free: true }}
        onSave={() => undefined}
        onCancel={() => undefined}
      />
    </I18nProvider>,
  );

const inputValue = (html: string): string | null => {
  const match = html.match(/<input id="plan-name"[^>]*>/);
  if (!match) return null;
  const value = match[0].match(/ value="([^"]*)"/);
  return value ? value[1]! : '';
};

describe('the Neuer Plan editor starts empty', () => {
  const html = render(null);

  it('has an empty name field', () => {
    expect(inputValue(html)).toBe('');
  });

  it('has zero exercises and says so', () => {
    expect(html.match(/plan-editor__line/g)).toBeNull();
    expect(html).toContain(de['plans.editor.noExercises']);
  });

  it('pre-creates and prefills none of the example names', () => {
    // The names may appear once — inside the helper sentence — and nowhere
    // else: not as a value, not as a line, not as a placeholder default.
    for (const example of ['Push A', 'Pull A', 'Legs', 'Full Body', 'Upper Body']) {
      const inHint = de['plans.hint'].includes(example) ? 1 : 0;
      expect(html.split(example).length - 1, example).toBe(inHint);
    }
    expect(html).toContain(de['plans.hint']);
  });

  it('offers to add an exercise and keeps save not ready', () => {
    expect(html).toContain(de['plans.editor.add']);
    expect(html).toMatch(/<button[^>]*class="button button--primary button--block"[^>]*disabled=""/);
  });
});

describe('the editor for an existing plan', () => {
  it('starts from that plan, and only that plan', () => {
    const plan: TrainingPlanRecord = {
      id: 'plan_x',
      kind: 'userTrainingPlan',
      version: 1,
      name: 'Oberkörper',
      exercises: [
        { exerciseId: 'ex_bench_press', name: 'Bench Press', order: 0 },
        { exerciseId: 'ex_custom_1', name: 'Zercher Squat', order: 1 },
      ],
      createdAt: '2026-03-02T09:00:00.000Z',
      updatedAt: '2026-03-02T09:00:00.000Z',
    };
    const html = render(plan);
    expect(inputValue(html)).toBe('Oberkörper');
    expect(html.match(/plan-editor__line"/g)).toHaveLength(2);
    // Built-in under its German catalogue name, custom under its own.
    expect(html).toContain('Bankdrücken');
    expect(html).toContain('Zercher Squat');
    expect(html).not.toContain(de['plans.hint']);
    expect(html).not.toMatch(/<button[^>]*class="button button--primary button--block"[^>]*disabled=""/);
  });
});
