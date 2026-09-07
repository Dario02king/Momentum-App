import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The one way a screen loads something.
 *
 * Three screens read from storage on mount, and each had grown its own
 * version of the same effect. The versions did not agree: one turned a
 * rejected load into a permanent spinner, one into a blank screen, and none
 * of them could be retried, because the load lived in an effect with no
 * dependencies and nothing else could re-run it.
 *
 * Three properties matter here and are easy to lose when this is written
 * per screen:
 *
 * **Loading, failure and emptiness are different states.** They are three
 * variants, so a screen cannot accidentally render one as another. What is
 * *empty* is the caller's business — it depends on the data — and is never
 * decided here.
 *
 * **A retry is a fresh attempt.** Every attempt takes a ticket, and a reply
 * is only accepted while its ticket is still the current one. An earlier
 * attempt that resolves late can therefore never overwrite a newer one, so
 * a retry cannot be undone by the failure it was retrying.
 *
 * **Content already on screen survives a failed refresh.** Reloading after a
 * write is not a reason to throw away what the user was reading; the view is
 * marked stale instead, and the screen decides how quietly to say so.
 */
export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'failed'; error: Error }
  /** `refreshFailed` means the value is real but no longer known to be current. */
  | { status: 'ready'; value: T; refreshFailed: boolean };

export function useLoadable<T>(load: () => Promise<T>): {
  state: Loadable<T>;
  reload: () => Promise<void>;
} {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });

  // The loader is read through a ref so `reload` keeps a stable identity.
  // Callers pass inline closures; without this, every render would be a new
  // loader, and the effect below would reload forever.
  const loadRef = useRef(load);
  loadRef.current = load;

  const attempt = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const ticket = (attempt.current += 1);
    try {
      const value = await loadRef.current();
      if (!alive.current || attempt.current !== ticket) return;
      setState({ status: 'ready', value, refreshFailed: false });
    } catch (error: unknown) {
      if (!alive.current || attempt.current !== ticket) return;
      const failure = error instanceof Error ? error : new Error(String(error));
      setState((previous) =>
        previous.status === 'ready'
          ? { ...previous, refreshFailed: true }
          : { status: 'failed', error: failure },
      );
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}
