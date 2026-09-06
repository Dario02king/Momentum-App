# Decisions

Choices made during the build that the specification did not settle, kept here
so the stage 8 review has a record rather than a reconstruction.

## D1 — Date arithmetic is anchored at local midday

Every date calculation builds its `Date` at 12:00 local, never at midnight.
In time zones where a DST transition skips local midnight, a midnight-anchored
day silently resolves to a neighbouring date, which would file a check-in on
the wrong day. Tests run in Europe/Berlin and in a historical São Paulo rule
where local midnight did not exist.

## D2 — Config snapshots are referenced, not copied into entries

§18 asks for the configuration in force to be stored alongside an entry. Each
answer and session stores a `configSnapshotId` instead of an inline copy.
Same determinism, no duplication — and it also covers days with **no entries
at all**, which an entry-embedded copy cannot: scoring a missed day needs to
know what was due on it.

## D3 — Correcting an answer keeps its original snapshot

Editing yesterday inside the three-day window judges that day by the
configuration it was lived under, not by today's.

## D4 — One answer per question per day, enforced by the key

An answer's id is `date#questionId`, so §8's "asked once per calendar day" is
a property of storage rather than a rule the UI has to remember.

## D5 — Mental Wellbeing questions are daily only; weekly quotas belong to domains

*Decided by the product owner, replacing the specification's per-question
rhythm (daily / N times per week / weekly).*

A question has no schedule. An active question is asked every day, once. This
keeps the daily check-in a single unambiguous act and removes "was this due
today?" from the scoring path entirely.

Anything that is genuinely a weekly quota is modelled the way Sports is: a
domain with a weekly target, logged on whatever days it happens, shown as
`2 / 3 diese Woche`. Future domains with weekly targets reuse that shape
rather than reintroducing per-item schedules or fixed weekdays.

Consequence: `Rhythm` was removed from the schema. Should a later version ever
need one, adding the field back is an additive read-time default — records
without it are daily, which is exactly right.

## D6 — German formats through the Swiss locale

*Decided by the product owner.* `de-CH` groups thousands with an apostrophe
(4'820), which is what §14 shows. Dates, weekday and month names are identical
to `de-DE`, so nothing else changes. Output is normalised to a straight
apostrophe because ICU versions differ on which one they use.

## D7 — Dark mode only, and no light-mode scaffolding

*Superseded by D13.* Per §6 the interface was dark only, with no unused
light-mode tokens waiting to be filled in.

## D8 — Pastel accents on an Apple-dark ground

The stage 2 brief asks for soft pastel tones; §6 of the specification warns
against pastel palettes on dark. Both are satisfied by keeping pastels as
*accents* — selected states, domain identity, switches, badges, the scale
ramp — while every surface underneath stays true black and Apple dark grey.
The interface reads soft without turning washed out, and the rank badges
still have somewhere louder to go in stage 5.

## D9 — Sports target is capped at seven per week

The picker shows every choice as a bubble, and above "every day" a weekly
quota stops describing a week. `SPORTS.MAX_TARGET_PER_WEEK` moved from 14
to 7. Easy to raise if two-a-day training turns out to matter.

## D10 — Bubbles wrap rather than shrink

Seven 44px targets plus gaps do not fit one row below about 390px. They wrap
to a second row instead of shrinking: a sub-44px tap target is a worse trade
than an extra row, and a horizontal scroller would hide choices.

## D11 — A question row states its type once

Type lives in the badge; the row subtitle is gone. Every active question is
asked daily, so "Täglich" on every line distinguished nothing, and the type
appeared twice per row. Paused and archived get a badge because those are
the states worth calling out.

## D12 — No Apple HIG design skill is available in this environment

Checked at stage 2: no such skill or plugin is installed. Per §6 this is
reported rather than invented; the work follows HIG principles directly
(type scale, 44px targets, safe areas, translucent tab bar, restrained
motion). Worth re-checking before the stage 8 review.

## D13 — The interface is light (supersedes D7, revises D8)

*Decided by the product owner, overriding §6's "dark interface only".*

Version 1 is now a single **light** theme: a tinted off-white ground, white
cards lifted by soft two-layer shadows rather than borders, inset hairline
separators, iOS proportions (50px CTAs, 44px minimum targets, 22px card
radii) and generous spacing.

Still one theme, not two. The reason §6 gave for picking one — that the
history colours and the rank badges each need a single ground designed for
properly — holds whichever ground is chosen. `color-scheme: light` is
declared so the browser does not auto-invert anything.

Two consequences for later stages, which is why this is worth recording:

- **Stage 4 heatmap.** The red/orange/yellow/green scale was specified for a
  dark ground. On white, yellow is the problem colour: it cannot carry a
  value at small size. The band tokens are already defined as text-safe
  variants, and the heatmap will need a value or label in each cell rather
  than relying on the hue — which §12 requires anyway.
- **Stage 5 rank badges.** "Metallic, dimensional, subtle glow" was written
  against black. Glow does not read on white; the badges will need to earn
  their drama from material, depth and geometry instead, or sit on their own
  darker surface within the otherwise light Rank screen. Worth deciding
  before that stage starts.

## D14 — Two weights per pastel, and they are not interchangeable

Each identity colour has a decorative `-fill`, a `-mid` for controls, and a
text-safe `-ink`, plus a `-tint` for backgrounds. On a light ground a pastel
that looks right as a switch cannot carry 17px text at 4.5:1, and the
readable variant looks heavy as a large fill. Splitting them keeps both the
softness the design asks for and the contrast accessibility requires.

Where a colour is display-sized (the 76px sports numeral) the 3:1 large-text
bar applies and the lighter `-mid` is used deliberately.
