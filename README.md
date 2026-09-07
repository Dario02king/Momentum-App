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
npm run typecheck  # types only, no output
```

`typecheck` deliberately emits nothing. Compiled JavaScript written next to
its own source shadows it — Vite resolves `./useDay` to `useDay.js` before
`useDay.ts`, and `vite.config.js` before `vite.config.ts` — so a stray
artefact makes the bundle stop matching the repository, silently.

## Build stages

The app is built in reviewed stages. Current status:

| # | Stage | Status |
|---|---|---|
| 1 | Project setup, storage abstraction, schema v1, date and week logic | done |
| 2 | Onboarding, domain and question configuration | done |
| 3 | Today screen and daily check-in | done |
| 4 | Progress screen: heatmap and trend curve | done |
| 5 | Rating engine, rank ladder, rank badges | done |
| 6 | Sports domain: weekly target tracking | done |
| 7 | Backup export/import, PWA behaviour, service worker updates | done |
| 8 | Product review pass and fixes | done |

Stage 8 closed with a combined walkthrough of the §25 acceptance questions,
a copy review and a §6 design-conformance review against the real app.

**`c3e8b7f` is V1 Release Candidate 2** — RC1 (`ae8b479`) plus a fix for an
unhandled promise rejection in `runTransaction` that made the test suite exit
non-zero and blocked deployment. It is a candidate, not a release: it has
never run on a real device and has never been driven by a real screen reader.

[`docs/release-candidates.md`](docs/release-candidates.md) records both
candidates, what is frozen, what was verified and what is still outstanding.
[`docs/device-tests.md`](docs/device-tests.md) is the manual checklist that
closes the gap.

Decisions taken during the build that the specification did not settle are
recorded in [`docs/decisions.md`](docs/decisions.md). Two of them override
the specification at the product owner's direction: D13 replaces §6's
"dark interface only" with a single light theme, and D16 gives the rank
badge its own dark hero inside that light screen.

## Architecture

```
src/
  app/        application shell, tab bar, storage binding
  components/ shared surfaces, controls and original SVG icons
  domains/    domain-specific UI (mental questions, sports target)
  features/   onboarding, areas
  core/
    config/   every tunable constant, and config snapshots (§18)
    dates/    local-date and Monday-to-Sunday week logic
    model/    schema v1 record types
    scoring/  day and domain scoring (§11), scale bands, lifetime XP
    trends/   rolling averages, direction and annotations (§12)
    rating/   the 0-1000 rating engine (§13), replayed from history
    ranks/    the eight-rank ladder and boundary hysteresis (§15)
    streaks/  check-in and training streaks (§16)
  i18n/       key-based string layer, German by default
  storage/    IndexedDB, migrations, typed repositories, backup and restore
  sw/         the service worker template, filled in at build time
  styles/     light design tokens
```

Domain logic never imports from `app/` or `features/`. Storage is reached only
through `storage/repositories`.
