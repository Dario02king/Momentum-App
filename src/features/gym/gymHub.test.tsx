import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { de } from '../../i18n/de';
import { MUSCLE_GROUPS } from '../../core/model';
import { exerciseDays, gymPerformance, gymPerformanceOverSpan, latestComparisons } from '../../core/gym/performance';
import type { GymHistory } from '../../storage/services/gymService';
import { MuscleEntryCard } from './MuscleEntryCard';

/**
 * The Gym hub's door to the muscle groups (WP2-2): what it says before the
 * first workout, what it says after, and what it never loads.
 */

const render = (history: GymHistory | null) =>
  renderToStaticMarkup(
    <I18nProvider language="de" setLanguage={() => undefined}>
      <MuscleEntryCard history={history} rangeDays={30} onOpen={() => undefined} />
    </I18nProvider>,
  );

const emptyHistory = (): GymHistory => {
  const days = exerciseDays([]);
  return {
    days,
    comparisons: latestComparisons(days),
    recent: gymPerformance(days),
    overall: gymPerformanceOverSpan(days),
    names: new Map(),
    awaitingBodyweight: [],
  };
};

describe('the muscle entry card before the first workout', () => {
  it('is one named button that says there is no data, and colours nothing as progress', () => {
    for (const html of [render(null), render(emptyHistory())]) {
      expect(html).toMatch(/<button[^>]*aria-label="Muskelgruppen öffnen"/);
      expect(html).toContain(de['gymHub.muscles.none']);
      expect(html).toContain(de['gymHub.muscles.noneHint']);
      // The figure is a picture, hidden from assistive technology.
      expect(html).toMatch(/<span class="gym-hub__figure" aria-hidden="true">/);
      // Every group is drawn in its no-data state; no other state exists yet.
      expect(html.match(/body-renderer__muscle--noData/g)?.length ?? 0).toBeGreaterThanOrEqual(MUSCLE_GROUPS.length);
      for (const state of ['improved', 'unchanged', 'declined', 'awaitingBaseline']) {
        expect(html, state).not.toContain(`body-renderer__muscle--${state}`);
      }
    }
  });

  it('states the counted groups and the overall change once there is history', () => {
    const days = exerciseDays([
      { date: '2026-03-02', exerciseId: 'ex_squat', muscles: ['quadriceps'], primaryMuscles: ['quadriceps'], sets: [{ id: 'a', reps: 5, weightGrams: 100000, order: 0 }] },
      { date: '2026-03-09', exerciseId: 'ex_squat', muscles: ['quadriceps'], primaryMuscles: ['quadriceps'], sets: [{ id: 'b', reps: 5, weightGrams: 110000, order: 0 }] },
    ]);
    const history: GymHistory = {
      days,
      comparisons: latestComparisons(days),
      recent: gymPerformance(days),
      overall: gymPerformanceOverSpan(days),
      names: new Map([['ex_squat', 'Back Squat']]),
      awaitingBodyweight: [],
    };
    const html = render(history);
    expect(html).toContain('1 von 10 Gruppen gewertet');
    expect(html).toContain('Gesamt +10 %');
    expect(html).toContain('Letzte 30 Tage');
    expect(html).not.toContain(de['gymHub.muscles.none']);
  });
});

describe('the hub and the lazy boundary', () => {
  it('never imports the 3D viewer: only the muscle module reaches features/body', () => {
    const here = new URL('.', import.meta.url);
    const hubFiles = ['../areas/GymTerminal.tsx', './TrainingCard.tsx', './MuscleEntryCard.tsx', './useTrainingLauncher.tsx', './GymMusclesScreen.tsx'];
    for (const file of hubFiles) {
      const source = readFileSync(new URL(file, here), 'utf8');
      expect(source, file).not.toMatch(/from '\.\.\/body|from '\.\/BodyViewer|features\/body/);
    }
    // And the one file that does goes through the lazy index, never the viewer itself.
    const module = readFileSync(new URL('./MuscleModule.tsx', here), 'utf8');
    expect(module).toMatch(/from '\.\.\/body'/);
    expect(module).not.toMatch(/body\/BodyViewer/);
  });
});
