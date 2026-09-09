import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { addDays } from '../../core/dates';
import { closeDatabase, deleteDatabase } from '../db';
import { foodDaysRepository, foodEntriesRepository } from '../repositories';
import {
  EditWindowError,
  InvalidAnswerError,
  addFoodEntry,
  clearAdherence,
  loadDay,
  removeFoodEntry,
  saveAdherence,
} from './checkInService';
import { applyOnboarding, enableDomain, setFoodFocus } from './configurationService';
import { loadHistory } from './historyService';

/**
 * Food end to end: what is written, what is replayed from it, and the two
 * promises that matter most — a rating reads back as the number the user
 * entered, and a day before Food existed is never scored as a missed one.
 */

function freezeAt(day: string, hour = 9): void {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  setClock({ now: () => new Date(y, m - 1, d, hour, 0, 0) });
}

/** A Monday. */
const START = '2026-02-02';

beforeEach(async () => {
  await deleteDatabase();
  freezeAt(START);
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

async function rate(date: string, adherence: number) {
  freezeAt(date);
  await saveAdherence(date, adherence, null, date);
}

const dayOf = async (date: string, reference = date) => {
  freezeAt(reference);
  return loadDay(date, reference);
};

const foodScoreOn = (history: Awaited<ReturnType<typeof loadHistory>>, date: string) => {
  const index = history.days.findIndex((day) => day.date === date);
  return index < 0
    ? undefined
    : history.days[index]!.domains.find((entry) => entry.domain === 'food');
};

/* ── What is stored ─────────────────────────────────────────────────────── */

describe('what a rating stores', () => {
  beforeEach(async () => {
    await applyOnboarding({ questions: [], food: true });
  });

  it('stores the number the user chose, and nothing derived from it', async () => {
    await rate(START, 7);
    const record = await foodDaysRepository.get(START);
    expect(record?.adherence).toBe(7);
    // Not a percentage, not a distance from a target, not a band.
    expect(JSON.stringify(record)).not.toContain('70');
  });

  it('rates a day once — a second rating is a correction, not a second row', async () => {
    await rate(START, 4);
    await rate(START, 9);
    const all = await foodDaysRepository.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.adherence).toBe(9);
  });

  it('refuses anything that is not a whole number from 1 to 10', async () => {
    for (const value of [0, 11, 7.5, -3]) {
      await expect(saveAdherence(START, value, null, START)).rejects.toBeInstanceOf(
        InvalidAnswerError,
      );
    }
    expect(await foodDaysRepository.getAll()).toHaveLength(0);
  });

  it('refuses a day outside the edit window, in both directions', async () => {
    const reference = addDays(START, 10);
    freezeAt(reference);
    await expect(saveAdherence(START, 8, null, reference)).rejects.toBeInstanceOf(EditWindowError);
    await expect(
      saveAdherence(addDays(reference, 1), 8, null, reference),
    ).rejects.toBeInstanceOf(EditWindowError);
  });

  it('clears a rating back to unrated, never to a bad day', async () => {
    await rate(START, 3);
    freezeAt(START);
    await clearAdherence(START, START);
    expect(await foodDaysRepository.get(START)).toBeUndefined();
    const view = await dayOf(START);
    expect(view.food?.adherence).toBeNull();
  });
});

/* ── Historical continuity ──────────────────────────────────────────────── */

describe('a rating stays readable as what the user entered', () => {
  it('reads back unchanged after a year of other configuration changes', async () => {
    await applyOnboarding({ questions: [], food: true });
    const values = [2, 5, 9, 10, 1];
    for (const [index, value] of values.entries()) {
      await rate(addDays(START, index), value);
    }

    // Everything a user could plausibly change afterwards.
    freezeAt(addDays(START, 200));
    await setFoodFocus('Mehr Gemüse');
    await enableDomain('gym', 3);
    await setFoodFocus('');

    freezeAt(addDays(START, 365));
    for (const [index, value] of values.entries()) {
      const record = await foodDaysRepository.get(addDays(START, index));
      expect(record?.adherence).toBe(value);
    }

    // And the replayed day score is still exactly that value times ten.
    const history = await loadHistory(START, addDays(START, 365), addDays(START, 365));
    for (const [index, value] of values.entries()) {
      expect(foodScoreOn(history, addDays(START, index))?.score).toBe(value * 10);
    }
  });
});

/* ── The era: a day before Food is not a missed food day ────────────────── */

describe('the day Food was switched on', () => {
  it('leaves every earlier day alone', async () => {
    await applyOnboarding({
      questions: [{ text: 'A', type: 'boolean', category: 'eigene' }],
    });
    const switchOn = addDays(START, 30);
    const reference = addDays(START, 60);

    freezeAt(switchOn);
    await enableDomain('food');
    await rate(switchOn, 8);

    freezeAt(reference);
    const history = await loadHistory(START, reference, reference);

    // Before: no food entry at all — the day was never asked.
    expect(foodScoreOn(history, START)).toBeUndefined();
    expect(foodScoreOn(history, addDays(switchOn, -1))).toBeUndefined();
    // From the day it was switched on: due, and rated.
    expect(foodScoreOn(history, switchOn)?.score).toBe(80);
    // A later day nobody rated: due, missed, and that is a real result.
    expect(foodScoreOn(history, addDays(switchOn, 5))).toEqual({
      domain: 'food',
      score: 0,
      itemsDue: 1,
      itemsAnswered: 0,
    });
  });

  it('does not score days after Food was switched off again', async () => {
    await applyOnboarding({ questions: [], food: true });
    await rate(START, 6);

    const off = addDays(START, 10);
    freezeAt(off);
    const { disableDomainType } = await import('./configurationService');
    await disableDomainType('food');

    const reference = addDays(START, 20);
    freezeAt(reference);
    const history = await loadHistory(START, reference, reference);
    expect(foodScoreOn(history, START)?.score).toBe(60);
    expect(foodScoreOn(history, addDays(off, 5))).toBeUndefined();
  });
});

/* ── The log, which is shown and never scored ───────────────────────────── */

describe('logging what was eaten', () => {
  beforeEach(async () => {
    await applyOnboarding({ questions: [], food: true });
  });

  it('adds up the day without any of it reaching the score', async () => {
    freezeAt(START);
    await addFoodEntry(
      START,
      { foodId: 'food_oats', label: 'Haferflocken', grams: 60, kcal: 223, proteinG: 8, carbsG: 35, fatG: 4 },
      START,
    );
    await addFoodEntry(
      START,
      { foodId: null, label: 'Kaffee', grams: null, kcal: 5, proteinG: null, carbsG: null, fatG: null },
      START,
    );
    await rate(START, 6);

    const view = await dayOf(START);
    expect(view.food?.totals).toEqual({ kcal: 228, proteinG: 8, carbsG: 35, fatG: 4 });

    const history = await loadHistory(START, START, START);
    // Six, not something derived from 228 kcal.
    expect(foodScoreOn(history, START)?.score).toBe(60);
  });

  it('scores a day with entries but no rating as unrated', async () => {
    freezeAt(START);
    await addFoodEntry(
      START,
      { foodId: null, label: 'Znüni', grams: null, kcal: 300, proteinG: null, carbsG: null, fatG: null },
      START,
    );
    const reference = addDays(START, 10);
    freezeAt(reference);
    const history = await loadHistory(START, reference, reference);
    // Logging food is not rating the day, and the app does not guess.
    expect(foodScoreOn(history, START)?.itemsAnswered).toBe(0);
  });

  it('refuses a nameless or negative entry', async () => {
    freezeAt(START);
    await expect(
      addFoodEntry(START, { foodId: null, label: '  ', grams: null, kcal: 10, proteinG: null, carbsG: null, fatG: null }, START),
    ).rejects.toBeInstanceOf(InvalidAnswerError);
    await expect(
      addFoodEntry(START, { foodId: null, label: 'X', grams: null, kcal: -1, proteinG: null, carbsG: null, fatG: null }, START),
    ).rejects.toBeInstanceOf(InvalidAnswerError);
  });

  it('removes an entry only from the day it is actually on', async () => {
    freezeAt(START);
    const entry = await addFoodEntry(
      START,
      { foodId: null, label: 'Znüni', grams: null, kcal: 300, proteinG: null, carbsG: null, fatG: null },
      START,
    );
    const other = addDays(START, 1);
    freezeAt(other);
    await removeFoodEntry(other, entry.id, other);
    expect(await foodEntriesRepository.get(entry.id)).toBeDefined();

    freezeAt(START);
    await removeFoodEntry(START, entry.id, START);
    expect(await foodEntriesRepository.get(entry.id)).toBeUndefined();
  });
});

/* ── Setup: the user's own words, and nothing invented ──────────────────── */

describe('what setting Food up actually sets', () => {
  it('stores a sentence, and Food scores the same with it empty', async () => {
    await applyOnboarding({ questions: [], food: true });
    await rate(START, 8);
    const before = await loadHistory(START, START, START);

    freezeAt(START);
    await setFoodFocus('  Zmittag selber kochen  ');
    const view = await dayOf(START);
    expect(view.food?.focus).toBe('Zmittag selber kochen');

    const after = await loadHistory(START, START, START);
    expect(foodScoreOn(after, START)?.score).toBe(foodScoreOn(before, START)?.score);
  });

  it('clears back to nothing, and never invents a target', async () => {
    await applyOnboarding({ questions: [], food: true });
    freezeAt(START);
    await setFoodFocus('Weniger Süsses');
    await setFoodFocus('');
    const view = await dayOf(START);
    expect(view.food?.focus).toBeNull();
    // Nothing anywhere in the day view is a calorie or macro target.
    expect(Object.keys(view.food ?? {})).toEqual([
      'adherence',
      'note',
      'focus',
      'entries',
      'totals',
    ]);
  });
});
