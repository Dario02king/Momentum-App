# Browser verification

Unit tests prove the rules. These prove the app: that the rules reached the
screen, that nothing is clipped on a phone, and that the accessibility tree a
screen reader consumes says what the pixels say.

Every phase of iteration 2 was signed off against these, and a phase is not
finished until they pass. They are committed rather than improvised per
session so the next run means the same thing as the last one.

## Running them

```sh
npm run build
npx vite preview --port 4173 &          # the scripts expect this exact port
node scripts/verify/phase4.mjs          # exits 0 only if every check passes
```

Chromium comes from the image at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
which each script names explicitly — Playwright's own default path is not
populated here. If that directory moves, change `executablePath` in the
scripts rather than running `npx playwright install`.

## What each one covers

| Script | Covers |
|---|---|
| `phase2.mjs` | Onboarding, no generic Sport domain, categories, custom questions, the 1–10 palette, Areas, the Verlauf drill-down, four widths |
| `phase2-a11y.mjs` | Accessible names on every screen, the question row's name/description split, the heatmap's table alternative |
| `phase2-legacy.mjs` | A device carrying RC2's retired Sport domain: shown read-only, never creatable |
| `phase3.mjs` | Boss Rank on Today and Rank, domain ranks, the progress bar against its own copy, mystery ranks, Boss weighting, four widths |
| `phase3-a11y.mjs` | Progress bars as named images, weight steppers, ladder state in words, reduced motion |
| `phase4.mjs` | Gym: empty state, picker, sets, several exercises, best-set display, decimal kg, progress hierarchy, body renderer, exercise history, rank integration, four widths |
| `phase4-a11y.mjs` | Set/reps/weight field names, add and remove controls, body figures decorative with the legend carrying the facts, focus order, reduced motion |
| `phase41.mjs` | The Gym rating headline, the Endurance Phase and its setback, the locked first rank, a mature unlocked state, year-to-date performance, attendance, the decay state, bodyweight entry, the custom-exercise roles and load type, four widths |
| `phase41-a11y.mjs` | Every bar named and its number printed beside it, the Endurance Phase announced as attendance rather than performance, section order (rating → year-to-date → attendance), focus order, reduced motion |

Two things worth knowing before writing another suite, both of which produced
false failures here first:

- **Chrome's accessibility tree calls `role="img"` an `image`.** Filtering the
  CDP tree for `img` silently finds nothing and passes an "everything is
  named" check by vacuum.
- **Reduced motion collapses durations to `0.001ms`, not to zero.** That is
  the standard idiom — it keeps `transitionend` firing — so a check for
  `> 0` counts every transition in the app. Assert that no keyframe animation
  runs and that no duration is long enough to perceive.

## Conventions

`lib.mjs` holds the shared pieces: `check`/`summary` (which set the exit
code), `onboard` (walks the current onboarding flow), `seed` (writes history
straight into IndexedDB), `clipped` and `smallTargets`.

Two things `smallTargets` knows that a naive check does not, both of which
produced false failures before they were handled: a control may grow its hit
area with an absolutely positioned `::before` at a *negative* inset — that is
how a 31px iOS switch is a 45px target — and a hairline separator is also an
absolutely positioned `::before`, which must not be counted. Visually hidden
controls, such as the file input behind an import button, are operated through
the visible control that labels them and are skipped.

## What they do not cover

Real VoiceOver, real iOS Safari, real touch. No Apple hardware is available in
this environment. What is verified is the layer VoiceOver consumes — the
computed accessibility tree, names, descriptions, roles and focus order — not
VoiceOver itself. Say that plainly rather than implying otherwise.
