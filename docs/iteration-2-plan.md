# Iteration 2 — architecture, migration and phase plan

Phase 0 output. Nothing in this document is implemented yet.

## Baseline verification (§1.1.2)

Required: the deployed RC2 baseline is still application commit `c3e8b7f` with
only documentation/CI commits on top.

**Confirmed.** `c3e8b7f` is the newest commit touching `src/`, `index.html`,
`package.json` or the build configuration. The one commit above it (`1e110b3`)
is documentation, and `git diff c3e8b7f HEAD -- src …` is empty. RC2 is intact
and is not being rewritten: Iteration 2 branches from it.

Branch: `claude/momentum-iteration-2`, off `1e110b3`.

## What RC2 already gives us

The starting point is better than the prompt assumes in one important way.

**D1's three quantities already exist** — for one implicit domain. RC2's
`Progression` carries `current` (a decaying rating), `lifetimeXp` (monotone),
and `peakRank` (never falls). Iteration 2 does not introduce the concept; it
makes it plural. `src/core/rating`, `src/core/scoring/xp.ts` and
`src/core/ranks` are the three modules that become per-domain.

**Everything derived is replayed, never stored** (D27 of the RC2 log). Day
scores, the rating, XP, streaks and rank history are all recomputed from
`answers`, `sportsSessions` and `configSnapshots` on every load. This is why a
past rating cannot move when today's configuration changes, and it is the
property Iteration 2 must not lose.

**Config snapshots already solve forward-only change.** Each answer and
session references the `configSnapshotId` in force on its day, and history is
reconstructed against that snapshot rather than against today's settings.

### Consequence for D3, which looks harder than it is

D3 says Boss weight changes apply forward only and historical Boss progression
is never rewritten. That reads like a demand for stored, append-only Boss
records — a departure from the replay model.

It is not. **Boss weights become part of the config snapshot.** The replay then
reads the weights in force on each day, exactly as it already reads the
questions in force on each day. Forward-only falls out of the mechanism for
free, no new storage, no risk of stored and replayed values disagreeing. This
is the single most load-bearing architectural decision in the plan and I want
it confirmed at the Phase 1 review.

## Data model changes

`SCHEMA_VERSION` 1 → 2. `BACKUP_FORMAT_VERSION` 1 → 2 (a v1 backup still
imports; the check is `formatVersion > BACKUP_FORMAT_VERSION`, so raising the
ceiling is backward compatible by construction).

### Stored (facts the user entered)

| Store | Holds | Notes |
|---|---|---|
| `gymExercises` | one representative exercise per muscle (D22) | carries `bodyweightBased`, `addedWeightKg`, `durationSeconds` unused (D23); supports many-per-muscle already |
| `gymSessions` | a training session: date, weekKey, planId | |
| `gymSets` | weight × reps per set, FK to session + exercise | D24 needs every set, never an average |
| `gymPlans` | days/week, focus, goal, volume, selected muscles | editable, never auto-changed |
| `runs` | distance, duration, optional elevation/steps, `source` discriminator | `source` is the Strava seam (D30) |
| `foodEntries` | date, food ref or free entry, kcal + macros | |
| `weightEntries` | date, kg (D34) | |
| `restDays` | date + domain (D42) | |
| `pausePeriods` | from/to date range (D43) | |
| `tombstoneUnlocks` | id + unlocked date (D38) | |
| `profile` | age, sex, height, activity, work type, goal, target weight (D33) | separate store, not `settings` — it is user data, not app preference |

Demo foods (D35) are a static module behind `FoodRepository`, not a store —
they are code, not the user's data, and must not end up in a backup.

### Extended

- `DomainType`: `'mental' | 'sports'` → adds `'gym' | 'running' | 'food'`.
  **The stored discriminator for Wellbeing stays `'mental'`.** Renaming it to
  `'wellbeing'` would be a data migration across every answer row for a label
  change that belongs in the i18n layer. Display name changes; type does not.
- `QuestionRecord` gains `category` (D17) and `inverted` (D14).
- `AnswerRecord` and `foodEntries` gain the D47 sensitivity marker.
- `AppConfigSnapshot` gains Boss weights and the enabled-domain set.

### Derived, never stored

Per-domain XP, momentum, rank, peak rank; per-muscle long-term state; Boss
progress and Boss rank; all scores; streaks; tombstone eligibility. Same rule
as RC2.

## Migration plan (v1 → v2)

Non-destructive and additive. In order:

1. Create the new object stores and indexes. No existing store is touched.
2. Backfill `category` on the nine predefined questions by text match, and
   `'eigene'` for anything unrecognised. Backfill `inverted: false` — no RC2
   question was inverted, and defaulting to `false` cannot change any existing
   score.
3. Backfill the sensitivity marker to its default on existing answers.
4. Extend the newest config snapshot with equal Boss weights over the domains
   enabled at that moment. Older snapshots are left alone; the replay treats a
   snapshot without weights as "single-domain, weight 1.0", which is exactly
   what RC2 history was.
5. The `sports` domain — **see Question 2 below. This step is not specified
   and I will not guess it.**

Regression test loads `.github/fixtures/rc2-export.json` (already committed),
asserts it imports, and asserts the reconstructed pre-upgrade numbers —
rating, rank, XP, day score for 2026-09-07 — are **identical** before and after
migration. That last assertion is the one that matters: D45 says existing data
must survive, and "survives" means the numbers do not move.

## Phase plan with file targets

| Phase | Targets | Gate |
|---|---|---|
| 0 | this document, `.github/fixtures/` | **report** ← we are here |
| 1 | `core/model`, `storage/db.ts` (migration 2), `core/domains/*` (new), `core/ledger/*` (new), `core/boss/*` (new), `core/decay/*` (new, provisional constant), `storage/repositories/*` | **review stop** |
| 2 | `features/onboarding/*`, `domains/mental/*`, `core/scoring/dayScore.ts` (category means, D18), `features/progress/QuestionDetail.tsx` (new), `styles/tokens.css` (1–10 bands) | |
| 3 | `features/ranking/*` (mystery states, Boss UI), `core/ranks` (progress-bar single source of truth + regression tests) | |
| 4 | `features/gym/*` (new), `components/BodyRenderer/*` (new), `core/gym/performance.ts` (D24/D26) | **review stop** |
| 5 | `features/running/*` (new), `core/running/*`, `RunSource` adapter shape | |
| 6 | `features/food/*` (new), `core/food/*`, `FoodRepository` | **review stop** |
| 7 | decay formula → **Gate 1**; nutrition targets → **Gate 2** | **two gates** |
| 8 | Today/Progress integration, tombstones, rest day, pause, "Warum diese Zahl?", full regression | |

## Repository constraints found

1. **The replay cost grows.** RC2 replays one domain over the full history on
   every Rank/Progress load. Iteration 2 replays four domains plus ten muscle
   states plus the Boss aggregation. Still small in absolute terms — a year is
   365 iterations — but I will measure it at Phase 1 rather than discover it at
   Phase 8, and memoise per-day results if needed.
2. **`vitest` counts unhandled rejections as failure.** The suite prints a
   green summary and exits 1 when a promise rejects unobserved. Any new async
   store code must observe its rejections or CI goes red with every test
   passing. This is how the RC2 deploy failed.
3. **`npm run typecheck` must not emit.** The stale-`.js`-shadowing issue is
   closed; `resolve.extensions` puts TypeScript first and the artefacts are
   gitignored. Do not reintroduce an emitting typecheck script.
4. **The i18n catalogue is typed and placeholder-checked.** Every new German
   string needs its English twin with identical placeholders or the build
   fails. This is deliberate.
5. **The contrast test parses `tokens.css`.** The D13 1–10 band colours will be
   checked by it and must clear 3:1 against their surfaces as graphical
   objects, and 4.5:1 wherever they carry text.
