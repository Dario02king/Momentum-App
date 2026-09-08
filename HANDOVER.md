# Handover — end of Phase 4

Current state, status and next work. Durable rules are in
[`CLAUDE.md`](CLAUDE.md); the reasoning behind individual choices is in
[`docs/decisions.md`](docs/decisions.md) (D1–D89). This file does not repeat
either — it says where things stand.

## Repository state

| | |
|---|---|
| Branch | `claude/momentum-iteration-2` |
| Working tree | clean at the commit this file was committed in |
| `SCHEMA_VERSION` | **3** (`src/core/model/index.ts`) |
| `BACKUP_FORMAT_VERSION` | **2** (`src/core/backup/format.ts`) — a v1 file still imports |
| `SCORING_MODEL` | `categoryMean` (`src/core/config/constants.ts`) |
| `DECAY_MODEL_APPROVED` | `false` — decay is still the RC2 placeholder |

Phases 0–4 of iteration 2 are complete. Phase 5 (Running) is next.

## Architecture

```
records (answers, sessions, sets, snapshots)
  └─ historyService      day scores, per domain, against each day's snapshot
       ├─ ratingService  the legacy undivided progression (RC2's rating)
       └─ bossService    per-domain ledgers + the Boss series
  └─ gymService          gym sets → core/gym/performance → progress figures
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
| `src/core/gym/performance.ts` | Best set → comparison → muscle group → aggregate |
| `src/core/gym/catalogue.ts` | 24 built-in exercises, stable ids, explicit muscles |
| `src/core/decay/index.ts` | Decay contract + placeholder (gate still open) |
| `src/core/migration/legacySport.ts` | RC2 Sport conversion planning (pure) |
| `src/storage/db.ts` | Stores and the numbered migrations |
| `src/storage/services/historyService.ts` | Replays the past, per day, per domain |
| `src/storage/services/bossService.ts` | Ledgers, Boss series, era transition |
| `src/storage/services/gymService.ts` | Catalogue seeding, sets, gym replay |
| `src/storage/services/checkInService.ts` | Today; owns the edit-window rules |
| `src/components/BodyRenderer/index.tsx` | Muscle diagram; presentation only |
| `src/features/gym/*` | Session logging, picker, exercise detail, progress |
| `scripts/verify/` | Browser + accessibility suites (see its README) |
| `.github/fixtures/` | RC2 export + a 120-day synthetic profile |

## Implemented state

**Fully implemented and usable**
- Wellbeing: categories, custom questions, daily check-in, drill-down history
- Gym: exercises, sets, picker, session logging, performance pipeline,
  muscle-group aggregation, body renderer, exercise history, progress hierarchy
- Running: weekly quota, logging one run from Today (no distance/pace UI)
- Boss Rank + four domain ranks, user-configurable weights, mystery ladder
- Backup export/import, PWA, offline, migrations v1→v2→v3

**Infrastructure only — built, tested, not reachable from any screen**
- **Legacy Sport migration.** `legacySportService.ts` and its 18 tests work,
  but *nothing calls them*: a migrated RC2 user is never asked what their
  Sport sessions were, so `legacySportMigration` stays `pending` for ever.
  This needs a UI. It is the largest known gap.
- Gym plans, rest days, pause periods, tombstones, profile, weight entries:
  stores + repositories exist, no logic and no UI.
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

### Gym performance (`core/gym/performance.ts`)
- **Exercise-day:** `max(reps × weightGrams)` over that day's scorable sets.
  Not volume, not the sum, not an average, not 1RM, not the heaviest weight.
  Ties never change the number.
- **Comparison:** against the last day the *same stable exercise id* was
  recorded. `noBaseline | improved | unchanged | declined`. A skipped
  exercise and a long gap are neither.
- **Muscle group:** an exercise's ratio goes to *every* group it maps to; the
  group's value is the mean of what it received.
- **Gym aggregate:** the **equal-weighted mean over measured groups**. Groups
  with no data or no baseline are excluded from the denominator.
- **Long window (`gymPerformanceOverSpan`):** one comparison per exercise
  across its whole span, so frequency adds evidence not weight.
- A set is scorable only with positive, finite reps and integer positive
  grams.

## Invariants future changes must preserve

- No derived value is written to storage.
- A past day is scored against its own snapshot, never today's config.
- An absent field in an old snapshot marks an era. Do not backfill it.
- Untrained / unanswered / not-yet-enabled never enter a denominator.
- Gym weights are **integer grams**; `reps × weight` must stay integer
  arithmetic or two identical sets can compare unequal.
- A gym set's `muscles` are recorded at write time; the replay must read the
  set, not the catalogue.
- Exercise identity is the id. Never join history on a display name.
- Peak rank and lifetime XP never fall.
- One badge family, one rank ladder, one Boss.
- `npm run test` must exit 0; typecheck is `tsc -b`.

## Open product decisions — do not invent these

1. **How Gym performance maps into the 0–1000 rating.** The Gym day score is
   still attendance against the weekly quota. Performance is a *rate of
   change*; turning one into a level means deciding what rate equals what
   level, and whether it replaces, blends with or modulates attendance. Not
   defined anywhere. The Gym progress screen states the current behaviour
   outright so no user is misled. (D88)
2. **The cooling-off / decay formula.** Gate 1. (D72)
3. **Nutrition targets.** Gate 2, Phase 6.

## Risks and known debt

- **Legacy Sport is unreachable** (above). Real RC2 users are affected.
- **`gymPerformanceOverSpan` anchors to an exercise's first recorded day, for
  ever.** A lifetime figure is therefore measured from where the user started.
  If a rolling window is wanted, that is a deliberate change, not a bug fix.
- **The `.github/fixtures/rc2-export.json` profile is one day.** Long-history
  regressions rely on `rc2-synthetic.json`. Neither may be regenerated: the
  numbers RC2 produced from them are pinned in `src/storage/migration.test.ts`.
- **`SPORTS` in `constants.ts` is now unused by app code.** Kept because it
  documents the quota range legacy weeks were scored under.
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
| Unit tests | **652 passing, 42 files, exit 0** (`npm run test`) |
| Typecheck | `tsc -b` clean |
| Production build | clean; no stale `.js` beside any `.ts` |
| Migration + backup | included above: RC2 fixtures reproduce exactly, v1→v2→v3 migrations, backup round trip, newer-file refusal |
| Browser (Phase 4) | 51/51 at 320/360/393/430px |
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
as Gym: performance pipeline in `core/running/*`, presentation in `features/`,
and the same open question about how performance reaches the rating — resolve
it once, for both domains, rather than twice differently.

Phase 6 is Food (Gate 2). Phase 7 is the decay gate. Phase 8 is integration,
tombstones, rest days and pause.
