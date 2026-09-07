# Momentum V1 — Release Candidate 1

**RC1 is `ae8b479` on `claude/momentum-pwa-spec-j82dhm`**, plus two commits
that were required to make it testable at all and that changed no product
behaviour:

- the GitHub Pages deploy workflow — the app had never been deployed, so
  there was no address to install from;
- a fix for an unhandled promise rejection in `runTransaction`, which made
  `npm run test` exit non-zero and the deploy fail even with all 352 tests
  passing.

RC1 is a candidate, not a release. It has never run on a real device and has
never been driven by a real screen reader. Nothing below should be read as a
statement that Momentum has shipped.

## What is frozen

Stages 1–8 are complete and closed. The behaviour, the product decisions
recorded in [`decisions.md`](decisions.md), and the visual design are frozen
as of RC1. Changes from here are limited to defects found during real-device
validation, classified by the scale in
[`rc1-device-tests.md`](rc1-device-tests.md).

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

## Verified at RC1

Against a fresh clone of `ae8b479`, built clean:

- `tsc -b` clean; 352 tests across 23 files passing; production build clean
- No compiled JavaScript beside its TypeScript source, and `tsc -b` emits none
- §25 acceptance scenarios, §6 conformance, day/week boundaries, offline and
  backup behaviour, failure recovery, and accessibility semantics all pass
  under browser automation

The full evidence is in the stage 8 review; the point of RC1 validation is
everything that automation cannot reach.

## Outstanding before RC1 can be promoted

1. **Real-device validation on iPhone and, if available, iPad.** No part of
   the app has run on iOS hardware. Safari's PWA behaviour, the installed
   standalone shell, safe areas around the Dynamic Island and home indicator,
   the on-screen keyboard, and real touch ergonomics are all unproven.
2. **Real screen-reader validation.** VoiceOver has never been run against
   the app. What was verified is the layer VoiceOver consumes — Chromium's
   computed accessibility tree, accessible names and descriptions, roles,
   table semantics and focus order — not VoiceOver itself.

## Known non-blocking limitations at RC1

| # | Limitation | Why it is not a blocker |
|---|---|---|
| 1 | Screen-reader behaviour is inferred from the accessibility tree, not observed | The semantics beneath it are verified; this is what RC1 validation is for |
| 2 | The type scale is fixed in px, so browser and OS text-size settings do not reflow the interface | Text enlargement works through zoom, which is no longer blocked (D62). Moving the scale to relative units is a V2 change, not an RC fix |
| 3 | Layout viewports below roughly 200px wide can push onboarding content under the footer | Not reproducible at any phone viewport; it models a desktop browser zoomed to 200% in a sub-400px window |
| 4 | 14 unused strings remain in the i18n catalogues | Invisible to users; deleting them changes nothing and is churn at RC |
| 5 | Backup counts have no singular form — a one-answer backup reads "1 Antworten" | A transient status line in a rare edge case |
| 6 | No Apple HIG reference was available in this environment | §6 requires this be stated rather than invented; the conformance review used §6's own rules |

## Deployment

The app is published to GitHub Pages by `.github/workflows/deploy.yml`, which
runs typecheck, tests and the production build before publishing. The Vite
base path is `/Momentum-App/`, which is where a project site is served from,
so the build needs no deployment-specific configuration.

**Pages must be enabled once, by hand:** repository → Settings → Pages →
Build and deployment → Source → **GitHub Actions**. Until that is done the
workflow runs and fails at the publish step; a commit cannot set it.

## Two places the app deliberately departs from the specification

Both were decided by the product owner and are recorded in full:

- **D13** replaces §6's "dark interface only in version 1" with a single
  light theme.
- **D16** gives the rank badge its own dark hero surface inside that light
  screen.
