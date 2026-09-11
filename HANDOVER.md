# Handover — Momentum V1, released

Current state, status and next work. Durable rules are in
[`CLAUDE.md`](CLAUDE.md); the reasoning behind individual choices is in
[`docs/decisions.md`](docs/decisions.md) (D1–D122). This file does not repeat
either — it says where things stand.

## Repository state

| | |
|---|---|
| Branch | `claude/momentum-pwa-spec-j82dhm` — the default branch, which is the only one Pages deploys from. Pass 2 was developed on `claude/momentum-pass-2-geometry-r2qzkd` and fast-forwarded here |
| Working tree | clean at the commit this file was committed in |
| `SCHEMA_VERSION` | **5** (`src/core/model/index.ts`) — v5 adds the `foodDays` store |
| `BACKUP_FORMAT_VERSION` | **3** (`src/core/backup/format.ts`) — v3 adds the `foodDays` collection; a v1 or v2 file still imports, every later collection reading as empty when absent |
| `SCORING_MODEL` | `categoryMean` (`src/core/config/constants.ts`) |
| `GYM_SCORING_MODEL` | `attendancePerformance` — Gym's 40/60 model |
| `RUNNING_SCORING_MODEL` | `attendancePerformance` — Running's 40/60 model |
| Food scoring | the shared daily fold over a 1–10 adherence rating (D106, D107) — **no** model constant, because there is no second model |
| `DECAY_MODEL_APPROVED` | **`true`** — Gate 1 closed by D113. RC2's formula ratified unchanged, and `core/decay` is now on the live path |
| Gate 2 (nutrition targets) | **still open.** Food ranks without one, on purpose (D106) |

Phases 0–6 of iteration 2 are complete. Phase 4.1 closed the Gym scoring gate,
Phase 5 closed Running's, and Phase 6 built Food **without** closing Gate 2:
Food is ranked on the adherence the user enters, so the calorie and macro
target decision is still entirely open and nothing in the scoring path
pre-empts it.

> **The branch changed.** This work was carried out on
> `claude/gym-scoring-integration-9oeblv`, reset from
> `origin/claude/momentum-iteration-2` at `9bce7f8`. The iteration-2 branch is
> unchanged and remains the ancestor of everything here.

## Architecture

```
records (answers, sessions, sets, snapshots)
  └─ historyService      day scores, per domain, against each day's snapshot
       ├─ ratingService  the legacy undivided progression (RC2's rating)
       └─ bossService    per-domain ledgers + the Boss series
  └─ gymService          gym sets → core/gym/performance → progress figures
       └─ gymRatingService      attendance + windows → the Gym rating
  └─ runningRatingService  runs → core/running/performance → the Running rating

  core/scoring/*  the model both training domains share, from the percentage
                  change onwards: curve, target, movement, Endurance, decay,
                  Maintenance, the fold
```

- **Nothing derived is stored.** Everything above is replayed on load.
- **Business logic never sits in a component.** `core/*` is pure and testable;
  `storage/services/*` joins it to IndexedDB; `features/*` renders.
- **Config snapshots carry the era.** A missing field marks a period: no
  `boss` = RC2, no `scoring.model` = flat Wellbeing scoring. Never backfill.

### Files worth knowing

| Path | Purpose |
|---|---|
| `src/core/model/index.ts` | Every record shape; `SCHEMA_VERSION` |
| `src/core/config/constants.ts` | Every tunable number; ranks; `SCORING_MODEL` |
| `src/core/domains/index.ts` | Domain registry; `WEEKLY_DOMAIN_TYPES` includes legacy `sports` |
| `src/core/scoring/dayScore.ts` | One day's score, both models, all domains |
| `src/core/rating/index.ts` | The 0–1000 EWMA fold |
| `src/core/ranks/index.ts` | Ladder, hysteresis, rank history |
| `src/core/ranks/progress.ts` | **The only** progress-bar calculation |
| `src/core/ledger/index.ts` | The three per-domain quantities |
| `src/core/boss/index.ts` | Boss scale, weights, and the anchored series |
| `src/core/gym/performance.ts` | Best set → comparison → muscle group → aggregate; the trend and YTD windows |
| `src/core/gym/load.ts` | Effective load: external, bodyweight, assisted |
| `src/core/gym/muscles.ts` | 70/30 primary/secondary influence |
| `src/core/scoring/performanceCurve.ts` | **Shared.** The curve, attendance, the two-window blend |
| `src/core/scoring/trainingRating.ts` | **Shared.** The 40/60 target, movement, Maintenance, the fold |
| `src/core/scoring/endurance.ts` | **Shared.** The first-promotion gate |
| `src/core/scoring/abstinence.ts` | **Shared.** Episodes, the four decay schedules, rank intervals |
| `src/core/running/performance.ts` | Distance bands, pace ratios, the window aggregate |
| `src/core/food/adherence.ts` | The 1–10 Food is ranked on, and why no target lives there |
| `src/core/food/catalogue.ts` | Five demo foods — code, not data, never in a backup |
| `src/core/gym/catalogue.ts` | 29 built-in exercises, stable ids, explicit muscles, roles and load types |
| `src/core/decay/index.ts` | **The** general cooling-off formula (D113) — one source of truth for the schedule, the cap and model selection; on the live path |
| `src/core/migration/legacySport.ts` | RC2 Sport conversion planning (pure) |
| `src/storage/db.ts` | Stores and the numbered migrations |
| `src/storage/services/historyService.ts` | Replays the past, per day, per domain |
| `src/storage/services/bossService.ts` | Ledgers, Boss series, era transition |
| `src/storage/services/gymService.ts` | Catalogue seeding, sets, bodyweight, gym replay |
| `src/storage/services/gymRatingService.ts` | Gym's rating state, the era join, window memoisation |
| `src/storage/services/runningRatingService.ts` | Running's rating state, the era join, window memoisation |
| `src/storage/services/checkInService.ts` | Today; owns the edit-window rules |
| `src/storage/services/legacySportService.ts` | The one-time RC2 Sport question, and applying the answer |
| `src/core/pause/index.ts` | **The** pause semantics — coverage, validation, standing. One canonical `isPausedOn` |
| `src/storage/services/pauseService.ts` | Declaring, editing, ending a pause; every rule enforced on the write |
| `src/features/pause/*` | The Areas section that plans and ends one |
| `src/components/metrics.tsx` | **Pass 2.** `MetricTile`, `MetricBoard`, `MetricBar`, `MetricDetailSheet` — a tile states, a sheet explains; built on the one `Sheet` primitive |
| `src/components/BodyRenderer/index.tsx` | Muscle diagram; presentation only |
| `src/features/gym/*` | Session logging, picker, bodyweight, overview, exercise detail, progress |
| `src/features/running/*` | The Running overview and its distance ranges |
| `src/features/food/*` | The Today card: the day's rating, then the log |
| `scripts/verify/` | Browser + accessibility suites (see its README) |
| `.github/fixtures/` | RC2 export + a 120-day synthetic profile |

## Implemented state

**Fully implemented and usable**
- Wellbeing: categories, custom questions, daily check-in, drill-down history
- Gym: exercises, sets, picker, session logging, performance pipeline,
  muscle-group aggregation, body renderer, exercise history, progress hierarchy
- **Gym scoring: the 40/60 rating, the trend and year-to-date windows, the
  Endurance Phase, abstinence decay, Maintenance, bodyweight and assisted
  exercises, 70/30 muscle roles, and the Gym overview that explains them**
- **Running: the 40/60 rating, distance-band identities, pace over the trend
  and year-to-date windows, the Endurance Phase, abstinence decay,
  Maintenance, optional distance/duration entry with derived pace, and the
  Running overview that explains them**
- Boss Rank + four domain ranks, user-configurable weights, mystery ladder
- Backup export/import, PWA, offline, migrations v1→v2→v3→v4→v5
- **Pause periods, end to end** (D116). Bounded to 28 days, prospective only,
  suspending inactivity penalties across every domain without fabricating
  activity — planned and ended in Areas, stated on Today, and read once per
  replay by `loadHistory`.
- **Legacy Sport migration, end to end.** A migrated RC2 user is now offered
  the one-time question in Areas and pointed at it from Today (D112). The
  conversion engine is unchanged — it was always correct, it simply had no
  door.

**Infrastructure only — built, tested, not reachable from any screen**
- Gym plans, rest days, pause periods, tombstones, profile: stores +
  repositories exist, no logic and no UI. **Weight entries are now reachable**
  — the Gym session screen writes one when a bodyweight exercise needs it.
- `RunRecord` carries `source`/`externalId` as the import seam. No importer.

**Intentionally dormant**
- **Rest days.** Deprecated as a product concept (D115): never shipped, never
  approved, made redundant by the seven-day abstinence rule and D37. Store,
  repository, type and backup collection stay for compatibility; nothing
  creates one and no UI ever should. A test asserts no flow does.
- **Tombstone unlocks.** Store and repository exist; the benchmark values are
  an open product decision, so nothing writes them.

**Not implemented**
- Nutrition targets (Gate 2) — deliberately, see below. Tombstone unlocking,
  rest-day/pause handling in the replay, "Warum diese Zahl?", Strava import.

## Scoring rules, as implemented

### Wellbeing day score — two-level mean (`dayScore.ts`)
Per category: mean of its questions. Then the **equal-weighted mean across
categories**. Six Alltag questions cannot outweigh one Mental question.

- `score` (history, closed day): each category divides by questions **due**, so
  a category nobody answered contributes 0 — it was missed.
- `recordedScore` (what the rating tracks): only categories **with an answer**
  enter the mean. A category with nothing answered leaves the denominator.
- Model is read from the day's snapshot: absent ⇒ `flat` (one mean over all
  questions, divided by those due). Never today's model.

### Weekly-quota domains (Gym, Running, legacy Sport)
`min(100, sessionsInWeek / target × 100)`. A week still running with nothing
logged is `null`, not 0. Target resolved at the week's Monday.

### Rating (`core/rating`)
EWMA over day scores, half-life 14 days, start 250, range 0–1000. Streak bonus
is part of the target rather than added on. Inactivity **decays** (capped per
episode) rather than feeding zeros. First 14 days may rise, never fall.

### Ranks
Eight, thresholds in `RANKS`. Promotion immediate; demotion needs 15 points
below the floor **and** 3 sustained scored days.
`rankProgress(value, displayedRank)` is the single source for fill, percentage
and remaining — never derive one from a different rank than the other.
`displayedRankProgress` rounds once first so the printed rating and the
countdown agree.

### Boss (`core/boss`)
Ladder position = `rankIndex + fraction to next` on a continuous 0–8 scale;
Legend spans its fraction across the rest of the range.

```
legacy era (snapshot has no `boss`):  boss[t] = legacy progression[t]
weighted era:  boss[t] = clamp( boss[t-1] + Σ w[d,t]·(p[d,t] − p[d,t-1]), 0, 8 )
```

Movement, not level — an upgrade must neither create nor destroy progress. The
anchor is the RC2 era's final value exactly. Only domains that are enabled,
weighted **and started** contribute. Weights come from each day's snapshot.

### Gym performance (`core/gym/performance.ts`, `load.ts`, `muscles.ts`)
- **Exercise-day:** `max(reps × effectiveLoad)` over that day's scorable sets.
  Not volume, not the sum, not an average, not 1RM, not the heaviest weight.
  Ties never change the number.
- **Effective load** (D91): `external` = the bar; `bodyweight` = bodyweight +
  added; `assisted` = bodyweight − assistance. The bodyweight is the latest
  entry **on or before** the set's date, replayed rather than stored on the
  set, so a later weigh-in can never reach a session already logged. No
  bodyweight yet, or assistance ≥ bodyweight, drops the set — never a zero and
  never re-read as positive resistance.
- **Comparison:** against the last day the *same stable exercise id* was
  recorded. `noBaseline | improved | unchanged | declined`. A skipped
  exercise and a long gap are neither.
- **Muscle group** (D92): primaries share 70 % of an exercise, secondaries
  30 %, equally inside each role — so one exercise is worth one exercise
  however many groups it names. A group's value is the **weighted** mean of
  what it received. A set with no recorded roles is the pre-roles era and its
  groups share it equally, which is how it was actually scored.
- **Gym aggregate:** the **equal-weighted mean over measured groups**. Groups
  with no data or no baseline are excluded from the denominator.
- **Windows** (D100): `gymPerformanceInWindow` takes each exercise's first and
  last recorded day *inside the window* and needs two observations there. One
  comparison per exercise, so frequency adds evidence not weight.
  `gymPerformanceOverSpan` (lifetime) still anchors at the first-ever day and
  is used only by the Progress "overall" figure.
- A set is scorable only with positive, finite reps and an integer positive
  effective load.

### Gym rating (`core/gym/score.ts`, `rating.ts`, `endurance.ts`, `decay.ts`)

**40 % attendance, 60 % personal development** (D90). Relative to the user's
own history; no population norms, ever.

```
attendanceScore   = min(sessions / weeklyTarget, 1) × 1000
performanceScore  = 0.5 × map(trendChange) + 0.5 × map(ytdChange)
target            = 0.40 × attendanceScore + 0.60 × performanceScore
rating           ← rating + (target − rating) × movementFactor(rating, target)
```

- **The curve** (D99): `score(x) = 1000 / (1 + 4^(−x/10))` — every ten points
  of improvement multiplies the odds by four. `score(0) = 500` exactly, ±10 %
  exact, ±5 % within 3.4, ±20 % is 941/59 because symmetry outranks the
  approved table and an asymptote cannot reach 0. No cap on the input.
- **Map then average**, never average then map: the two windows exist to be
  able to disagree.
- **One component missing** ⇒ use the other. **Both missing** ⇒ the target is
  attendance alone. Never a fabricated neutral 500 and never a zero.
- **Windows:** trend is a rolling 60 days ending on the calculation date; YTD
  starts on January the first of that year.
- **Movement:** 10 % of the gap. Upward it scales by
  `min(1, (1000 − rating) / 500)` — full speed at or below 500, 6 % at 700,
  2 % at 900. Downward it is always 10 %: a high rank is harder to climb, not
  protected. The Performance Score itself is never touched by rank.
- **Endurance Phase** (D94): completed weeks score +1 met, −0.5 missed,
  floored at 0; the **first** promotion unlocks at 4.0 net weeks and the gate
  is then permanent. The rating calculates and moves throughout; nothing is
  awarded at the unlock. The Boss reads the rating, so the gate does not
  reach it.
- **Abstinence decay** (D96): **7 consecutive calendar days with zero saved
  Gym sessions**, and only after the Endurance Phase is complete. Missing the
  weekly attendance target alone is *not* abstinence. Reduces **within-rank
  progress only** — never the historical rating, the performance percentages
  or anything already recorded — cumulative against the progress held at the
  episode's start and never compounded. Never below the current rank floor.
  Any saved session ends the episode; a later absence takes a fresh baseline.
  Whole blocks only, and the phase is fixed by the training age at the
  episode's start:

  ```
    abstinent days      →   7     14     21     28     35     42  …  70

    through month 2       50 %  100 %  100 %  100 %  100 %  100 %   100 %
    months 3–4            25 %   50 %   75 %  100 %  100 %  100 %   100 %
    months 5–12           20 %   40 %   60 %   80 %  100 %  100 %   100 %
    month 13 onward       10 %   20 %   30 %   40 %   50 %   60 %   100 %
  ```
- **Maintenance** (D97): from 12 months of Gym training age, with the week's
  attendance target fully met, **both** performance windows carrying a
  baseline, and the aggregate change within ±0.25 pp of zero, the target may
  not pull the rating down. A floor under the target, nothing more — positive
  performance still raises, negative still lowers, missed attendance still
  lowers, and abstinence decay is untouched.
- **Era:** a snapshot with no `scoring.gymModel` is the attendance era and
  replays as it was scored; the new fold continues from the number the old one
  left.

### Food (`core/food/adherence.ts`, `core/scoring/dayScore.ts`)

One item due per day: the 1–10 the user chooses. `adherence × 10` is the day
score — the same mapping a Wellbeing scale answer uses. Unrated inside the
edit window leaves the day **open**; unrated once closed is a **miss for
history** and **no data for the rating**. Before Food was enabled there is no
food entry at all.

The rating is then the shared daily fold, not the 40/60 training model. There
is no attendance, no performance curve, no Endurance Phase and no decay.
Calories and macros are logged, totalled and shown, and never scored — see
D106 for why that is a rule and not a phase-6 shortcut.

Setup is one optional sentence (`FoodDomainSettings.focus`), carried in the
config snapshot, saying what the user is aiming at. Food scores identically
with it empty.

### Running performance (`core/running/performance.ts`)

**Pace at a comparable measured distance** (D102). Relative to the runner's
own history; no population norms, ever.

- **Qualifying:** a *measured* distance ≥ 3 km and a positive duration. A run
  missing either counts in full for attendance and carries no performance.
  Nothing is fabricated — every converted RC2 run is attendance-only for ever.
- **Comparability:** `max/min ≤ 1.10`, symmetric, inclusive, in integer metres.
- **Identity** (D103): a fixed half-open band,
  `floor(ln(d / 972.42) / ln(1.10))`, depending **only** on the run's own
  distance. Same band ⇒ comparable by construction. Adding, editing, deleting
  or expiring any other run can never move an existing run's identity.
- **Evidence** (D104): fastest run per date; ≥ 2 dates; baseline earliest,
  current latest; one ratio per identity;
  `ratio = (d_cur × t_base) / (t_cur × d_base)`.
- **Window:** equal-weighted mean of identity ratios → one percentage change,
  then the shared curve **once**, then Trend (rolling 60 days) and YTD 50/50.
- **Accepted:** a comparable pair can straddle a boundary, and a route
  wandering across one becomes two equally weighted identities. No attempt is
  made to re-merge them, because that would read neighbouring runs.
- Running's Endurance Phase, abstinence decay, Maintenance and movement are
  the shared training-domain rules, identical to Gym's, against Running's own
  weekly target.

## Invariants future changes must preserve

- No derived value is written to storage.
- A past day is scored against its own snapshot, never today's config.
- An absent field in an old snapshot marks an era. Do not backfill it.
- Untrained / unanswered / not-yet-enabled never enter a denominator.
- Gym weights are **integer grams**; `reps × weight` must stay integer
  arithmetic or two identical sets can compare unequal.
- A gym set's `muscles`, `primaryMuscles` and `loadType` are recorded at write
  time; the replay must read the set, not the catalogue. Their **absence** is
  the pre-roles era, not an empty value to fill in.
- A bodyweight load is replayed from the weight entry in force on the set's
  own date. Never a later measurement.
- An absence is charged for once: ordinary movement **or** abstinence decay,
  never both on the same day.
- Decay is cumulative against the episode's baseline, never compounded.
- Gym rank is personal development; Tombstones are absolute. No population
  norms enter a rank, and no development percentage enters a Tombstone.
- Two migrations rewriting one store share one cursor (D98).
- **A comparison identity depends only on its own record's facts.** Running's
  distance band reads the run's distance and two fixed constants, nothing
  else. Grouping by looking at neighbouring records reinterprets history the
  moment one is added, and three such designs were rejected for exactly that.
- `RUNNING_BANDS.ANCHOR_METRES` and `WIDTH` are the scoring-model contract.
  Changing either repartitions every user's history and is a new era.
- Exercise identity is the id. Never join history on a display name.
- Peak rank and lifetime XP never fall.
- One badge family, one rank ladder, one Boss.
- **The Boss averages normalized ladder positions, never event counts** (D110).
  Nothing that reaches `bossSeries` may be a tally of sessions, runs or
  ratings, and lifetime XP must stay out of the rank.
- `npm run test` must exit 0; typecheck is `tsc -b`.

## Open product decisions — do not invent these

1. ~~**How training performance maps into the 0–1000 rating.**~~ **Resolved
   for Gym in Phase 4.1** (D90, D99) and **for Running in Phase 5**
   (D102–D105). Both are 40 % attendance and 60 % personal development,
   through the same shared code. D88 no longer describes the build.
2. ~~**The general cooling-off / decay formula.**~~ **Gate 1 closed by D113.**
   RC2's schedule ratified unchanged — 2 grace days, 1.5/day to day 7, 3/day
   after, 60 per episode — and `core/decay` is now the live implementation
   rather than a contract nobody called. Not one baseline rating moved.
   Wellbeing and Food are general; Gym and Running under the performance
   model keep their own abstinence rule (D96) and are never charged by both.
2a. ~~**Rest-day suspension semantics.**~~ **Resolved by D115** — deprecated,
   not implemented. The schema stays for backup compatibility only.
2b. ~~**Pause-period suspension, and whether XP accrues.**~~ **Resolved by
   D116.** A pause suspends inactivity penalties only; XP is untouched and
   stays monotone.
3. **Nutrition targets.** Gate 2, **still open after Phase 6.** Food is built
   and ranked, on the 1–10 adherence the user enters (D106) — deliberately a
   question that needs no target to answer. Nothing in the scoring path reads
   a calorie or macro figure, so this decision is as open as it was, and
   making it later rewrites nothing already stored.
4. ~~**How Food contributes to the Boss, and what a rated day is worth.**~~
   **Resolved by D110.** Boss contribution is normalized domain performance —
   the shared 0–8 ladder position — never raw event count, and lifetime XP was
   never the Boss path. No per-event constant exists or is needed. Pinned by
   tests in `foodBoss.test.ts`.
5. **Tombstone benchmark values.** The boundary is documented (D95) and no
   values were invented. What counts as a milestone is a product decision.
   No Food Tombstone values were invented either.

## Risks and known debt

- **Legacy Sport is unreachable** (above). Real RC2 users are affected.
- ~~**`gymPerformanceOverSpan` anchors to an exercise's first recorded day, for
  ever.**~~ **Addressed for the rating in Phase 4.1** (D100): the trend and
  year-to-date windows anchor inside their own window. The lifetime variant
  still anchors at the first-ever day and is still what the Progress "overall"
  figure uses, which is correct for that question.
- **The `.github/fixtures/rc2-export.json` profile is one day.** Long-history
  regressions rely on `rc2-synthetic.json`. Neither may be regenerated: the
  numbers RC2 produced from them are pinned in `src/storage/migration.test.ts`.
- **`SPORTS` in `constants.ts` is now unused by app code.** Kept because it
  documents the quota range legacy weeks were scored under.
- **Both training ratings replay two performance windows per day.** The obvious
  implementation filters the exercise-days per day and is quadratic — the same
  shape D73 already removed once. `gymRatingService` and `runningRatingService`
  both walk the window bounds with pointers and memoise on their contents;
  `gymScoring.test.ts` measures a 420-day history of real sets against a
  guard. Do not replace either with a filter inside the day loop.
- **Running's accepted limitations, all deliberate** (D103). A comparable pair
  can straddle a fixed band boundary and never compare — 5 000 and 5 500 m are
  exactly 10 % apart and land either side of one. A repeated route whose
  measured distance wanders across a boundary becomes two identities and is
  counted twice. Neither is fixed, because detecting them means reading the
  surrounding runs, which is the history-reinterpretation the fixed grid
  exists to prevent. Also: pace at a nearby but non-identical distance is not
  perfectly effort-equivalent, so a small distance-related bias can remain
  inside the allowed range. It is left uncorrected — every correction for it
  is a population-derived model.
- **There is no treadmill / indoor / outdoor concept**, and no compensation
  for one. A user mixing treadmill and outdoor runs at the same distance will
  see them compared. Recording this rather than inventing a correction.
- **`elevationMetres` and `steps` remain in the data model, unwritten and
  unscored.** No input exists and none is planned for now.
- **Nothing surfaces a Gym or Running rank demotion yet.** The rating can fall through
  missed attendance and through decay, and `rankHistory` records the demotion,
  but no screen announces it the way a promotion is announced. That is Phase 8
  integration work rather than a defect in either domain.
- **Replay cost is linear and measured**
  (`replayPerformance.test.ts`, ~60 ms for two years of four domains against
  fake-indexeddb). Do not add caching without a measurement showing need — a
  quadratic week lookup was already found and removed this way (D73).
- `Sheet`-based flows and IndexedDB writes are serialised per screen; a fast
  tapper interleaving writes was handled in `GymSessionScreen` with a busy
  guard rather than optimistic state.

## Verification status

All of the following were run against the exact commit this file is committed
in, except where noted.

| | |
|---|---|
| Real device (Pass 2) | iPhone 15 class, from the preview build: the five conditions above, all clean. Recorded here because nothing in `scripts/verify/` can stand in for it |
| Card geometry (Pass 2) | `geometry.mjs`: every line of text measured on all four sides against the box that clips it, 12px of clear space required, at 393/430/320 — Today, Verlauf (both domains, an opened sheet, and a locked-Endurance profile), Rang, Bereiche. **90/90.** The earlier suites' `clipped()` measures `child.right − clipper.right` and cannot see a leftward or upward clip, which is how V1 shipped cards whose corners cut their first and last glyphs |
| Unit tests | **1029 passing, 62 files, exit 0** (`npm run test`) — Pass 2 adds the meter-track contrast pairs |
| Release smoke (production build) | **82/82** (`release.mjs`) — cold load, the whole journey through all four domains, refresh and persistence, backup export / malformed refusal / restore, five widths including desktop, zero console errors |
| Pause regression | the same 2709-value fingerprint — five pure folds, both RC2 fixtures replayed to full Boss and per-domain ledgers, a live four-domain profile through five weeks of silence — is **byte-identical before and after**, same MD5. Only histories that contain a pause differ |
| D113 numeric equivalence | a 64 KB, 2691-value fingerprint — five pure folds, both RC2 fixtures replayed to full Boss and per-domain ledgers, and a live four-domain profile through five weeks of silence — is **byte-identical before and after the refactor**, same MD5, zero mismatches |
| D113 live path | `core/decay` proved on the production path by spying the model through `computeRating`, and model *selection* proved connected by substituting a model in an isolated file and watching the fold follow it |
| Typecheck | `tsc -b` clean |
| Production build | clean; no stale `.js` beside any `.ts` |
| Migration + continuity | v5 adds `foodDays` and declares no transform; a version-4 database carrying food *entries* upgrades with **no** ratings invented from them. RC2 fixtures still reproduce exactly, v1→v2→v3→v4→v5 (including the v2→v4 jump D98 fixed), backup round trip with Food data, newer-file refusal |
| Food era continuity | a day before Food was enabled has no food entry at all; a rating reads back as the number entered after a year of other configuration changes; every Boss value before the switch-on day is bit-identical to a profile that never enabled it |
| Gym/Running isolation | with Food rated every day, both training ratings, peaks, ranks and whole ladder series are bit-identical to the same profile without Food |
| Browser (Phase 8) | 56/56 at 320/360/393/430px (`phase8.mjs`) |
| Accessibility (Phase 8) | **23/23** (`phase8-a11y.mjs`) |
| Browser (Phase 7, regression) | 57/57 at 320/360/393/430px |
| Accessibility (Phase 7) | 18/18 |
| Browser (Phase 6, regression) | 47/47 at 320/360/393/430px |
| Accessibility (Phase 6) | 20/20 |
| Browser (Phase 5, regression) | 46/46 at 320/360/393/430px |
| Accessibility (Phase 5) | 15/15 |
| Browser (Phase 4.1, regression) | 52/52 at 320/360/393/430px |
| Accessibility (Phase 4.1) | 14/14 |
| Browser (Phase 4, regression) | 52/52 at 320/360/393/430px |
| Accessibility (Phase 4) | 15/15 |
| Browser (Phases 2–3, regression) | 64/64, 44/44, 5/5 |
| Accessibility (Phases 2–3) | 17/17, 9/9 |
| Earlier assertions | none weakened. Every earlier suite runs its original checks; the one change was adding `foodDays` to the backup's deliberately exhaustive collection list |
| Boss contribution (D110) | the Boss averages ladder positions and nothing else; training beyond target and logging six meals instead of one both leave every series bit-identical; a daily and a weekly domain take equal shares at equal performance; XP stays out of the rank |
| Flake fixed | one Phase 6 assertion was clock-dependent — it searched the serialised food-day record for the string `70`, which an ISO timestamp contains about one run in three. The assertion was wrong, not the code; it now checks the record's fields. Twelve consecutive full runs are green |

**Real VoiceOver was not tested. No Apple hardware is available in this
environment.** What is verified is the layer VoiceOver consumes — the computed
accessibility tree, names, descriptions, roles and focus order. Real iOS
Safari, installed-PWA behaviour and real touch are likewise unverified.

Re-run browser suites with `scripts/verify/*.mjs` (see that README; needs
`npm run build` and `vite preview --port 4173` first).

## Next work

**Gate 2 — nutrition targets — is still open, and Food works without it.**
Food is ranked on the 1–10 adherence the user enters (D106). Calories and
macros are logged, totalled and shown, and **nothing about them reaches the
score**. If and when targets are decided, they arrive as a new thing the user
can be measured against — the entered 1–10 stays exactly what it always was,
and no stored value needs rewriting.

Do not read Food's existence as the gate having been closed. There is no
calorie target, no macro split, no BMR or TDEE estimate and no weight-goal
model anywhere in the build.

**The domain terminal, Stage A (revised), is on
`claude/momentum-pass-2-geometry-r2qzkd` awaiting review.** Bereiche is the
terminal: one switch — Mental · Gym · Ernährung — and beneath it one area's
workspace (its standing or board, then the card that switches it on and
configures it), with the area in the route (`src/app/route.ts`, mirrored to
`#/areas/<area>`; Back walks the areas visited). Heute, Verlauf and Rang are
unchanged in role: Verlauf stays the overall, historical overview. Gym's
board moved from Verlauf into the Gym area; Running keeps its board on
Verlauf and its card under "Weitere Bereiche und Einstellungen" because it
has no terminal of its own and where it belongs is an open product decision.
Nothing in scoring, ranking, persistence or the questions was touched, and
`src/storage/services/domainOutputs.test.ts` proves it: three fingerprints
pinned before the terminal existed, unchanged after. The QA record is
`docs/design/DOMAIN-TERMINAL-QA.md`. Stages B–E (BodyMap3D, charts, Mental
and Food detail, global QA) wait on the *Muscle Groups Redesign* design files
being seeded into the workspace; no BodyMap3D or Three.js exists here.

**Pass 2 (card geometry, widget layout, detail sheets) is merged and
deployed.** Both stages were approved on a real iPhone 15-class device from
the `Momentum-preview` build: no wrap of "853 von 1000" at 393px, the 2-up
tiles balanced and readable, no clipping or horizontal overflow, the bottom
sheets respecting the safe area, and the metric sheets consistent across Gym
and Running. Those five are the device's verdict, not the desktop harness's —
the harness cannot see SF Pro widths or `env(safe-area-inset-*)`, and says so.
Stage A made the card own its inset on all four sides (`--card-pad`), which
was the whole cause of the corner-clipped text on the phone. Stage B turned
Verlauf into a widget board: rating hero, year-to-date full width, attendance
and the Endurance Phase side by side while the first rank is held, and every
paragraph of methodology moved into the sheet the tile opens. Nothing in
scoring, ranking, persistence or the questions was touched; the one colour
that moved is the Gym bar fill (`-mid` → `-ink`, to clear 3:1 on its tint).
The `Momentum-preview` repository's `index.html` carries
`apple-mobile-web-app-status-bar-style: black-translucent`, which this
repository has never had — worth deciding on deliberately.

**V1 is released.** The release pass closed the last four open items —
Gate 2 by deciding not to build it (D120), tombstones as post-V1 (D121),
D111's real harm (D119), and `restDays` left dormant (D122) — and fixed two
defects found by measurement rather than by reading: a pause punished people
for turning up (D118), and the deploy workflow had been pointing at a dead
branch since RC2, so every green build published nothing (D122).

**Deployment.** GitHub Pages, from `.github/workflows/deploy.yml`, on push to
this branch. Pages is already enabled on the repository; the base path
`/Momentum-App/` in `vite.config.ts` matches the project-site path, so the
build needs no deployment-specific configuration. Live at
<https://dario02king.github.io/Momentum-App/>.

Genuine post-V1 work, none of it blocking:

| Candidate | Product decisions needed |
|---|---|
| "Warum diese Zahl?" panel | none — it explains numbers that already exist. The largest remaining user-facing gap |
| Gym plans, profile | stores and repositories exist; what they are *for* is partly a product question |
| Tombstone unlocking | the benchmark values are an open decision (D121) |
| Nutrition targets | deliberately out of V1 (D120); D106's reservation stands |
| Removing the dormant `restDays` collection | a deliberate `BACKUP_FORMAT_VERSION` cleanup, safe but not urgent (D115, D122) |
| Domain-independent day closure | D111's note, worth revisiting as daily domains multiply |

**If a third training domain ever arrives**, add only its evidence — what one
comparable observation is, and what makes two of them comparable. Everything
from the percentage change onwards already exists in `core/scoring/` and
should not be copied. And whatever groups its comparisons must depend only on
the record's own facts; the three designs that did not are recorded in D103
along with the regressions that killed them.
