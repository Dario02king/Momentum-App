# Momentum — operating rules

A mobile-first PWA. German (de-CH) first, English second, **local-only**: no
backend, no account, no cloud sync, no telemetry. Everything lives in
IndexedDB on the device.

These are the rules that stay true across phases. Current state, status and
next work are in [`HANDOVER.md`](HANDOVER.md); the reasoning behind individual
choices is in [`docs/decisions.md`](docs/decisions.md).

## The architectural rule everything else follows

**Store what happened. Derive everything else, every time.**

Answers, sessions, sets and configuration snapshots are stored. Day scores,
ratings, ranks, XP, streaks, muscle-group performance and Boss progression are
*replayed* from them on every load. Nothing derived is ever written to
storage.

Two consequences that are not negotiable:

- A stored derived value and a replayed one would eventually disagree, and
  then neither could be trusted. If you find yourself caching a score, you are
  introducing that bug — measure first (`src/storage/services/replayPerformance.test.ts`).
- Correcting a past entry inside the edit window simply produces a different
  answer next replay. There is no recalculation step to write.

## Configuration is historical

Every scoring-relevant change appends an `AppConfigSnapshot` effective from
that day. A past day is scored against the snapshot in force **on that day**,
never against today's settings. This is what makes every change in this app
forward-only without any special handling:

- raising a weekly target does not rewrite last month
- changing Boss weights does not move historical Boss values
- moving a question to another category does not rescore a closed day
- changing the scoring model does not rescore days scored under the old one

A field that is **absent** from a snapshot marks an era: no `boss` means RC2,
no `scoring.model` means the flat Wellbeing model. Never backfill those into
old snapshots — the absence *is* the information.

Where a fact is cheaper to record than to snapshot, record it on the row: a
gym set stores the muscle groups it was logged under. Same principle, smaller
extension.

## Absence is not failure

The single most common way to get this app wrong is to treat "no data" as a
zero. Three states are kept apart everywhere:

| | Meaning |
|---|---|
| no data | never tracked, or not tracked yet |
| insufficient baseline | tracked, but nothing to compare against |
| a real result | including a genuinely bad one |

A domain nobody enabled, a muscle group nobody has trained, a question that
did not exist yet, a week before onboarding — none of these are zeros, and
none may enter a denominator. A *missed* item on a closed day is different:
that is a real result, and it counts as one.

## Two numbers per day, deliberately

- **`score`** — for history. On a closed day it divides by what was **due**,
  so an unanswered item is a miss.
- **`recordedScore`** — what the rating tracks. It divides by what was
  actually **answered**, because dividing by items due would make honestly
  logging partial progress cost more than staying silent.

Never conflate them.

## Product rules that are settled

- One Boss Rank, one domain-rank system, **one badge family**. No second
  ladder, no "strength rank", no separate emblem set.
- Eight ranks, no divisions. Rank names stay English in every language.
- Promotion is immediate; demotion needs hysteresis *and* sustained days. A
  single bad day may never cost a tier.
- Wellbeing questions are asked **daily**. There is no rhythm engine, no
  per-question schedule, and there never will be.
- Gym and Running are independent weekly quotas, never a combined one.
- The generic `sports` domain is **retired**. It exists as a stored
  discriminator so RC2 history replays; nothing in the product may create one.
- Colour is never the only carrier of meaning.

## Interface rules

- Design tokens only (`src/styles/tokens.css`). `contrast.test.ts` parses that
  file and will fail a colour that does not clear its promise.
- Touch targets 44px effective. A control may reach it with a negatively
  inset `::before`.
- No horizontal clipping at 320/360/393/430px.
- Reduced motion respected.
- Avoid technical vocabulary in user-facing copy — no "IndexedDB", "JSON",
  "service worker", "snapshot".
- German is the source of truth for strings; English is typed against it and
  placeholder parity is enforced by `src/i18n/catalogue.test.ts`.

## Build and test discipline

- **`npm run test` must exit 0.** A green summary is not enough: vitest counts
  an unhandled rejection as failure while still printing every test as passed.
  Read the exit code, not the summary. This is how a release once shipped
  broken.
- **Typecheck is `tsc -b`**, never `tsc --noEmit`. `-b` enforces
  `noUncheckedIndexedAccess`, and an emitting typecheck once left stale `.js`
  files that Vite resolved in preference to their TypeScript sources.
- The vitest workspace has two projects: `berlin` for `*.test.ts(x)` and
  `sao_paulo` for `*.tz.test.ts` — date logic runs in a zone where local
  midnight has not always existed. All date arithmetic is anchored at midday
  for that reason.
- Browser and accessibility verification live in
  [`scripts/verify/`](scripts/verify/README.md) and are part of finishing a
  phase, not an optional extra.

## What this app does not do

No exercise database, no food API, no barcode scanner, no meal planning, no
shopping list, no Strava OAuth, no backend, no login, no social feed, no
avatar editor, no muscle-group ranks, no automatic plan changes without the
user's approval.

Do not introduce a backend because it would simplify something.

## When a product decision is not settled

Some decisions are explicitly reserved. Build the shape, leave the value, and
say so — the decay model does exactly this (`src/core/decay/index.ts`): one
switch, one flag, a placeholder that reproduces the previous behaviour
exactly, and a test asserting the flag and the model cannot disagree.

Do not substitute a conventional fitness-app or habit-app model because it is
familiar. Where this app's rules differ from convention, the difference is the
product.
