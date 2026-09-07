import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../core/clock';
import {
  DB_NAME,
  DB_VERSION,
  StorageError,
  closeDatabase,
  deleteDatabase,
  isStorageAvailable,
  openDatabase,
  runTransaction,
  STORES,
} from './db';
import { answersRepository, questionsRepository, settingsRepository } from './repositories';
import { applyOnboarding } from './services/configurationService';
import { saveAnswer } from './services/checkInService';

function freezeAt(day: string, hour = 9): void {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  setClock({ now: () => new Date(y, m - 1, d, hour, 0, 0) });
}

beforeEach(async () => {
  await deleteDatabase();
  freezeAt('2025-01-06');
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

describe('when storage is not available at all', () => {
  it('reports it as such rather than throwing something opaque', async () => {
    const real = globalThis.indexedDB;
    // Some browsers refuse IndexedDB entirely in private mode.
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;
    try {
      expect(isStorageAvailable()).toBe(false);
      await expect(openDatabase()).rejects.toBeInstanceOf(StorageError);
      await expect(openDatabase()).rejects.toMatchObject({ reason: 'unavailable' });
    } finally {
      (globalThis as { indexedDB?: unknown }).indexedDB = real;
      await closeDatabase();
    }
  });

  it('surfaces the same failure through a repository', async () => {
    const real = globalThis.indexedDB;
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;
    try {
      await expect(settingsRepository.getOrCreate()).rejects.toMatchObject({
        reason: 'unavailable',
      });
    } finally {
      (globalThis as { indexedDB?: unknown }).indexedDB = real;
      await closeDatabase();
    }
  });
});

describe('when the stored data is newer than the app', () => {
  it('says so instead of failing blankly', async () => {
    // An older tab left open after an update sees exactly this.
    await closeDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION + 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('future', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    await expect(openDatabase()).rejects.toMatchObject({ reason: 'newerData' });
    await closeDatabase();
  });
});

describe('reopening an existing database', () => {
  it('keeps every record across a close and reopen', async () => {
    await applyOnboarding({
      questions: [{ text: 'A', type: 'boolean' }],
      sportsTargetPerWeek: 3,
    });
    const question = (await questionsRepository.listActive())[0]!;
    await saveAnswer('2025-01-06', question.id, true);

    await closeDatabase();

    // The upgrade path a shipped build takes on every launch: same version,
    // existing data, no migration to run.
    const db = await openDatabase();
    expect(db.version).toBe(DB_VERSION);
    expect(await answersRepository.getAll()).toHaveLength(1);
    expect((await questionsRepository.listActive())[0]?.text).toBe('A');
    expect((await settingsRepository.get())?.firstUseDate).toBe('2025-01-06');
  });
});

describe('when a write fails', () => {
  it('rejects rather than reporting a success that did not happen', async () => {
    await applyOnboarding({ questions: [], sportsTargetPerWeek: null });

    // A value that cannot be stored: the write fails inside the transaction.
    const unstorable = { id: 'broken', cycle: () => undefined } as unknown as never;
    await expect(
      runTransaction([STORES.domains], 'readwrite', (tx) => {
        tx.objectStore(STORES.domains).put(unstorable);
      }),
    ).rejects.toBeTruthy();

    // And nothing was left behind by the failed attempt.
    const domains = await runTransaction([STORES.domains], 'readonly', (tx) =>
      new Promise<unknown[]>((resolve) => {
        const request = tx.objectStore(STORES.domains).getAll();
        request.onsuccess = () => resolve(request.result);
      }),
    );
    expect(domains).toEqual([]);
  });

  it('rolls the whole transaction back, not only the failing write', async () => {
    await applyOnboarding({ questions: [], sportsTargetPerWeek: null });
    const stamp = new Date().toISOString();
    const good = {
      id: 'dom-good',
      type: 'mental',
      enabled: true,
      order: 0,
      settings: {},
      createdAt: stamp,
      updatedAt: stamp,
    };

    await expect(
      runTransaction([STORES.domains], 'readwrite', (tx) => {
        const store = tx.objectStore(STORES.domains);
        store.put(good);
        store.put({ id: 'dom-bad', boom: () => undefined } as unknown as never);
      }),
    ).rejects.toBeTruthy();

    // The good write in the same transaction is gone too — which is what
    // makes an import all-or-nothing.
    const domains = await runTransaction([STORES.domains], 'readonly', (tx) =>
      new Promise<unknown[]>((resolve) => {
        const request = tx.objectStore(STORES.domains).getAll();
        request.onsuccess = () => resolve(request.result);
      }),
    );
    expect(domains).toEqual([]);
  });
});
