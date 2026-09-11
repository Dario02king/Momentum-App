import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

/**
 * Generates the service worker with the real list of built files.
 *
 * A hand-maintained precache list drifts the first time a filename changes,
 * and the symptom — an installed app serving half an old build — is exactly
 * what §4 warns about. Taking the list from the bundle removes the
 * possibility.
 */
function serviceWorkerPlugin(): Plugin {
  // The resolved base, so the same list is right for the production site
  // (/Momentum-App/) and for a preview build passed a different --base.
  // Hardcoding it here once precached the production paths into a preview
  // build's worker.
  let base = '/';
  return {
    name: 'momentum-service-worker',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((name) => !name.endsWith('.map'))
        .map((name) => `${base}${name}`);
      // The shell and everything it needs on a cold, offline launch.
      const precache = Array.from(
        new Set([
          base,
          `${base}index.html`,
          `${base}manifest.webmanifest`,
          `${base}icon-192.png`,
          `${base}icon-512.png`,
          `${base}apple-touch-icon.png`,
          // The body model is fetched by URL, not bundled, so it is listed
          // here by hand like the icons. Without it the Gym muscle map would
          // be the one thing in the app that needs a network.
          `${base}models/momentum-body.glb`,
          ...assets,
        ]),
      );

      const template = readFileSync(
        fileURLToPath(new URL('./src/sw/serviceWorker.js', import.meta.url)),
        'utf8',
      );
      // The cache name changes with the build, so activating a new version
      // cannot leave a mix of old and new assets behind.
      const revision = Object.keys(bundle)
        .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
        .sort()
        .join('|');

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__PRECACHE__', JSON.stringify(precache, null, 2))
          .replace('__REVISION__', JSON.stringify(revision))
          .replace('__SHELL__', JSON.stringify(`${base}index.html`)),
      });
    },
  };
}

// Deployed to GitHub Pages under https://<user>.github.io/Momentum-App/
export default defineConfig({
  base: '/Momentum-App/',
  plugins: [react(), serviceWorkerPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    /*
     * TypeScript before JavaScript.
     *
     * Vite's default order resolves `./useDay` to a `useDay.js` sitting next
     * to `useDay.ts` — so a stray build artefact in `src/` silently shadows
     * the source it was compiled from, and the bundle stops matching the
     * repository. The `typecheck` script used to emit exactly those files.
     * That is fixed at the source, and this makes it unable to happen again.
     */
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  // Test time zones and file selection are defined per project in
  // vitest.workspace.ts — date logic is proved in more than one zone.
  test: {
    environment: 'node',
  },
});
