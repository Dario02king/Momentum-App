import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Deployed to GitHub Pages under https://<user>.github.io/Momentum-App/
export default defineConfig({
  base: '/Momentum-App/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
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
