import { SCHEMA_VERSION } from '../core/model';

/**
 * The only module in Momentum that talks to IndexedDB.
 *
 * Everything above it — repositories, domain logic, React — sees typed
 * functions and never an `IDBRequest`. The schema is versioned from the first
 * commit and every future change goes in as a numbered migration, so an
 * installed PWA carrying real history can always be upgraded in place.
 */

export const DB_NAME = 'momentum';
export const DB_VERSION = SCHEMA_VERSION;

export const STORES = {
  settings: 'settings',
  domains: 'domains',
  questions: 'questions',
  answers: 'answers',
  sportsSessions: 'sportsSessions',
  configSnapshots: 'configSnapshots',
  rankEvents: 'rankEvents',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

export const ALL_STORES: StoreName[] = Object.values(STORES);

interface Migration {
  version: number;
  describe: string;
  up(db: IDBDatabase, tx: IDBTransaction): void;
}

/**
 * Migrations run in order for every version above the installed one.
 * Version 1 has nothing to migrate *from*, but the path exists so that
 * version 2 does not have to invent it under pressure.
 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    describe: 'initial schema',
    up(db) {
      db.createObjectStore(STORES.settings, { keyPath: 'id' });

      const domains = db.createObjectStore(STORES.domains, { keyPath: 'id' });
      domains.createIndex('by_type', 'type', { unique: false });

      const questions = db.createObjectStore(STORES.questions, { keyPath: 'id' });
      questions.createIndex('by_domain', 'domainId', { unique: false });
      questions.createIndex('by_status', 'status', { unique: false });

      const answers = db.createObjectStore(STORES.answers, { keyPath: 'id' });
      answers.createIndex('by_date', 'date', { unique: false });
      answers.createIndex('by_question', 'questionId', { unique: false });
      answers.createIndex('by_domain_date', ['domainId', 'date'], { unique: false });

      const sessions = db.createObjectStore(STORES.sportsSessions, { keyPath: 'id' });
      sessions.createIndex('by_date', 'date', { unique: false });
      sessions.createIndex('by_week', 'weekKey', { unique: false });

      const snapshots = db.createObjectStore(STORES.configSnapshots, { keyPath: 'id' });
      snapshots.createIndex('by_effective_from', 'effectiveFrom', { unique: false });

      const rankEvents = db.createObjectStore(STORES.rankEvents, { keyPath: 'id' });
      rankEvents.createIndex('by_date', 'date', { unique: false });
    },
  },
];

/**
 * Why storage failed, in terms the interface can act on.
 *
 * - `unavailable` — no IndexedDB at all (private mode in some browsers).
 * - `blocked`     — another tab holds an older version open.
 * - `newerData`   — the database on disk is newer than this build understands,
 *                   which happens when an older tab is opened after an update.
 * - `failed`      — everything else, including a migration that threw.
 */
export type StorageFailure = 'unavailable' | 'blocked' | 'newerData' | 'failed';

export class StorageError extends Error {
  constructor(
    readonly reason: StorageFailure,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export function isStorageAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    // Accessing the global itself can throw where site data is blocked.
    return false;
  }
}

export function toPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  if (!isStorageAvailable()) {
    dbPromise = null;
    return Promise.reject(
      new StorageError('unavailable', 'This browser will not let Momentum store data'),
    );
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      if (!tx) throw new Error('Upgrade transaction missing');
      const from = event.oldVersion;
      try {
        for (const migration of MIGRATIONS) {
          if (migration.version > from) migration.up(db, tx);
        }
      } catch (error) {
        // Abort rather than leave a half-migrated database behind; the open
        // then fails and the interface can offer a way out.
        tx.abort();
        throw new StorageError('failed', 'Momentum could not update its stored data', error);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgraded the schema: drop this handle rather than serve
      // stale structure.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      const error = request.error;
      // A database newer than this build is the update case: an old tab is
      // still open after a new version has run.
      const reason: StorageFailure = error?.name === 'VersionError' ? 'newerData' : 'failed';
      reject(
        new StorageError(
          reason,
          reason === 'newerData'
            ? 'This page is running an older version of Momentum than the stored data'
            : 'Momentum could not open its stored data',
          error,
        ),
      );
    };
    request.onblocked = () =>
      reject(
        new StorageError('blocked', 'Another open Momentum tab is holding the data'),
      );
  }).catch((error) => {
    dbPromise = null;
    throw error instanceof StorageError
      ? error
      : new StorageError('failed', 'Momentum could not open its stored data', error);
  });

  return dbPromise;
}

export async function closeDatabase(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise.catch(() => null);
  db?.close();
  dbPromise = null;
}

/** Used by import (§19) and by tests. Destroys all local data. */
export async function deleteDatabase(): Promise<void> {
  await closeDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not delete database'));
    request.onblocked = () => resolve();
  });
}

/**
 * Replaces the contents of every store in **one** transaction.
 *
 * This is what makes an import atomic: IndexedDB rolls the whole transaction
 * back if any part of it fails, so a profile is either fully replaced or
 * left exactly as it was. Clearing and writing store by store would leave a
 * half-restored profile behind the moment one write failed.
 */
export async function replaceAllStores(
  contents: Partial<Record<StoreName, unknown[]>>,
): Promise<void> {
  await runTransaction(ALL_STORES, 'readwrite', (tx) => {
    for (const store of ALL_STORES) {
      const objectStore = tx.objectStore(store);
      objectStore.clear();
      for (const record of contents[store] ?? []) objectStore.put(record);
    }
  });
}

/**
 * Runs `body` inside one transaction and resolves only once that transaction
 * has actually committed — so a caller that awaits it knows the data is
 * durable, which matters for an import that must be atomic.
 */
export async function runTransaction<T>(
  stores: StoreName[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase();
  const tx = db.transaction(stores, mode);
  const done = transactionDone(tx);
  let result: T;
  try {
    result = await body(tx);
  } catch (error) {
    // `done` is about to reject too — aborting the transaction is what makes
    // it reject — and nothing is waiting on it any more, because the error
    // from `body` is the one worth reporting. Observe it, or it surfaces as
    // an unhandled rejection: noise in the browser, and a non-zero exit from
    // the test runner even when every test passes.
    done.catch(() => undefined);
    try {
      tx.abort();
    } catch {
      // Already finished; the original error is the interesting one.
    }
    throw error;
  }
  await done;
  return result;
}
