import { useCallback, useEffect, useState } from 'react';
import type { DomainType } from '../core/model';
import type { TabId } from './TabBar';

/**
 * Where the user is: one tab, and — on the domain terminal — one domain.
 *
 * This is the **one authoritative source** of navigation state. The tab bar,
 * the domain switch and the rendered screen all derive from it, and the URL
 * hash mirrors it, so a link can name a place (`#/progress/gym`) and the
 * browser's Back button walks the places the user actually visited.
 *
 * The hash is a mirror, not a second state: `navigate` writes the state and
 * the hash together, and a `popstate` reads the hash back into the state.
 * Nothing else touches either. Sheets, edit windows and onboarding are not
 * places and never enter the URL.
 *
 * The domain is kept in the state even while another tab is open, so coming
 * back to the terminal restores the domain that was being looked at; the
 * hash carries it only where it applies.
 */
export interface Route {
  tab: TabId;
  domain: DomainType;
}

const TABS: readonly TabId[] = ['today', 'progress', 'rank', 'areas'];
const DOMAINS: readonly DomainType[] = ['mental', 'gym', 'running', 'food'];

const isTab = (value: string): value is TabId => (TABS as readonly string[]).includes(value);
const isDomain = (value: string): value is DomainType =>
  (DOMAINS as readonly string[]).includes(value);

/** `#/progress/gym` → `{ tab: 'progress', domain: 'gym' }`; anything else → `null`. */
export function parseRoute(hash: string): Partial<Route> | null {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [tab, domain] = parts;
  if (!tab || !isTab(tab)) return null;
  if (tab === 'progress' && domain && isDomain(domain)) return { tab, domain };
  return { tab };
}

/** The hash for a route. The domain appears only where it means something. */
export function formatRoute(route: Route): string {
  return route.tab === 'progress' ? `#/${route.tab}/${route.domain}` : `#/${route.tab}`;
}

const hasWindow = typeof window !== 'undefined' && typeof window.history !== 'undefined';

function fromLocation(fallback: Route): Route {
  if (!hasWindow) return fallback;
  const parsed = parseRoute(window.location.hash);
  return parsed ? { ...fallback, ...parsed } : fallback;
}

/**
 * The route and the one way to change it.
 *
 * `replace` rewrites the current history entry instead of adding one — for a
 * correction the user did not make, such as a domain that is no longer
 * enabled being swapped for one that is. A user's own tap always pushes, so
 * Back always goes where they came from.
 */
export function useRoute(initial: Route): {
  route: Route;
  navigate(next: Partial<Route>, options?: { replace?: boolean }): void;
} {
  const [route, setRoute] = useState<Route>(() => fromLocation(initial));

  // The first render establishes the hash if the address bar had none, so
  // Back from the first place the user visits has somewhere to go.
  useEffect(() => {
    if (!hasWindow) return undefined;
    const current = formatRoute(route);
    if (window.location.hash !== current) {
      window.history.replaceState(null, '', current);
    }
    const onPop = () => {
      // A hash that names no place — typed, or left by an older build —
      // does not move the user; the screen stays and the hash is corrected
      // to it, so state and address never disagree. A fresh load of such a
      // hash falls back to Today through `fromLocation` above.
      setRoute((previous) => {
        const next = fromLocation(previous);
        const hash = formatRoute(next);
        if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
        return next;
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // Only on mount: later hashes are written by `navigate` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((next: Partial<Route>, options?: { replace?: boolean }) => {
    setRoute((previous) => {
      const merged = { ...previous, ...next };
      if (hasWindow) {
        const hash = formatRoute(merged);
        if (window.location.hash !== hash) {
          if (options?.replace) window.history.replaceState(null, '', hash);
          else window.history.pushState(null, '', hash);
        }
      }
      return merged;
    });
  }, []);

  return { route, navigate };
}
