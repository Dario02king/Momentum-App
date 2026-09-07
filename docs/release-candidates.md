# Momentum V1 — release candidates

A candidate is superseded the moment application code changes, so the build
under test always has its own number. The history below is kept as it
happened; RC1 is not rewritten to pretend its defect never existed.

| | Application commit | Status |
|---|---|---|
| **RC2** | **`c3e8b7f`** | **Current. This is the build to test.** |
| RC1 | `ae8b479` | Superseded — never deployed, never tested on a device |

Neither is a release. Nothing here should be read as a statement that
Momentum has shipped.

---

## RC2 — `c3e8b7f`

The build under test. It is RC1 plus one application change.

### What changed from RC1

`runTransaction` created a promise for the transaction commit and then
abandoned it whenever the transaction body threw: aborting the transaction
rejects that promise, and by then nothing was listening. The result was an
unhandled promise rejection — noise in a browser, and a non-zero exit from
the test runner even though all 352 tests passed.

That is why RC1 was never deployable: the deploy workflow runs `npm run test`
as a gate, and the gate failed on a suite that printed a green summary. It was
found by the first CI run rather than locally, because reading a test
summary is not the same as reading an exit code.

Six lines in `src/storage/db.ts`. No product, visual, copy or accessibility
behaviour differs between RC1 and RC2.

### Verified at RC2

- `tsc -b` clean; 352 tests across 23 files passing; **`npm run test` exits 0**
- Production build clean; no compiled JavaScript beside its TypeScript source
- The transaction-heavy suites re-run against the rebuilt bundle: backup, PWA
  and offline 31/31; §25 acceptance scenarios 26/26

## RC1 — `ae8b479`

The build frozen at the close of stage 8, superseded before it ever reached a
device. Kept here because the release rule depends on it: RC1 is the baseline
RC2 is measured against, and the defect it carried is the reason the numbering
moved.

---

## What is frozen

Stages 1–8 are complete and closed. The behaviour, the product decisions
recorded in [`decisions.md`](decisions.md), and the visual design are frozen.
Changes from here are limited to defects found during real-device validation,
classified by the scale in [`device-tests.md`](device-tests.md).

| # | Stage | Status |
|---|---|---|
| 1 | Project setup, storage, schema v1, date and week logic | complete |
| 2 | Onboarding, domain and question configuration | complete |
| 3 | Today screen and daily check-in | complete |
| 4 | Progress screen: heatmap and trend curve | complete |
| 5 | Rating engine, rank ladder, rank badges | complete |
| 6 | Sports domain: weekly target tracking | complete |
| 7 | Backup export/import, PWA behaviour, service-worker updates | complete |
| 8 | Product review: §25 acceptance, copy, §6 design conformance | complete |

## Outstanding before RC2 can be promoted

1. **Real-device validation on iPhone and, if available, iPad.** No part of
   the app has run on iOS hardware. Safari's PWA behaviour, the installed
   standalone shell, safe areas around the Dynamic Island and home indicator,
   the on-screen keyboard, and real touch ergonomics are all unproven.
2. **Real screen-reader validation.** VoiceOver has never been run against
   the app. What was verified is the layer VoiceOver consumes — the computed
   accessibility tree, accessible names and descriptions, roles, table
   semantics and focus order — not VoiceOver itself.

## Known non-blocking limitations

| # | Limitation | Why it is not a blocker |
|---|---|---|
| 1 | Screen-reader behaviour is inferred from the accessibility tree, not observed | The semantics beneath it are verified; this is what device validation is for |
| 2 | The type scale is fixed in px, so browser and OS text-size settings do not reflow the interface | Text enlargement works through zoom, which is no longer blocked (D62). Moving the scale to relative units is a V2 change |
| 3 | Layout viewports below roughly 200px wide can push onboarding content under the footer | Not reproducible at any phone viewport; it models a desktop browser zoomed to 200% in a sub-400px window |
| 4 | 14 unused strings remain in the i18n catalogues | Invisible to users; deleting them changes nothing |
| 5 | Backup counts have no singular form — a one-answer backup reads "1 Antworten" | A transient status line in a rare edge case |
| 6 | No Apple HIG reference was available in the build environment | §6 requires this be stated rather than invented; the conformance review used §6's own rules |

## Deployment

Published to GitHub Pages by [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml),
which runs typecheck, tests and the production build before publishing. The
Vite base path is `/Momentum-App/`, which is where a project site is served
from, so the build needs no deployment-specific configuration.

Pages must be enabled once by hand — repository → Settings → Pages → Build and
deployment → Source → **GitHub Actions**. A commit cannot set it.

**Live at <https://dario02king.github.io/Momentum-App/>**

## Two places the app deliberately departs from the specification

Both were decided by the product owner and are recorded in full:

- **D13** replaces §6's "dark interface only in version 1" with a single
  light theme.
- **D16** gives the rank badge its own dark hero surface inside that light
  screen.
