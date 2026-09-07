import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { closeDatabase, deleteDatabase } from '../db';
import { answersRepository, gymSessionsRepository } from '../repositories';
import { addQuestion, applyOnboarding, archiveQuestion, pauseQuestion } from './configurationService';
import {
  EditWindowError,
  InvalidAnswerError,
  clearAnswer,
  deleteSession,
  loadDay,
  logSession,
  saveAnswer,
  updateSession,
} from './checkInService';

function freezeAt(day: string, hour = 9): void {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  setClock({ now: () => new Date(y, m - 1, d, hour, 0, 0) });
}

// Monday 31 March 2025. The preceding week ran 24–30 March.
const TODAY = '2025-03-31';

beforeEach(async () => {
  await deleteDatabase();
  freezeAt(TODAY);
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

async function setup() {
  await applyOnboarding({
    questions: [
      { text: 'Hast du dein Bett gemacht?', type: 'boolean', category: 'eigene' },
      { text: 'Wie gut hast du geschlafen?', type: 'scale', category: 'eigene' },
    ],
    gymTargetPerWeek: 3,
  });
  const day = await loadDay();
  return {
    boolQuestion: day.mental!.items[0]!.question,
    scaleQuestion: day.mental!.items[1]!.question,
  };
}

describe('what is due today', () => {
  it('lists every active question, unanswered', async () => {
    await setup();
    const day = await loadDay();
    expect(day.mental?.items).toHaveLength(2);
    expect(day.mental?.items.every((item) => item.answer === null)).toBe(true);
    expect(day.mental?.answeredCount).toBe(0);
    expect(day.mental?.complete).toBe(false);
    expect(day.empty).toBe(false);
  });

  it('drops paused and archived questions from the day', async () => {
    const { boolQuestion, scaleQuestion } = await setup();
    await pauseQuestion(boolQuestion.id);
    await archiveQuestion(scaleQuestion.id);
    const day = await loadDay();
    expect(day.mental?.items).toEqual([]);
  });

  it('reports a domain that is off as absent, not as empty', async () => {
    await applyOnboarding({ questions: [], gymTargetPerWeek: null });
    const day = await loadDay();
    // Nothing is tracked at all — which is different from nothing being due.
    expect(day.mental).toBeNull();
    expect(day.training).toEqual([]);
    expect(day.empty).toBe(true);
  });

  it('reports the day complete once every question is answered', async () => {
    const { boolQuestion, scaleQuestion } = await setup();
    await saveAnswer(TODAY, boolQuestion.id, true);
    expect((await loadDay()).mental?.complete).toBe(false);
    await saveAnswer(TODAY, scaleQuestion.id, 8);
    const day = await loadDay();
    expect(day.mental?.answeredCount).toBe(2);
    expect(day.mental?.complete).toBe(true);
  });

  it('a question added today is due today', async () => {
    await setup();
    await addQuestion({ text: 'Neu', type: 'boolean', category: 'eigene' });
    expect((await loadDay()).mental?.items).toHaveLength(3);
  });
});

describe('answering', () => {
  it('saves a yes/no answer on tap', async () => {
    const { boolQuestion } = await setup();
    await saveAnswer(TODAY, boolQuestion.id, true);
    const day = await loadDay();
    expect(day.mental?.items[0]?.answer?.value).toBe(true);
  });

  it('saves a scale answer', async () => {
    const { scaleQuestion } = await setup();
    await saveAnswer(TODAY, scaleQuestion.id, 7);
    expect((await loadDay()).mental?.items[1]?.answer?.value).toBe(7);
  });

  it('replaces rather than stacks when an answer is corrected', async () => {
    const { scaleQuestion } = await setup();
    await saveAnswer(TODAY, scaleQuestion.id, 3);
    await saveAnswer(TODAY, scaleQuestion.id, 9);
    const answers = await answersRepository.listByQuestion(scaleQuestion.id);
    expect(answers).toHaveLength(1);
    expect(answers[0]?.value).toBe(9);
  });

  it('keeps the answer when the same value is chosen again', async () => {
    const { boolQuestion, scaleQuestion } = await setup();
    await saveAnswer(TODAY, boolQuestion.id, true);
    await saveAnswer(TODAY, boolQuestion.id, true);
    await saveAnswer(TODAY, scaleQuestion.id, 7);
    await saveAnswer(TODAY, scaleQuestion.id, 7);

    // Selecting an option is never a toggle: a second tap must not remove
    // the answer, and must not create a second record either.
    expect((await answersRepository.get(TODAY, boolQuestion.id))?.value).toBe(true);
    expect(await answersRepository.listByQuestion(boolQuestion.id)).toHaveLength(1);
    expect((await answersRepository.get(TODAY, scaleQuestion.id))?.value).toBe(7);
    expect((await loadDay()).mental?.answeredCount).toBe(2);
  });

  it('removes an answer only through an explicit clear', async () => {
    const { boolQuestion } = await setup();
    await saveAnswer(TODAY, boolQuestion.id, false);
    expect((await loadDay()).mental?.answeredCount).toBe(1);

    await clearAnswer(TODAY, boolQuestion.id);
    // Unanswered again — which is a different thing from having answered "no".
    expect(await answersRepository.get(TODAY, boolQuestion.id)).toBeUndefined();
    expect((await loadDay()).mental?.answeredCount).toBe(0);
  });

  it('rejects a value that does not match the question type', async () => {
    const { boolQuestion, scaleQuestion } = await setup();
    await expect(saveAnswer(TODAY, boolQuestion.id, 5)).rejects.toThrow(InvalidAnswerError);
    await expect(saveAnswer(TODAY, scaleQuestion.id, true)).rejects.toThrow(InvalidAnswerError);
    await expect(saveAnswer(TODAY, scaleQuestion.id, 0)).rejects.toThrow(InvalidAnswerError);
    await expect(saveAnswer(TODAY, scaleQuestion.id, 11)).rejects.toThrow(InvalidAnswerError);
    await expect(saveAnswer(TODAY, scaleQuestion.id, 7.5)).rejects.toThrow(InvalidAnswerError);
  });
});

describe('the three-day edit window', () => {
  it('accepts today and the three preceding days', async () => {
    const { boolQuestion } = await setup();
    for (const date of ['2025-03-31', '2025-03-30', '2025-03-29', '2025-03-28']) {
      await saveAnswer(date, boolQuestion.id, true);
      expect((await answersRepository.get(date, boolQuestion.id))?.value).toBe(true);
    }
  });

  it('refuses the fourth preceding day', async () => {
    const { boolQuestion } = await setup();
    await expect(saveAnswer('2025-03-27', boolQuestion.id, true)).rejects.toThrow(EditWindowError);
    expect(await answersRepository.get('2025-03-27', boolQuestion.id)).toBeUndefined();
  });

  it('refuses a future day', async () => {
    const { boolQuestion } = await setup();
    await expect(saveAnswer('2025-04-01', boolQuestion.id, true)).rejects.toThrow(EditWindowError);
  });

  it('refuses to clear an answer on a closed day', async () => {
    const { boolQuestion } = await setup();
    await saveAnswer('2025-03-28', boolQuestion.id, true);
    // Two days later that day has closed and the record is final.
    freezeAt('2025-04-02');
    await expect(clearAnswer('2025-03-28', boolQuestion.id)).rejects.toThrow(EditWindowError);
    expect(await answersRepository.get('2025-03-28', boolQuestion.id)).toBeDefined();
  });

  it('reports the state of a day it will not let you edit', async () => {
    await setup();
    const closed = await loadDay('2025-03-20');
    expect(closed.editState).toBe('closed');
    expect(closed.editable).toBe(false);

    const open = await loadDay('2025-03-29');
    expect(open.editState).toBe('open');
    expect(open.editable).toBe(true);
  });

  it('closes a day as the window rolls forward, without touching its data', async () => {
    const { boolQuestion } = await setup();
    await saveAnswer('2025-03-30', boolQuestion.id, true);
    expect((await loadDay('2025-03-30')).editable).toBe(true);

    freezeAt('2025-04-03');
    const day = await loadDay('2025-03-30');
    expect(day.editable).toBe(false);
    expect(day.mental?.items[0]?.answer?.value).toBe(true);
  });
});

describe('training sessions', () => {
  it('counts this week towards the target', async () => {
    await setup();
    await logSession('gym', TODAY);
    await logSession('gym', TODAY);
    const day = await loadDay();
    expect(day.training[0]?.progress.completed).toBe(2);
    expect(day.training[0]?.progress.target).toBe(3);
    expect(day.training[0]?.progress.remaining).toBe(1);
    expect(day.training[0]?.progress.met).toBe(false);
  });

  it('allows several sessions on one day', async () => {
    await setup();
    await logSession('gym', TODAY);
    await logSession('gym', TODAY);
    expect((await loadDay())?.training[0]?.sessionsToday).toHaveLength(2);
  });

  it('does not count last week towards this week', async () => {
    await setup();
    // Sunday 30 March belongs to the previous Monday-to-Sunday week.
    freezeAt('2025-03-30');
    await logSession('gym', '2025-03-30');
    freezeAt(TODAY);
    const day = await loadDay();
    expect(day.training[0]?.progress.completed).toBe(0);
    expect((await gymSessionsRepository.getAll())).toHaveLength(1);
  });

  it('adds a note to a session after logging it', async () => {
    await setup();
    const session = await logSession('gym', TODAY);
    await updateSession('gym', session.id, { note: 'Kurz', durationMinutes: 30 });
    const updated = await gymSessionsRepository.get(session.id);
    expect(updated?.note).toBe('Kurz');
  });

  it('deletes a session within its own week', async () => {
    await setup();
    const session = await logSession('gym', TODAY);
    await deleteSession('gym', session.id);
    expect((await loadDay())?.training[0]?.progress.completed).toBe(0);
  });

  it('moves a session to the day it actually happened, within its week', async () => {
    await setup();
    // Logged on Wednesday, but the run was on Monday.
    freezeAt('2025-04-02');
    const session = await logSession('gym', '2025-04-02');
    await updateSession('gym', session.id, { date: '2025-03-31', note: 'Laufen' });

    const moved = await gymSessionsRepository.get(session.id);
    expect(moved?.date).toBe('2025-03-31');
    expect(moved?.weekKey).toBe('2025-W14');
    // Still one session in the same week, counted once.
    expect((await loadDay('2025-04-02'))?.training[0]?.progress.completed).toBe(1);
  });

  it('refuses to move a session out of its week', async () => {
    await setup();
    const session = await logSession('gym', TODAY);
    // Sunday 30 March belongs to the previous week.
    await expect(updateSession('gym', session.id, { date: '2025-03-30' })).rejects.toThrow(
      EditWindowError,
    );
    expect((await gymSessionsRepository.get(session.id))?.date).toBe(TODAY);
  });

  it('refuses to change a session once its week has passed', async () => {
    await setup();
    freezeAt('2025-03-30');
    const session = await logSession('gym', '2025-03-30');

    freezeAt(TODAY);
    await expect(deleteSession('gym', session.id)).rejects.toThrow(EditWindowError);
    await expect(updateSession('gym', session.id, { note: 'zu spät' })).rejects.toThrow(EditWindowError);
    expect(await gymSessionsRepository.get(session.id)).toBeDefined();
  });

  it('refuses to log a session into a past week', async () => {
    await setup();
    await expect(logSession('gym', '2025-03-30')).rejects.toThrow(EditWindowError);
  });

  it('refuses to log when sports is not enabled', async () => {
    await applyOnboarding({ questions: [], gymTargetPerWeek: null });
    await expect(logSession('gym', TODAY)).rejects.toThrow(InvalidAnswerError);
  });

  it('meets the target and does not overcount beyond it', async () => {
    await setup();
    for (let i = 0; i < 4; i += 1) await logSession('gym', TODAY);
    const day = await loadDay();
    expect(day.training[0]?.progress.met).toBe(true);
    expect(day.training[0]?.progress.exceeded).toBe(true);
    expect(day.training[0]?.progress.score).toBe(100);
  });
});
