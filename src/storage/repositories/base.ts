import { runTransaction, toPromise, type StoreName } from '../db';

/**
 * The typed surface every repository is built on. React components never see
 * an object store, a cursor or a key range — only these methods, and the
 * domain-specific ones layered on top of them.
 */
export interface Repository<T> {
  get(id: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  put(record: T): Promise<T>;
  putMany(records: T[]): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  count(): Promise<number>;
  queryIndex(index: string, range?: IDBKeyRange | IDBValidKey): Promise<T[]>;
}

export function createRepository<T>(store: StoreName): Repository<T> {
  return {
    get(id) {
      return runTransaction([store], 'readonly', (tx) =>
        toPromise<T | undefined>(tx.objectStore(store).get(id)),
      );
    },
    getAll() {
      return runTransaction([store], 'readonly', (tx) =>
        toPromise<T[]>(tx.objectStore(store).getAll()),
      );
    },
    async put(record) {
      await runTransaction([store], 'readwrite', (tx) =>
        toPromise(tx.objectStore(store).put(record)),
      );
      return record;
    },
    async putMany(records) {
      if (records.length === 0) return;
      await runTransaction([store], 'readwrite', (tx) => {
        const objectStore = tx.objectStore(store);
        for (const record of records) objectStore.put(record);
      });
    },
    async remove(id) {
      await runTransaction([store], 'readwrite', (tx) =>
        toPromise(tx.objectStore(store).delete(id)),
      );
    },
    async clear() {
      await runTransaction([store], 'readwrite', (tx) =>
        toPromise(tx.objectStore(store).clear()),
      );
    },
    count() {
      return runTransaction([store], 'readonly', (tx) =>
        toPromise<number>(tx.objectStore(store).count()),
      );
    },
    queryIndex(index, range) {
      return runTransaction([store], 'readonly', (tx) =>
        toPromise<T[]>(tx.objectStore(store).index(index).getAll(range as IDBValidKey)),
      );
    },
  };
}
