/**
 * Registering the service worker, and making an update visible.
 *
 * The trap this avoids is the one §4 names: an installed PWA on static
 * hosting keeps serving an old build after a deploy and the user has no way
 * to tell. So a waiting worker is surfaced as a prompt, the reload happens
 * only when the user asks for it, and it happens exactly once.
 */

export interface UpdateHandle {
  /** Applies the waiting version and reloads. */
  apply(): void;
}

/** Guards against a reload loop if `controllerchange` fires more than once. */
let reloading = false;

export function registerServiceWorker(onUpdateReady: (handle: UpdateHandle) => void): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const applyFrom = (registration: ServiceWorkerRegistration) => () => {
    const waiting = registration.waiting;
    if (!waiting) return;
    // Reload only once, and only because the user asked.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  const start = () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((registration) => {
        // A version installed on a previous visit and never accepted.
        if (registration.waiting && navigator.serviceWorker.controller) {
          onUpdateReady({ apply: applyFrom(registration) });
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // `controller` is null on the very first install; that is not an
            // update and must not prompt.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              onUpdateReady({ apply: applyFrom(registration) });
            }
          });
        });

        // Check again when the app is brought back to the foreground, which
        // is when a long-installed PWA would otherwise never notice a deploy.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update();
        });
      })
      .catch(() => {
        // Offline, or the worker is unavailable. The app still runs from
        // whatever is already cached; nothing here is required for it.
      });
  };

  /*
   * This runs from a React effect, which is usually *after* the window load
   * event has already fired — so waiting for that event unconditionally
   * means never registering at all. Registration is deferred only when the
   * page is genuinely still loading, so it never competes with first paint.
   */
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
