# Handover — end of Phase 4.1

Current state, status and next work. Durable rules are in
[`CLAUDE.md`](CLAUDE.md); the reasoning behind individual choices is in
[`docs/decisions.md`](docs/decisions.md) (D1–D100). This file does not repeat
either — it says where things stand.

## Repository state

| | |
|---|---|
| Branch | `claude/gym-scoring-integration-9oeblv` |
| Working tree | clean at the commit this file was committed in |
| `SCHEMA_VERSION` | **4** (`src/core/model/index.ts`) |
| `BACKUP_FORMAT_VERSION` | **2** (`src/core/backup/format.ts`) — unchanged; the envelope did not change, only record shapes, and a v1 or v2 file still imports |
| `SCORING_MODEL` | `categoryMean` (`src/core/config/constants.ts`) |
| `GYM_SCORING_MODEL` | `attendancePerformance` — Gym's 40/60 model |
| `DECAY_MODEL_APPROVED` | `false` — the **general** cooling-off gate is still open |

Phases 0–4 of iteration 2 are complete, and Phase 4.1 has closed the Gym
scoring gate. Phase 5 (Running) is next.

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
       └─ gymRatingService  attendance + performance windows → the Gym rating
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
| `src/core/gym/score.ts` | The performance curve, attendance, the two-window blend |
| `src/core/gym/rating.ts` | The 40/60 target, movement, Maintenance, the fold |
| `src/core/gym/endurance.ts` | The first-promotion gate |
| `src/core/gym/decay.ts` | Abstinence episodes and the four schedules |
| `src/core/gym/catalogue.ts` | 29 built-in exercises, stable ids, explicit muscles, roles and load types |
| `src/core/decay/index.ts` | **General** decay contract + placeholder (gate still open) |
| `src/core/migration/legacySport.ts` | RC2 Sport conversion planning (pure) |
| `src/storage/db.ts` | Stores and the numbered migrations |
| `src/storage/services/historyService.ts` | Replays the past, per day, per domain |
| `src/storage/services/bossService.ts` | Ledgers, Boss series, era transition |
| `src/storage/services/gymService.ts` | Catalogue seeding, sets, bodyweight, gym replay |
| `src/storage/services/gymRatingService.ts` | Gym's rating state, the era join, window memoisation |
| `src/storage/services/checkInService.ts` | Today; owns the edit-window rules |
| `src/components/BodyRenderer/index.tsx` | Muscle diagram; presentation only |
| `src/features/gym/*` | Session logging, picker, bodyweight, overview, exercise detail, progress |
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
- Running: weekly quota, logging one run from Today (no distance/pace UI)
- Boss Rank + four domain ranks, user-configurable weights, mystery ladder
- Backup export/import, PWA, offline, migrations v1→v2→v3→v4

**Infrastructure only — built, tested, not reachable from any screen**
- **Legacy Sport migration.** `legacySportService.ts` and its 18 tests work,
  but *nothing calls them*: a migrated RC2 user is never asked what their
  Sport sessions were, so `legacySportMigration` stays `pending` for ever.
  This needs a UI. It is the largest known gap.
- Gym plans, rest days, pause periods, tombstones, profile: stores +
  repositories exist, no logic and no UI. **Weight entries are now reachable**
  — the Gym session screen writes one when a bodyweight exercise needs it.
- `RunRecord` carries `source`/`externalId` as the import seam. No importer.

**Intentionally dormant**
- **Food.** Enable-able, shows *Noch nicht gestartet*, contributes nothing to
  the Boss, fabricates no XP. Phase 6. Do not "fix" this.
- **Decay.** The placeholder reproduces RC2 exactly. Gate 1, still open.

**Not implemented**
- Nutrition targets (Gate 2), tombstone unlocking, rest-day/pause handling in
  the replay, "Warum diese Zahl?", Strava import.

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
- **Abstinence decay** (D96): 7 consecutive days with no saved session, after
  the Endurance Phase only. Reduces **rank progress only**, cumulative against
  the progress held at the episode's start, never compounded. 50 % a block in
  months 1–2, 25 % in 3–4, 20 % in 5–12, 10 % from month 13, capped at 100 %.
  Never below the rank floor. Any saved session ends it; a later absence takes
  a fresh baseline.
- **Maintenance** (D97): from 12 months, with attendance fully met and
  aggregate performance within ±0.25 pp of zero, the target may not pull the
  rating down. A floor under the target, nothing more.
- **Era:** a snapshot with no `scoring.gymModel` is the attendance era and
  replays as it was scored; the new fold continues from the number the old one
  left.

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
- Exercise identity is the id. Never join history on a display name.
- Peak rank and lifetime XP never fall.
- One badge family, one rank ladder, one Boss.
- `npm run test` must exit 0; typecheck is `tsc -b`.

## Open product decisions — do not invent these

1. ~~**How Gym performance maps into the 0–1000 rating.**~~ **Resolved in
   Phase 4.1** (D90, D99). Gym's rating is 40 % attendance and 60 % personal
   development; D88 no longer describes the build. The same question is still
   open for **Running**, and Phase 5 should resolve it by reusing this model
   rather than inventing a second one.
2. **The general cooling-off / decay formula.** Gate 1, still open (D72).
   Phase 4.1's abstinence decay is a *Gym-specific* rule about rank progress
   (D96) and does not close this: `core/decay` is untouched and
   `DECAY_MODEL_APPROVED` is still `false`.
3. **Nutrition targets.** Gate 2, Phase 6.
4. **Tombstone benchmark values.** The boundary is documented (D95) and no
   values were invented. What counts as a milestone is a product decision.

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
- **The Gym rating replays two performance windows per day.** The obvious
  implementation filters the exercise-days per day and is quadratic — the same
  shape D73 already removed once. `gymRatingService` walks the window bounds
  with pointers and memoises on their contents; `gymScoring.test.ts` measures a
  420-day history of real sets against a guard. Do not replace that with a
  filter inside the day loop.
- **Nothing surfaces a Gym rank demotion yet.** The rating can fall through
  missed attendance and through decay, and `rankHistory` records the demotion,
  but no screen announces it the way a promotion is announced. That is Phase 8
  integration work rather than a defect here.
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
| Unit tests | **819 passing, 49 files, exit 0** (`npm run test`) |
| Typecheck | `tsc -b` clean |
| Production build | clean; no stale `.js` beside any `.ts` |
| Migration + backup | included above: RC2 fixtures reproduce exactly, v1→v2→v3→v4 migrations (including the v2→v4 jump that D98 fixed), backup round trip, newer-file refusal |
| Browser (Phase 4.1) | **52/52** at 320/360/393/430px (`phase41.mjs`) |
| Accessibility (Phase 4.1) | **14/14** (`phase41-a11y.mjs`) |
| Browser (Phase 4, regression) | 52/52 at 320/360/393/430px |
| Accessibility (Phase 4) | 15/15 |
| Browser (Phases 2–3, regression) | 64/64, 44/44, 5/5 |
| Accessibility (Phases 2–3) | 17/17, 9/9 |

**Real VoiceOver was not tested. No Apple hardware is available in this
environment.** What is verified is the layer VoiceOver consumes — the computed
accessibility tree, names, descriptions, roles and focus order. Real iOS
Safari, installed-PWA behaviour and real touch are likewise unverified.

Re-run browser suites with `scripts/verify/*.mjs` (see that README; needs
`npm run build` and `vite preview --port 4173` first).

## Next work

**Phase 5 — Running.** Distance, duration, pace, optional elevation and steps;
run history and progress; the `RunSource` import seam stays a seam. Same rules
as Gym: performance pipeline in `core/running/*`, presentation in `features/`.

**The open question about how performance reaches the rating is now answered
for Gym, and Running should reuse that answer rather than invent a second
one.** What generalises, and what does not:

- *Generalises.* The 40/60 shape, the performance curve
  (`core/gym/score.ts` — worth moving to `core/scoring/` when the second
  caller exists), map-then-average over two windows, the movement factor, the
  Endurance Phase, abstinence decay, Maintenance, and the snapshot era marker.
- *Does not.* Running's performance *metric*. Gym's is `max(reps × load)` per
  exercise; Running's has to be decided — pace at a distance, distance in a
  session, or something else — and **that is a product decision, not a detail
  to settle while building.** Surface it; do not pick one.

Phase 6 is Food (Gate 2). Phase 7 is the general decay gate — still open, and
Phase 4.1's Gym abstinence rule does not close it. Phase 8 is integration,
tombstones, rest days and pause.


