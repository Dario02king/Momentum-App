import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');

/**
 * The 3D body's isolation harness, on the dev server only. The condition is
 * a build-time constant, so a production bundle carries neither the branch
 * nor the page — `#/dev/body` is not a route the app knows.
 */
const DevBody =
  import.meta.env.DEV && window.location.hash.startsWith('#/dev/body')
    ? lazy(() => import('./features/body/BodyDevPage').then((m) => ({ default: m.BodyDevPage })))
    : null;

createRoot(container).render(
  <StrictMode>
    {DevBody ? (
      <Suspense fallback={null}>
        <DevBody />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
