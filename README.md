# Momentum

A mobile-first PWA that answers one question: **is my life currently moving in the
right direction?**

Everything stays on the device. No backend, no accounts, no analytics, no third-party
services. Data leaves the phone only when the user exports a backup themselves.

## Stack

- React + TypeScript + Vite
- IndexedDB behind a typed repository layer (components never touch the database)
- Deployed to GitHub Pages from a repository subpath (`base: '/Momentum-App/'`)

## Commands

```bash
npm install
npm run dev        # local development server
npm run test       # domain logic tests (two time zones, see vitest.workspace.ts)
npm run build      # typecheck + production build
```

## Build stages

The app is built in reviewed stages. Current status:

| # | Stage | Status |
|---|---|---|
| 1 | Project setup, storage abstraction, schema v1, date and week logic | done |
| 2 | Onboarding, domain and question configuration | not started |
| 3 | Today screen and daily check-in | not started |
| 4 | Progress screen: heatmap and trend curve | not started |
| 5 | Rating engine, rank ladder, rank badges | not started |
| 6 | Sports domain: weekly target tracking | not started |
| 7 | Backup export/import, PWA behaviour, service worker updates | not started |
| 8 | Product review pass and fixes | not started |

Decisions taken during the build that the specification did not settle are
recorded in [`docs/decisions.md`](docs/decisions.md).

## Architecture

```
src/
  app/        application shell and settings boot
  core/
    config/   every tunable constant, and config snapshots (§18)
    dates/    local-date and Monday-to-Sunday week logic
    model/    schema v1 record types
  i18n/       key-based string layer, German by default
  storage/    IndexedDB, migrations, typed repositories
  styles/     dark design tokens
```

Domain logic never imports from `app/` or `features/`. Storage is reached only
through `storage/repositories`.
