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

Two consequences for later stages followed from this; both are now settled
in D15 and D16.

## D14 — Two weights per pastel, and they are not interchangeable

Each identity colour has a decorative `-fill`, a `-mid` for controls, and a
text-safe `-ink`, plus a `-tint` for backgrounds. On a light ground a pastel
that looks right as a switch cannot carry 17px text at 4.5:1, and the
readable variant looks heavy as a large fill. Splitting them keeps both the
softness the design asks for and the contrast accessibility requires.

Where a colour is display-sized (the 76px sports numeral) the 3:1 large-text
bar applies and the lighter `-mid` is used deliberately.

## D15 — The heatmap stays fully inside the light interface

*Decided by the product owner.*

No dark inset for the history grid. The red/orange/yellow/green bands are
re-mixed specifically for a light ground rather than reused from the dark
palette — yellow is the one that does not survive the move unchanged, since
at small cell size on white it neither reads as a distinct band nor carries
a value.

Colour is never the only carrier: each cell pairs its band with a value or
label, and no-data cells are distinguished by treatment rather than hue
alone. But the grid stays visually clean and compact — a small value inside
a cell where it earns its place, not a number stamped on all thirty days.
Legibility comes from the band mix first and the label second.

Open when stage 4 starts: the `--band-*` colour tokens were dropped during
the light rewrite (D13) and nothing has referenced them since. The
`SCORE_BANDS` thresholds in the constants module are untouched. Stage 4
defines the light-adapted colour tokens against those thresholds.

## D16 — The rank badge gets a dark hero inside a light screen

*Decided by the product owner.*

The Rank screen is not a dark screen. It keeps the light chrome, the light
tab bar and the light surrounding cards — current rank, peak rank and
Lifetime XP read as part of the same app as everywhere else.

The badge hero area alone sits on its own dark premium surface. That is
where §6's gaming contrast lives: metallic material, dimensional depth,
subtle glow, stronger drama, and the one orchestrated moment of motion on a
promotion reveal.

This is a better outcome than the original all-dark screen, because the
contrast now works twice: the badge stands against its own dark ground, and
that dark inset stands against the calm light interface around it. The rule
from §6 still holds — if everything glows, the badge stops meaning anything —
and the glow is now confined to a single surface by construction rather than
by discipline.
