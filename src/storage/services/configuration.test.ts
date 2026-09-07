import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { weeklyTargetIn } from '../../core/domains';
import { } from '../../core/model';
import { closeDatabase, deleteDatabase } from '../db';
import { configForDate } from '../configService';
import {
  answersRepository,
  configSnapshotsRepository,
  questionsRepository,
  settingsRepository,
} from '../repositories';
import {
  addQuestion,
  applyOnboarding,
  archiveQuestion,
  disableDomain,
  enableMental,
  loadConfiguration,
  pauseQuestion,
  resumeQuestion,
  weeklyTargetOfDomain,
  updateQuestion,
  clampWeeklyTarget,
  enableDomain,
  setWeeklyTarget,
} from './configurationService';

/**
 * The weekly-quota domain these suites exercise is Gym.
 *
 * RC2 had one generic Sport domain; iteration 2 has two independent ones, and
 * the rules under test here — the target, the week window, what a met week is
 * worth — belong to any weekly quota rather than to a particular sport. Gym
 * stands in for all of them.
 */
const enableGym = (target?: number) => enableDomain('gym', target);
const setGymTarget = (target: number) => setWeeklyTarget('gym', target);
const clampGymTarget = (target: number) => clampWeeklyTarget('gym', target);


function freezeAt(day: string, hour = 9): void {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  setClock({ now: () => new Date(y, m - 1, d, hour, 0, 0) });
}

beforeEach(async () => {
  await deleteDatabase();
  freezeAt('2025-03-31');
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

describe('onboarding', () => {
  it('persists questions, the sports target and completion in one go', async () => {
    await applyOnboarding({
      questions: [
        { text: 'Wie gut hast du geschlafen?', type: 'scale', category: 'eigene' },
        { text: 'Hast du dein Bett gemacht?', type: 'boolean', category: 'eigene' },
      ],
      gymTargetPerWeek: 3,
    });

    const configuration = await loadConfiguration();
    expect(configuration.settings.onboardingCompletedAt).not.toBeNull();
    expect(configuration.questions.map((question) => question.text)).toEqual([
      'Wie gut hast du geschlafen?',
      'Hast du dein Bett gemacht?',
    ]);
    expect(configuration.questions.map((question) => question.type)).toEqual(['scale', 'boolean']);
    expect(configuration.domains.mental?.enabled).toBe(true);
    expect(weeklyTargetOfDomain(configuration.domains.gym)).toBe(3);
  });

  it('keeps the order the questions were chosen in', async () => {
    await applyOnboarding({
      questions: [
        { text: 'Erste', type: 'boolean', category: 'eigene' },
        { text: 'Zweite', type: 'boolean', category: 'eigene' },
        { text: 'Dritte', type: 'boolean', category: 'eigene' },
      ],
      gymTargetPerWeek: null,
    });
    const configuration = await loadConfiguration();
    expect(configuration.questions.map((question) => question.text)).toEqual([
      'Erste',
      'Zweite',
      'Dritte',
    ]);
  });

  it('completes with Mental Wellbeing only', async () => {
    await applyOnboarding({
      questions: [{ text: 'Hast du dein Bett gemacht?', type: 'boolean', category: 'eigene' }],
      gymTargetPerWeek: null,
    });
    const configuration = await loadConfiguration();
    expect(configuration.domains.mental?.enabled).toBe(true);
    // Skipping sports must leave no sports domain at all: scoring then
    // excludes it rather than counting an empty domain as zero.
    expect(configuration.domains.gym).toBeNull();
    expect(configuration.settings.onboardingCompletedAt).not.toBeNull();
  });

  it('completes with Sports only', async () => {
    await applyOnboarding({ questions: [], gymTargetPerWeek: 4 });
    const configuration = await loadConfiguration();
    expect(configuration.domains.mental).toBeNull();
    expect(weeklyTargetOfDomain(configuration.domains.gym)).toBe(4);
    expect(configuration.questions).toEqual([]);
  });

  it('completes with nothing configured at all', async () => {
    await applyOnboarding({ questions: [], gymTargetPerWeek: null });
    const configuration = await loadConfiguration();
    expect(configuration.domains.mental).toBeNull();
    expect(configuration.domains.gym).toBeNull();
    expect(configuration.questions).toEqual([]);
    // The user still reaches a working app.
    expect(configuration.settings.onboardingCompletedAt).not.toBeNull();
  });

  it('does not run again after completion', async () => {
    await applyOnboarding({ questions: [], gymTargetPerWeek: null });
    const first = (await settingsRepository.get())?.onboardingCompletedAt;
    expect(first).not.toBeNull();
    const reloaded = await loadConfiguration();
    expect(reloaded.settings.onboardingCompletedAt).toBe(first);
  });
});

describe('question lifecycle', () => {
  async function withOneQuestion() {
    const question = await addQuestion({ text: 'Hast du dein Bett gemacht?', type: 'boolean', category: 'eigene' });
    const snapshot = await configSnapshotsRepository.latest();
    await answersRepository.save({
      date: '2025-03-30',
      questionId: question.id,
      domainId: question.domainId,
      value: true,
      valueType: 'boolean',
      configSnapshotId: snapshot!.id,
    });
    return question;
  }

  it('creates the Mental Wellbeing domain on the first question', async () => {
    const before = await loadConfiguration();
    expect(before.domains.mental).toBeNull();
    await addQuestion({ text: 'Neu', type: 'boolean', category: 'eigene' });
    const after = await loadConfiguration();
    expect(after.domains.mental?.enabled).toBe(true);
  });

  it('edits text and type without touching history', async () => {
    const question = await withOneQuestion();
    freezeAt('2025-04-02');
    await updateQuestion(question.id, { text: 'Neu formuliert', type: 'scale', category: 'eigene' });

    const updated = await questionsRepository.get(question.id);
    expect(updated?.text).toBe('Neu formuliert');
    expect(updated?.type).toBe('scale');

    // The answer is untouched and the old day still reads the old wording.
    const answers = await answersRepository.listByQuestion(question.id);
    expect(answers).toHaveLength(1);
    expect(answers[0]?.value).toBe(true);
    const before = await configForDate('2025-03-30');
    expect(before?.questions[0]?.text).toBe('Hast du dein Bett gemacht?');
    expect(before?.questions[0]?.type).toBe('boolean');
    const after = await configForDate('2025-04-02');
    expect(after?.questions[0]?.text).toBe('Neu formuliert');
    expect(after?.questions[0]?.type).toBe('scale');
  });

  it('pauses and resumes without losing anything', async () => {
    const question = await withOneQuestion();
    await pauseQuestion(question.id);
    expect((await questionsRepository.listActive()).map((q) => q.id)).toEqual([]);

    await resumeQuestion(question.id);
    const resumed = await questionsRepository.get(question.id);
    expect(resumed?.status).toBe('active');
    expect(resumed?.archivedAt).toBeNull();
    expect(await answersRepository.listByQuestion(question.id)).toHaveLength(1);
  });

  it('archives without deleting history', async () => {
    const question = await withOneQuestion();
    await archiveQuestion(question.id);

    const archived = await questionsRepository.get(question.id);
    expect(archived?.status).toBe('archived');
    expect(archived?.archivedAt).not.toBeNull();
    // The record and its answers both survive.
    expect(await answersRepository.listByQuestion(question.id)).toHaveLength(1);
    const configuration = await loadConfiguration();
    expect(configuration.questions).toHaveLength(1);
  });

  it('records every lifecycle change as a configuration revision', async () => {
    freezeAt('2025-03-31');
    const question = await addQuestion({ text: 'A', type: 'boolean', category: 'eigene' });
    freezeAt('2025-04-01');
    await pauseQuestion(question.id);
    freezeAt('2025-04-02');
    await archiveQuestion(question.id);

    const revisions = await configSnapshotsRepository.list();
    expect(revisions.map((revision) => revision.effectiveFrom)).toEqual([
      '2025-03-31',
      '2025-04-01',
      '2025-04-02',
    ]);
    expect((await configForDate('2025-03-31'))?.questions[0]?.status).toBe('active');
    expect((await configForDate('2025-04-01'))?.questions[0]?.status).toBe('paused');
    expect((await configForDate('2025-04-02'))?.questions[0]?.status).toBe('archived');
  });
});

describe('sports target configuration', () => {
  it('creates the domain with a target when first enabled', async () => {
    await enableGym(3);
    const configuration = await loadConfiguration();
    expect(weeklyTargetOfDomain(configuration.domains.gym)).toBe(3);
  });

  it('defaults the target when enabled without one', async () => {
    await enableGym();
    const configuration = await loadConfiguration();
    expect(weeklyTargetOfDomain(configuration.domains.gym)).toBe(3);
  });

  it('keeps the existing target when re-enabled', async () => {
    await enableGym(5);
    const configuration = await loadConfiguration();
    await disableDomain(configuration.domains.gym!.id);
    await enableGym();
    expect(weeklyTargetOfDomain((await loadConfiguration()).domains.gym)).toBe(5);
  });

  it('clamps a target to the range the picker offers', () => {
    expect(clampGymTarget(0)).toBe(1);
    expect(clampGymTarget(99)).toBe(7);
    expect(clampGymTarget(3.4)).toBe(3);
  });

  it('leaves past weeks judged by the target that was in force then', async () => {
    freezeAt('2025-01-06');
    await enableGym(3);

    freezeAt('2025-04-07');
    await setGymTarget(5);

    const january = await configForDate('2025-01-20');
    const april = await configForDate('2025-04-10');
    expect(january && weeklyTargetIn(january, 'gym')).toBe(3);
    expect(april && weeklyTargetIn(april, 'gym')).toBe(5);
  });

  it('excludes a disabled domain from scoring rather than zeroing it', async () => {
    freezeAt('2025-03-31');
    await enableGym(3);
    freezeAt('2025-04-01');
    const configuration = await loadConfiguration();
    await disableDomain(configuration.domains.gym!.id);

    expect(weeklyTargetIn((await configForDate('2025-03-31'))!, 'gym')).toBe(3);
    expect(weeklyTargetIn((await configForDate('2025-04-01'))!, 'gym')).toBeNull();
    // Disabling never deletes: the record is still there, just off.
    expect((await loadConfiguration()).domains.gym?.enabled).toBe(false);
  });
});

describe('domain switches', () => {
  it('re-enabling Mental Wellbeing keeps its questions', async () => {
    await addQuestion({ text: 'A', type: 'boolean', category: 'eigene' });
    const configuration = await loadConfiguration();
    await disableDomain(configuration.domains.mental!.id);
    expect((await loadConfiguration()).domains.mental?.enabled).toBe(false);

    await enableMental();
    const reloaded = await loadConfiguration();
    expect(reloaded.domains.mental?.enabled).toBe(true);
    expect(reloaded.questions).toHaveLength(1);
  });

  it('writes no revision when nothing scoring-relevant changed', async () => {
    await enableMental();
    const before = (await configSnapshotsRepository.list()).length;
    await enableMental();
    await enableMental();
    expect((await configSnapshotsRepository.list()).length).toBe(before);
  });

  it('writes no revision for a language change', async () => {
    await addQuestion({ text: 'A', type: 'boolean', category: 'eigene' });
    const before = (await configSnapshotsRepository.list()).length;
    freezeAt('2025-04-05');
    await settingsRepository.setLanguage('en');
    expect((await configSnapshotsRepository.list()).length).toBe(before);
  });
});
