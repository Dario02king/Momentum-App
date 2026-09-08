# Iteration 2 — architecture, migration and phase plan

Phase 0 output, updated at the close of Phase 1. Phases 0 and 1 are built;
everything from Phase 2 down is still a plan.

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
free, no new storage, no risk of stored and replayed values disagreeing.

**Built and confirmed in Phase 1** (D67). It bought more than forward-only
weighting: a snapshot with *no* `boss` field is unambiguously one RC2 wrote,
which is how pre-upgrade Boss history is grandfathered without storing
anything (D68).

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
4. ~~Extend the newest config snapshot with equal Boss weights.~~ **Changed
   during Phase 1: no snapshot is touched at all.** Writing weights into the
   newest RC2 snapshot would have made it indistinguishable from one this
   build wrote, and the absence of the field is exactly what identifies the
   RC2 era. Every snapshot from the upgrade forward carries weights; every
   snapshot before it keeps none, and replays as the one undivided
   progression it was.
5. The `sports` domain is **not touched**. What those sessions were is the
   user's to say; `legacySportMigration` is set to `pending` where there is
   legacy data and `none` where there is not, and the app stays fully
   functional in either state.

### How the regression is actually proved

Asserting "identical before and after" inside one build is circular — the RC2
code is gone, so there is nothing to compare against. Instead the RC2 build
was checked out at application commit `c3e8b7f`, run against the fixtures, and
its output recorded. Those numbers are pinned in `src/storage/migration.test.ts`
and asserted against a database that really was created at schema version 1
and then migrated.

Two fixtures, because the real export is thin:

- `.github/fixtures/rc2-export.json` — the real RC2 export. One day.
- `.github/fixtures/rc2-synthetic.json` — 120 deterministic days with a
  fortnight of silence in the middle: decay, a broken streak, five rank
  changes, eighteen weeks of targets. This is the one that makes "existing
  data survives" mean something.

Both reproduce RC2 exactly, to nine decimal places, including the date and
rating of every promotion.

## Phase plan with file targets

| Phase | Targets | Gate |
|---|---|---|
| 0 | this document, `.github/fixtures/` | **done** |
| 1 | `core/model`, `storage/db.ts` (migration 2), `core/domains/*`, `core/ledger/*`, `core/boss/*`, `core/decay/*`, `core/migration/legacySport.ts`, `storage/repositories/*`, `storage/services/bossService.ts`, `storage/services/legacySportService.ts` | **review stop** ← we are here |
| 2 | `features/onboarding/*`, `domains/mental/*`, `features/progress/QuestionDetail.tsx`, `styles/tokens.css` (1–10 bands), `storage/services/configurationService.ts`, `checkInService.ts` | **review stop** ← we are here |
| 3 | `features/ranking/*` (Boss UI, domain ranks, weights, mystery), `core/ranks/progress.ts`, `features/today/BossSummary.tsx` | **review stop** ← we are here |
| 4 | `features/gym/*`, `components/BodyRenderer/*`, `core/gym/performance.ts`, `core/gym/catalogue.ts`, `storage/services/gymService.ts` | **review stop** ← we are here |
| 4.1 | `core/gym/{score,rating,load,muscles,endurance,decay}.ts`, `storage/services/gymRatingService.ts`, `features/gym/GymOverview.tsx`, schema 4 | **review stop** ← we are here |
| 5 | `features/running/*` (new), `core/running/*`, `RunSource` adapter shape | |
| 6 | `features/food/*` (new), `core/food/*`, `FoodRepository` | **review stop** |
| 7 | decay formula → **Gate 1**; nutrition targets → **Gate 2** | **two gates** |
| 8 | Today/Progress integration, tombstones, rest day, pause, "Warum diese Zahl?", full regression | |

## Repository constraints found

1. ~~**The replay cost grows.**~~ **Measured at Phase 1, and the answer was
   not what the constraint predicted.** The per-domain work is close to free:
   four ledgers and the Boss aggregation add about 4 ms on top of the legacy
   replay. What was expensive was a pre-existing quadratic — the week
   reconstruction scanned the whole date range once per week, which at two
   years was 338 ms of a 427 ms replay and grew as the square of a user's
   history. It is gone (D73). Two years of four domains now replays in about
   60 ms, of which 25 ms is reading the answers from storage. Memoising day
   scores would buy nothing and is not being done. `src/storage/services/replayPerformance.test.ts`
   holds the measurement and a ratio guard against it coming back.
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

## Phase 1 as built

### What is in place

- **Domain registry** (`core/domains`). Four live domains in a table, with
  cadence, default settings and weekly-target flag. RC2's `sports` is
  deliberately *not* in `DOMAIN_TYPES` — it is in `WEEKLY_DOMAIN_TYPES`, which
  the replay iterates, so its weeks keep scoring and nothing can offer it to a
  user as a choice.
- **Activation** as a configuration fact captured by snapshots, with the one
  rule that a user cannot switch everything off.
- **Three-quantity ledger** (`core/ledger`), per domain: momentum (decays),
  lifetime XP (monotone), peak rank (never falls). RC2 had all three for one
  implicit domain; this makes them plural rather than inventing them.
- **Boss Rank** (`core/boss`, `storage/services/bossService.ts`): continues
  from the RC2 era's final value and moves by the weighted *movement* of the
  domain ledgers (D68a), converted back to a rating so it inherits the
  existing hysteresis and demotion rules. An upgrade neither creates progress
  nor takes it away.
- **Decay skeleton** (`core/decay`): the input shape, the model contract, one
  switch and one flag. The formula itself is Gate 1 and is not written.
- **Migration v1 → v2**: eleven new stores, question categories backfilled by
  text match, `inverted: false`, answer sensitivity, and the legacy-Sport
  marker. Purely additive.
- **Legacy Sport**: three branches, no default, copies rather than moves,
  fabricates nothing.
- **Backup format 2**: eleven new collections; a version 1 file still imports.

### Deliberately not in place

- ~~No UI. Onboarding still creates RC2's generic Sport domain.~~ **Fixed in
  Phase 2**: nothing in the product creates one, and `wellbeing.test.ts`
  asserts it of a new profile, its config snapshot, and its Today screen.
- Gym, Running and Food have no scoring engines yet beyond the weekly quota
  that Gym and Running inherit from the existing weekly-target rule. Food has
  none at all, so its ledger never starts and it contributes nothing to the
  Boss — which is the correct behaviour, not a gap left open.
- `loadProgression` is untouched and still drives the Rank screen. The Boss
  replaces it in Phase 3, when there is a screen to show it on.

## Phase 2 as built

- **Onboarding**: three concept screens (Momentum, the three worlds, rank and
  milestones), a domain picker, and setup only for what was switched on. Sport
  is presented as one world; the configuration underneath is two independent
  targets. Gym detail and Food setup are deliberately absent — they belong to
  the first time those areas are opened.
- **No generic Sport**: `OnboardingSelection` has no field for it, `Areas` has
  no switch that turns it on, and `configurationService` has no branch that
  reaches it. It appears only where a migrated device carries one, read-only.
- **Categories**: a library grouped by Alltag / Gesundheit / Mental, a
  category picker on every question, and Areas grouped the same way.
- **Custom questions**: ordinary questions with a category of their own,
  defaulting to Eigene.
- **1–10 bands**: five bands, four tokens each, checked by `contrast.test.ts`.
- **Question drill-down**: its own screen, with the chart's semantic
  alternative carrying the dates the picture cannot.

### Deliberately not in Phase 2

- ~~**D18's category means are not in the scoring path yet.**~~ **Done before
  phase 3**: the two-level mean is live, the model is recorded per snapshot
  (D79), and `scoringModel.test.ts` proves the pre-transition history does not
  move.
- Gym sets, run distances and Food remain Phases 4–6. Today logs a session or
  a run in one tap; what a session *contains* comes later.

## Phase 3 as built

- **One progress calculation** (`core/ranks/progress.ts`). Fill, percentage,
  remaining points and the copy all come out of the same call on the same
  rank. Boundary tests cover every threshold, one either side of it, the top
  of the ladder and a rank held by hysteresis.
- **Boss Rank** is the hero on the Rank screen and a single tappable card on
  Today — badge, rank, bar, what is left, and a way through. Today stays a
  check-in.
- **Domain ranks** use the same badge family at a third the size, one line
  each, with their own bar. A domain that has not started says so instead of
  showing a rank it has not earned.
- **Weights** are steppers in parts with live percentages, an explicit total
  and a line saying the change is forward only.
- **Mystery ranks** keep name, threshold and silhouette; the emblem is
  withheld and the veil is drawn rather than filtered.

## Phase 4 as built

- **`core/gym/performance.ts`** holds the whole pipeline and touches neither
  storage nor React: best set → comparison → muscle group → equal-weighted
  aggregate, with a long-window variant that compares each exercise across its
  whole span so training frequency cannot become weight.
- **Schema 3**: an exercise carries `muscles: MuscleGroup[]` instead of one
  group, and a set carries whole `weightGrams` plus the groups it was logged
  under. Migrated properly, though no release has ever written either record.
- **Logging** is one screen: sets save as they are typed, the next set arrives
  pre-filled from the last, and the only sheet in the flow picks an exercise.
- **Progress** runs Gym overall → muscle groups → exercises → best set per
  day, with each number labelled in its own terms.

### The open decision

~~Gym's day score still counts sessions against the weekly quota. Performance
is computed and shown but does not feed the rating, because mapping a rate of
change onto a 0–1000 level is undefined by the specification (D88).~~
**Resolved in phase 4.1.**

## Phase 4.1 as built

The gate D88 left open is closed. **Gym's rating is 40 % attendance and 60 %
personal development** (D90) — a statement about the user against their own
history and never against anyone else, which is why no population norm goes
anywhere near it. Absolute strength is Tombstones (D95), and the boundary is
an API boundary as much as a conceptual one.

- **The curve is one parameter** (D99): `1000 / (1 + 4^(−x/10))`, so every ten
  points of improvement multiplies the odds by four. The approved anchor table
  cannot be satisfied as written — −20 % → 0 and +20 % → 950 are not symmetric,
  and an asymptote cannot reach 0 — so the two ±20 % anchors give, per the
  approved priority order, and every other anchor is met exactly or within 3.4.
- **Two windows, mapped and then averaged** (D100). 60 rolling days and
  year-to-date, each anchored inside its own window, each contributing one
  comparison per exercise so frequency adds evidence and never weight.
- **The rating moves towards its target** at 10 % of the gap, scaled down for
  upward movement as the rating rises and never for downward movement.
- **The Endurance Phase** (D94) gates the *first* promotion behind four net
  weeks, +1 met and −0.5 missed. Not a streak, not a timer, and not a delay on
  the arithmetic — the rating calculates throughout.
- **Abstinence decay** (D96) reduces rank progress only, cumulatively against
  the episode's baseline. It is Gym-specific and **does not close Gate 1**.
- **Maintenance** (D97) stops a year-old rating being dragged down by holding
  steady.
- **Effective load** (D91) makes a pull-up a real lift, replaying the
  bodyweight in force on the set's own day; **70/30 roles** (D92) stop a
  compound movement gaining influence by touching more of the body.

Schema 4 carries the load types and roles. It also surfaced a real bug in the
migration runner: two migrations rewriting one store each opened their own
cursor, so a device jumping from version 2 to version 4 silently lost version
3's work (D98). Migrations now declare their rewrites and the runner composes
them.
