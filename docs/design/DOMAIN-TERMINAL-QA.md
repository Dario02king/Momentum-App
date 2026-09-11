# Domain Terminal — QA record

One row per check the brief names. A row is **PASS** only when the check was
actually run and seen; **FAIL** when it was run and did not hold;
**NOT VERIFIED** when nothing here can stand in for it, with the reason.
Rows are updated stage by stage; the stage column says which stage last
touched the row.

Verification tooling: `npm run test` (unit, incl. the domain-output
fingerprint in `src/storage/services/domainOutputs.test.ts`), `tsc -b`,
`scripts/verify/geometry.mjs` (card geometry at 393/430/320), the phase
suites and `release.mjs` (see `scripts/verify/README.md`).

| # | Check | Result | Stage | Evidence |
|---|---|---|---|---|
| 1 | Mental / Gym / Food switch | PASS | A | `terminal.mjs`: on Bereiche, a named radio group offering Mental · Gym · Ernährung and nothing else, one checked, one tab stop, arrow keys; one line at 393/430 with no label clipped; two rows of two below 360px |
| 2 | Only one domain visible at a time | PASS | A | `terminal.mjs`: with Gym open, every `[data-metric]` is Gym's and the only domain cards on the page are Gym's and Laufen's (the latter in the general group below); the same for Mental and Ernährung |
| 3 | Home global content preserved | PASS | A | `terminal.mjs`: Heute carries the Boss standing, the check-in, the Ernährung rating and both training actions, and no switch; `phase6`/`phase7`/`phase8`/`release` unchanged |
| 4 | Global progress preserved | PASS | A | `terminal.mjs`: Verlauf is unchanged as the overall overview — trend, the grid with the Gesamt/Wellbeing/Gym/Laufen rows, no switch — and Rang is unchanged |
| 5 | Gym BodyMap integration | NOT VERIFIED | — | No BodyMap3D exists in the repository; Stage B is blocked on it |
| 6 | Gym chart rendering | NOT VERIFIED | — | Stage C; design not yet available in this workspace |
| 7 | Gym chart touch behaviour | NOT VERIFIED | — | Stage C |
| 8 | Chart empty states | NOT VERIFIED | — | Stage C |
| 9 | 393 × 852 | PASS | A | `geometry.mjs` 108/108 at 393 × 852 — Today, four domains, an opened sheet, Rang, Bereiche, plus a locked-Endurance profile |
| 10 | 430 × 932 | PASS | A | `geometry.mjs` at 430 × 932, same screens |
| 11 | 320px regression | PASS | A | `geometry.mjs` at 320 × 693; board and switch collapse to one column / two rows |
| 12 | No horizontal overflow | PASS | A | `geometry.mjs` document check on every screen; nothing uncontained reaches past the viewport |
| 13 | Accessibility (switch semantics, names, headings) | PASS | A | Switch semantics in `terminal.mjs`; every control and image named, headings in product order, bars named with their number printed beside them, in `phase41-a11y` (now on Bereiche → Gym) and `phase5-a11y`. Chart-specific rows are Stage C |
| 14 | Reduced motion | PASS | A | `terminal.mjs`: no keyframe animation runs and no transition is perceptible on the terminal under `prefers-reduced-motion` |
| 15 | Three.js lazy loading | NOT VERIFIED | — | No Three.js in the bundle yet; nothing to lazy-load |
| 16 | Domain output regression | PASS | A | `domainOutputs.test.ts`: the three fingerprints pinned at `d07f677` (25 236 values) are unchanged after the terminal |
| 17 | Browser / Back navigation | PASS | A | `terminal.mjs`: `#/areas/<area>` and `#/progress` deep links open the right screen; Back walks the areas visited and out to the tab visited before the terminal; Forward re-enters; an unknown hash keeps the screen and corrects the address, a fresh load of one lands on Heute |
| 18 | Production build | PASS | A | `tsc -b` clean, `vite build` clean, `release.mjs` 82/82 against the production bundle |
| 19 | Full test suite | PASS | A | `npm run test` 1032 passing, exit 0; `terminal.mjs` 43/43; every phase suite green except the pre-existing date-dependent `phase41` assertion that fails identically on V1 |

## Known limits of this record

- **Real-device behaviour is not in this file.** Safe areas, SF Pro metrics
  and touch are only observable on the phone; the desktop harness says so
  rather than asserting them.
- The design source (*Muscle Groups Redesign*) has to be seeded into the
  workspace before Stages B and C can be verified at all.
