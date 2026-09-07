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
