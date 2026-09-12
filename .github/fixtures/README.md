# Migration fixtures

## `rc2-export.json`

A **real** backup exported from RC2 (`c3e8b7f`) on a device, supplied by the
product owner per D46. Every migration that changes the schema must be able to
import it, and the migration regression test loads this file rather than a
synthetic object.

What it contains:

| | |
|---|---|
| format / schema | 1 / 1 |
| domains | `mental` (no settings), `sports` (`targetPerWeek: 4`) |
| questions | 9 active — 5 scale, 4 boolean |
| answers | 9, all on `2026-09-07` |
| sports sessions | 1 |
| config snapshots | 1 |
| rank events | 0 |

**What it does and does not cover.** It is one day of history, so it exercises
the parts that actually break in a schema migration — record shapes, domain
settings, snapshot structure, id formats, the union of domain types — and it
does not exercise long-history reconstruction, streaks, decay windows or rank
transitions. Keep synthetic multi-day fixtures alongside it for those; this
file is the one that proves a real export still opens.

Do not edit it. Its value is that nothing in it was written to make a test pass.

## `rc2-synthetic.json`

The multi-day fixture the note above asks for, added in Phase 1 of iteration 2.

Generated, not exported — and generated once, deterministically, then
committed. It is a schema version 1 profile in the same shape RC2 wrote, and
it exists to cover exactly what the real export cannot:

| | |
|---|---|
| range | 120 days from `2026-05-04` (a Monday) to `2026-08-31` |
| domains | `mental` (2 questions, one scale and one boolean), `sports` (`targetPerWeek: 3`) |
| answers | 191, with a deliberate gap: one day in five answers only one of the two questions |
| sports sessions | 46, on Mondays, Wednesdays and Saturdays; Saturdays carry a duration, the rest do not |
| silence | days 60–73 have nothing at all — a fortnight away, so decay and a broken streak are exercised |
| what it produces under RC2 | Master, 5 rank changes, 14 of 18 weeks met, 4640 lifetime XP |

The numbers RC2 produces from it are pinned in `src/storage/migration.test.ts`,
recorded by checking out application commit `c3e8b7f` and running that build
against this file. They are asserted to nine decimal places, including the
date and rating of every promotion, because "existing data survives" means
the numbers do not move.

Do not regenerate it. Regenerating it would change the pinned numbers, which
would defeat the point of pinning them.

## `stage2/` — the Overall-rank update's golden baseline

Written by `src/storage/services/stage2Baseline.test.ts` and
`src/core/scoring/decayEquivalence.test.ts` from the engine **as it was
before Stage 2 touched it** (commit 1 of that stage), and never regenerated
to make a test pass.

| file | what it freezes |
|---|---|
| `rc2-export.baseline.json`, `rc2-synthetic.baseline.json` | the two RC2 profiles above, replayed under the current build: Boss series, rank, peak, XP, rank history, every domain's series and Boss contribution, the Gym and Running states, the whole history |
| `current.baseline.json` | the four-domain profile `domainOutputs.test.ts` fingerprints, in values rather than a hash |
| `training-break.baseline.json` | the same profile over 180 days with a four-week Gym break and a twenty-day Running break, so the abstinence schedule runs through several blocks at the service level |
| `decay-equivalence.json` | hand-built day sequences through `computeTrainingRating`: every threshold, both sides of every hysteresis buffer, an episode held above a threshold with the rating below it, every decay phase, broken and restarted episodes, the Endurance gate shut and opening, pauses, Maintenance, and a 400-day mixed replay — every point, every field |

Every number is stored exactly as the engine produced it. The tests compare
with no rounding and no tolerance: a one-ULP drift is a failure, and the
right response to one is to find out why, not to add an epsilon.

Regenerating is a deliberate act with a commit of its own:
`UPDATE_STAGE2_BASELINE=1 npx vitest run stage2Baseline decayEquivalence`.
