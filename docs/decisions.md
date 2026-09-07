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

Re-checked at stage 8: still none. The §6 conformance review was therefore
done against §6's own rules — the type scale, card treatment, tab bar,
targets, safe areas and the one dark surface — rather than against an
external HIG reference, as §6 instructs.

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

## D17 — Today shows today, and only today

§10 says the screen is items due today and nothing else, so there is no day
picker on it. The three-day edit window is nonetheless enforced now, in the
check-in service rather than in a component: `saveAnswer` and `clearAnswer`
refuse a day that is closed or in the future, and `loadDay` reports a day's
edit state so a UI can disable its controls.

The surface for actually correcting an earlier day belongs with the history
view in stage 4, where the user is already looking at past days. Building a
second date-navigation UI on Today first would have been the wrong place for
it.

## D18 — "Nein" is neutral, never red

A yes/no answer records behaviour. Colouring the negative red would make
honest recording feel like failure, which is exactly the behaviour that stops
people opening the app in week three. "Ja" takes the domain's green; "Nein"
takes a neutral grey fill. Only the scale, where the user is rating something
themselves, uses the full poor-to-very-good ramp.

Removing an answer is a separate, explicit action — see D21.

## D19 — Scale answers wrap to five and five

Ten 44px targets never fit one phone row. They wrap to two rows of five
rather than shrinking below the minimum tap size. Each value carries its
band's soft tint even when unselected, so the direction of the scale is
visible before anything is chosen, and the selected value fills with the
band's readable weight. The qualitative word ("Gut") appears next to it —
colour never carries the reading alone.

## D20 — The palette is verified by test, not by eye

`src/styles/contrast.test.ts` parses the real token file, resolves `var()`
aliases and does the WCAG arithmetic: every `-ink` must clear 4.5:1 both on
white and on its own `-tint`, every filled control must carry its label, and
the card must actually separate from the ground.

This was not a formality. On first run it failed nine assertions, including
two `-ink` values that D14 claimed were text-safe and were not, and the
secondary button's own tint pairing. Ink-on-tint is the binding constraint
and it is easy to get wrong by eye, which is the whole argument for checking
it automatically.

## D21 — Selecting is not toggling; clearing is its own action

*Decided by the product owner, replacing the re-tap-to-clear behaviour
originally shipped in stage 3.*

Re-tapping the selected option leaves it selected. It does not clear the
answer. An iOS-style selection control is not expected to un-select on a
second tap, and treating it that way makes an accidental double tap destroy
data — the one thing a save-on-tap interface must never do.

Returning a question to unanswered is a small explicit "Antwort entfernen"
action that appears only once an answer exists, styled as quiet footnote
text with a full 44px tap target: secondary in weight, not fiddly to hit.

Two consequences worth recording:

- The controls are now single-choice, so they carry **radio semantics**
  rather than toggle-button semantics: `role="radiogroup"` with
  `aria-checked`, one tab stop per group, and arrow keys moving the
  selection. `aria-pressed` would now describe them wrongly, since it
  implies an option that can be un-pressed.
- `cycleBooleanAnswer` was **removed** from the check-in service rather than
  left unused. It encoded exactly the rejected behaviour, and dead code that
  still works is an invitation to wire it back up. `clearAnswer` remains and
  is now reached only through the explicit action.

## D22 — The trend runs on the overall daily score, not the rating

§12's example figures (642, 518) look like the 0–1000 rating, but the rating
engine is stage 5 and the Progress screen is stage 4. The curve therefore
plots the smoothed **overall daily score** as a percentage.

`core/trends` is deliberately generic over its series — it takes dated values
where `null` means "no data" and knows nothing about what they measure. Stage
5 can feed it the rating without touching the module, and the two curves have
the same shape anyway, since the rating is an exponentially weighted average
of exactly this score.

## D23 — A weekly sports target is resolved at the week's Monday

A week is scored against the target that was in force when it began. Using
the target as of each individual day would let a mid-week change retroactively
rewrite the earlier days of the same week, since the sports score is a
week-level value shown on every day of that week. Monday's snapshot is
deterministic and matches the plain reading of "the target I started this
week with". A change therefore takes effect from the following week.

## D24 — A running week with nothing logged has no data, rather than zero

The same principle as an open day (§11). A week that has not finished cannot
have missed its target yet, so with no sessions logged it is excluded from
the mean instead of scoring zero. Once anything is logged it reports running
progress, and a finished week reports the truth even when that truth is zero.

Without this, every Monday morning would open with the day dragged down by a
sports domain that had simply not happened yet.

## D25 — Days before the app was configured are neutral, never missed

History resolves each day against the snapshot in force then, and there is
deliberately **no fallback** to the earliest snapshot for days that precede
it. Nothing was due before the user configured anything, so those days are
neutral.

This was found by looking at a freshly onboarded profile: the Progress screen
showed a flat 0% line across thirty days, a "Höchststand" annotation on a
date before the app existed, and a grid of red for days the user was never
asked about — precisely the zero-filled chart §21 forbids.

## D26 — "Inactive" is a property the caller supplies, not one inferred

A closed day on which nothing was answered scores zero rather than being
excluded, correctly, because it was missed. But that means a run of missed
days looks like ordinary data to every average, and the inactivity
annotation §12 asks for would never fire.

`SeriesPoint` therefore carries an optional `inactive` flag that the caller
sets from what was actually recorded. The trend module cannot infer it from
the number alone, and pretending otherwise would have made the annotation
fire only in the rare case where nothing was even due.

## D27 — The rating is replayed, never stored

*Reinforces a requirement from the product owner: a rating shown for a past
date must come from the history valid at that point, and must not move
because of a later configuration change.*

`computeRating` is a pure fold that only ever reads backwards, over day
scores that were themselves reconstructed against the configuration snapshot
in force on each day. Nothing is persisted and read back, so there is no
stored value that could disagree with the history.

The consequence is tested directly: adding a question, archiving a question
and changing the sports target today all leave every past day's rating
byte-identical, and extending the history leaves the earlier points
unchanged.

## D28 — Inactivity decays the rating; it does not feed zeros into it

§11 and §13 pull in opposite directions here, and both are honoured by
splitting where each applies.

A closed day with nothing recorded scores **zero**, and the Progress screen
says so — that is §11 and it is the honest reading of a missed day. But
feeding those zeros into the moving average would cost roughly a third of the
rating for a week away, which §13 explicitly forbids ("a one-week holiday
must never cost several tiers").

So the rating treats a day with nothing recorded as *inactivity*: gentle
per-day decay after a two-day grace, capped per episode, with a fresh
allowance once the user returns. History tells the truth; the rating is
deliberately forgiving.

## D29 — The streak bonus eases in both directions

*Superseded by D33, which removes the separate bonus entirely.*

Found on a real seeded profile, not in the tests: the rank history showed
Legend → Champion → Legend within days. A broken streak was giving up its
whole bonus in one step, so at a tier boundary a single incomplete check-in
demoted the user — exactly the "a single bad day must never cost a rank tier"
rule.

The applied bonus now moves a quarter of the way towards what the streak has
earned each day, in both directions. Gaining a streak is slightly less
instant; losing one is no longer a cliff. A regression test pins the
boundary case.

Genuine multi-day oscillation across a threshold is still possible when the
underlying scores really do oscillate there. That is movement, not flicker,
and `RANK_DEMOTION_HYSTERESIS` is the constant to turn if it proves too
lively in real use.

## D30 — The trend now plots the rating (supersedes D22)

*Decided by the product owner.* With the engine in place, the Progress curve
plots the 0–1000 rating and reads `977 / 1000` as §12 shows.

The trend module was already generic over its series, so this was a change of
caller only. The rolling window is **one day**: the rating is itself an
exponentially weighted average, and smoothing it again would flatten the very
movement the screen exists to show. Days before the first scored day carry no
rating and stay out of the series entirely, so a new profile still gets the
empty state rather than a flat line.

## D31 — The badges are a ladder, and Legend leaves it

One shield silhouette gains framing, an inner bevel, side flanges, rays,
laurels and finally a cut jewel as the rank rises, with the metal warming
from steel through bronze to gold. Legend abandons the shield entirely for an
eight-point prism inside a broken orbit — §15 asks for a treatment "clearly
unlike every other badge", and one more shield with a brighter gradient would
not have been that.

All geometry is drawn here rather than adapted from anything published. Each
instance scopes its gradient ids so two badges on one screen cannot collide.

## D32 — The promotion reveal plays once

The rank itself stays derived. What is stored is only `acknowledgedRankId` —
that the user has *seen* a rank — so the one orchestrated animation §6 allows
plays on promotion and not on every visit to the screen. Reduced-motion
users get the same information with no animation at all.

## D33 — The streak is part of what the rating tracks (supersedes D29)

The eased-bonus fix from D29 stopped the immediate cliff but left a tail: one
bad day broke the streak, and the bonus kept unwinding for three more days
while every one of those days was perfect. Measured on a settled profile just
inside Legend, the rating fell 958 → 925.9 → 921.4 → 919.7 and stayed below
the demotion line — so the bad day did cost the tier, days later.

The streak bonus is no longer a figure added to the rating. It is part of the
**target** the moving average tracks, so a lost streak decays at the same
half-life as everything else. The same measurement now falls once, on the day
itself, and rises monotonically afterwards; what remains of the tail is the
carried bonus lapsing for a single day, worth 0.17 points.

`STREAK_BONUS_SMOOTHING` is gone with it — the fix removed a constant rather
than adding one.

A day is judged with the streak it was **carried into**, since that is what
the run up to it earned. Cancelling the bonus on the very day it breaks made
an honestly reported partial day come out fractionally worse than saying
nothing — a small gap, but pointing the wrong way.

## D34 — Demotion must be sustained; promotion is immediate

Reaching a rank is an achievement the moment it happens, so promotion is
instant. A demotion now requires the rating to sit below the hysteresis
buffer for `RANK_DEMOTION_SUSTAIN_DAYS` scored days running.

This is what makes "a single bad day must never cost a tier" hold for the
whole tail of that day rather than only for the day itself: a dip that
recovers within a couple of days was never a change in standing. The
protection is not an inability to fall — sustained poor performance still
demotes, and that is tested.

## D35 — A day counts on what was reported, in proportion to how much was

The sharpest incentive problem found in stage 5. From a settled rating of
900, answering **one of three questions "yes"** — real partial progress —
cost **27 points**, while recording nothing cost **zero**. Logging an honest
partial day was materially worse than pretending to have been away.

The cause was using §11's score, which divides by items *due*, as the
rating's input. That is right for history, where an unanswered item is a
miss, but wrong for the rating, because it conflates not doing a thing with
not saying so.

The rating now uses `recordedScore` — the score over items actually reported
— weighted by `answeredItems / dueItems`. The same day now moves the rating
**+1.6** instead of −27, more of the day reported moves it more, and the cost
of a bad day scales continuously with how much was reported, so there is no
cliff that would reward leaving one question permanently blank.

**The residual, stated plainly.** Reporting a failure still costs more than
silence: one of three answered "no" costs about 14 points where silence costs
0 to 1.5. That difference is inherent to §13 — an unrecorded day is forgiven
precisely because the user may simply have been away, while a reported "no"
is information. It cannot be removed without either punishing holidays or
ignoring reported failure. What is guaranteed instead: the gap is under a
fifth of a tier, it shrinks continuously to nothing as less of the day is
reported, and silence still forfeits XP, the streak, and shows as a missed
day in the history.

## D36 — The rating folds over reconstructed daily state, not a score series

*Wording and architecture point raised by the product owner.*

`DayState` carries status, the §11 score, the recorded score, items due and
answered, whether anything was recorded, and whether the day was completed. A
zero because the user answered "no" and a zero because nothing was recorded
are deliberately treated differently, and how much of a day was reported
decides how much it counts — none of which can be recovered from a number
alone. The distinction is part of the deterministic input by design.

## D37 — A rest day inside a trained week is not inactivity

Found in the stage 6 verification pass, on the configuration least exercised
until then: Sports with no Mental Wellbeing questions at all.

A weekly target is met over a week. Training Monday to Wednesday and resting
Thursday to Sunday *is* a three-a-week target being met — but the rating was
treating those four rest days as absence and decaying them, punishing exactly
the pattern the target asks for.

Inactivity now means the user was away, not that a particular day was quiet:
a day counts as recorded when something was recorded on it, or when there was
no daily obligation that day and the week it belongs to has training. A day
with questions due is still judged on its own, because there the obligation
really is daily. A week with no training at all still decays.

## D38 — A session can be moved to the day it happened, within its week

§17 makes a session editable within its week, and the day is part of the
session. Without this, forgetting to log Monday's run until Wednesday left no
truthful option: the only path was to log it as Wednesday.

The sheet offers the seven days of the session's own week, with days still to
come disabled. Moving beyond the week is refused by the same rule that
governs every other edit to a session, so the week a target counts over
cannot be rewritten after the fact.

## D39 — A backup carries source data only

Ratings, ranks, peaks, streaks, XP, trends and day scores are all replayed
from answers, sessions and configuration snapshots (D27), so exporting them
would ship two versions of the truth that could disagree — and the derived
one would be the stale one. The file holds settings, domains, questions,
answers, sessions, configuration snapshots and rank events, and nothing that
can be recomputed.

Records are sorted by id on the way out, so exporting the same profile twice
produces identical bytes. That makes "export, import, export" comparable
rather than merely equivalent.

## D40 — Two version numbers, because they move for different reasons

`formatVersion` describes the envelope, `schemaVersion` the records inside
it. A future reader can then say *which* of the two it does not understand,
and either being higher than this build knows is refused outright rather than
guessed at.

## D41 — Import replaces; it never merges

Version 1 has no conflict resolution and should not invent one. Merging two
histories would produce a profile that never existed, with a rating matching
neither — and the rating is a fold over the whole history, so a merged
timeline is not a repair, it is a fabrication.

The whole file is validated before anything is touched, and the replacement
runs as a **single IndexedDB transaction** across every store. A rejected
file, or one that fails partway, leaves the existing profile exactly as it
was. Importing the same backup twice is idempotent.

## D42 — The service worker never applies an update on its own

The failure §4 names is a user unknowingly stuck on an old build. So a new
version installs and then *waits*: the app shows an unobtrusive prompt and
the reload happens only when the user taps it, and exactly once — guarded
against the `controllerchange` event firing more than once.

One cache per build, named from the built asset filenames, so activation
cannot leave a mix of old and new assets. The worker never reads or writes
IndexedDB: activating a new version replaces cached code and cannot touch a
single answer.

Navigations are served from the cached shell first rather than trying the
network first, because the app is local-first and has everything it needs
without a request succeeding — network-first would make every offline launch
wait for a timeout.

## D43 — Storage failures say which failure they are

`StorageError` carries a reason — unavailable, blocked, newerData, failed —
and the screen offers the action that actually helps: a reload when an old
tab is running against newer data, a retry otherwise. A migration that throws
aborts its transaction rather than leaving a half-migrated database.

## D44 — The precache list is generated, never written by hand

A hand-maintained list drifts the first time a filename changes, and the
symptom is an installed app serving half of an old build. The build plugin
takes the list from the bundle, so the possibility is removed rather than
managed.

## D45 — Rank badges differ by silhouette first, ornament last

Every badge is read at 38px far more often than at 148px, so the things
that separate one rank from the next are the outline, the dominant hue and
one bold central mark. Ornament — wings, wreath, starburst, crown — is an
accumulating signal of rarity, not the thing that identifies a rank. Below
56px the smallest of it is dropped rather than rendered into mud.

Depth is layered geometry, not filters: a shadow underlay, a diagonal metal
gradient, a clipped specular sweep and a shaded lower body. The Rank screen
can show a dozen badges at once, and a Gaussian blur on each would cost far
more paint than the softness is worth.

An earlier pass washed the crest face with a light inner bevel, and every
rank came out the same silver — the rim carried the hue and the body did
not. The bevel is a stroke now, and the metal gradient holds its saturated
mid-tone across most of the face.

## D46 — Legend is a different kind of object, not a shinier shield

Every other rank is a crest that grew. Legend is a radiant core inside a
broken orbit, with no crest at all. Making the top of the ladder differ in
degree — one more shield, more gold — leaves it looking like Champion with
the contrast turned up; differing in kind is what makes it read as the end
of the ladder at any size.

## D47 — Rank history shows the emblem that was reached

The history list used bare ↑/↓ glyphs, so the one place that shows the
ladder as a sequence showed none of it. Each entry now carries the badge of
the rank reached, with the direction kept as a separate glyph on its corner
— colour is never the only carrier of promotion versus demotion.

## D48 — The eight-rank badge family is locked for V1

The family shipped in D45–D47 is the V1 design and is not revisited for
polish. That fixes four things in particular: Champion steps sideways into
platinum-gold with a crimson gem rather than trying to out-yellow Master;
Rookie stays deliberately restrained, with no aura and no ornament, because
the floor of the ladder has to look like the floor; Legend stays
structurally distinct from the shield-based ranks; and rank history keeps
the badge of the rank reached.

Further changes need an actual defect — usability, accessibility,
rendering or integration — not a better idea about the artwork.

## D49 — An answered question folds away, and the fold is not instant

*Deferred from stage 3 to the stage 8 review by the product owner.*

Today shows what is still open. An answered question folds to one line —
the question, and what was answered — so a finished check-in reads as a
short list of receipts rather than a wall of controls that have already
done their job. Tapping the line opens it again: nothing is hidden, only
folded.

The fold waits about six-tenths of a second. Answering something and having
it vanish under your finger reads as the app taking the screen away, and it
hides the scale's band label at the moment it is most useful. The row stays
open long enough to see the answer land, then closes. The timer is checked
against what is on screen when it fires rather than what was expected when
it started, because the write is asynchronous and can outrun the delay.

The summary states the band, not only the number — "8 · Sehr gut" — for the
same reason the scale itself does: a number alone is not an answer.

A folded panel is `visibility: hidden` once the fold finishes, so it leaves
the tab order and the accessibility tree instead of merely being invisible.
The fold animates `grid-template-rows` from `0fr` to `1fr`, which needs no
measured height; the spacing lives inside the clipped box, because padding
on the clipped box itself survives the fold as a strip of empty space.

## D50 — A screen that cannot load says so

Today rendered an empty `<div>` when its day failed to load — a blank
screen with nothing to act on. It now states what happened and offers a
retry. The failure is reported without naming the storage layer, per the
stage 7 copy rule, and carries no icon: the icon set has no failure mark,
and the celebratory one reads as the opposite of what happened.

## D51 — Placeholder drift is caught by test

English is typed against German, so a missing or misspelled key is already
a compile error. A placeholder renamed inside one string is not: `{total}`
in German and `{totals}` in English compiles and ships a literal brace to
the screen. A test compares the placeholder sets per key, checks that
supplying the expected parameters leaves nothing unfilled, and rejects
empty strings.

## D52 — One way to load a screen, with three states that cannot be confused

Today, Progress and Rank each read from storage on mount, and each had grown
its own version of that effect. The versions did not agree, and none of them
was right: a rejected load left Rank spinning forever, left Progress blank,
and left Today blank until D50. None could be retried, because the load
lived in an effect with no dependencies and nothing else could re-run it.

`useLoadable` is the single version. It is a hook rather than a component
because what counts as *empty* depends on the data and belongs to the screen;
only loading, failure and readiness are general. They are three variants, so
a screen cannot render one as another — the bug that made a failure look like
a load still in progress is now unrepresentable.

Two properties are easy to lose when this is written per screen, so they are
written once:

**A retry is a fresh attempt.** Every attempt takes a ticket and a reply is
accepted only while its ticket is current, so a slow first attempt that
resolves late cannot overwrite the retry that replaced it.

**Content already on screen survives a failed refresh.** Reloading after a
write is not a reason to throw away what the user was reading. The value is
kept and marked stale, and the screen says so quietly instead of emptying.

## D53 — A failure is louder than a stale view, and both are quieter than nothing

A screen that never loaded shows an alert with a retry, and takes focus when
it appears: the content the reader was waiting for did not arrive, and the
next thing they need is one tab away. A screen that *did* load and then
failed to refresh keeps its content and shows a status line — not an alert,
because nothing on screen is wrong, only possibly out of date.

Neither says why. "Deine Einträge sind gespeichert" is what the user needs;
the storage layer is not mentioned anywhere, per the stage 7 copy rule.

## D54 — A write that fails is reported, and the screen returns to the truth

Every configuration mutation was fired with no rejection handler. A failed
write left the interface showing a change that was never stored, and a failed
`applyOnboarding` stranded a new user on the last onboarding step for good:
the button did nothing, said nothing, and there was no way forward.

Mutations now report a refusal and reload, so the screen shows what is
actually stored rather than what was attempted. In onboarding the message
sits above the button that retries it, because there the button *is* the
retry. Elsewhere it is a dismissible banner over the tab bar.

The same hole existed in the backup import: `replaceAllStores` can throw, and
the confirmation stayed on screen for good with no message. The replace is
one transaction, so a throw means nothing changed, and it is now reported as
such.

## D55 — Compiled output never sits beside its source

`npm run typecheck` was `tsc -b --noEmit false --emitDeclarationOnly false`,
which overrode the projects' own `noEmit` and wrote a `.js` next to every
`.ts` — including `vite.config.js` beside `vite.config.ts`.

That is not untidiness. Vite resolves `./useDay` to `useDay.js` before
`useDay.ts`, and loads `vite.config.js` before `vite.config.ts`, so running
the typecheck and then the build produced a bundle built from stale
JavaScript, with no warning and a passing build. It was found here only
because a change that was definitely in the source was definitely not in the
bundle.

Three things close it: the script no longer emits, `resolve.extensions` puts
TypeScript ahead of JavaScript so an artefact cannot shadow its source again,
and the artefacts are ignored so they cannot be committed.

## D56 — The strips are decorative; a table carries the numbers

Thirty bars per row, with no interaction on any of them. Making each a stop
would be thirty tab stops and thirty announcements to say what one sentence
says — and it still would not answer the question a screen reader actually
has, because the bars never carried the dates. Only the count of days was
ever exposed, as one aria-label per row stating the average.

So the strips are `aria-hidden`, and the same data is rendered as a real
`<table>` that nobody sees: dates as column headers, rows as row headers,
values in percent, "Keine Daten" where there are none. That is a semantic
alternative rather than an addition — nothing is announced twice — and it
turns the grid into something a reader can navigate by row and column
instead of listening to end to end.

Each row header also carries one hidden sentence, "24 von 30 Tagen erfasst,
6 ohne Daten", for the shape of the strip without entering the table. On the
expandable rows that sentence is the button's *description*, not part of its
name: the name says which row it opens.

The wrapper carries the hiding, not the table. `.visually-hidden` clamps to a
1px box, and `display: table` ignores that — its box is sized by its content,
so thirty-one columns of dates made a very wide absolutely positioned element
that only `clip-path` was keeping off the screen.

## D57 — The chart is one image, and the answer is next to it

The trend curve stays a single `role="img"`. Its internals are a gradient and
two paths; exposing them would be noise, and the numbers that matter are
already real text beside the chart — the direction in a word, the current
value, the value before it, the annotations. Delete every SVG on the screen
and the trend is still readable, which is the actual test.

The label adds only what the shape alone knew: where the line started, where
it ended and the range it covered. It used to say "30 Tage" and nothing else.

## D58 — Values are rounded wherever they are spoken

The replay produces values like 70.83333333333333. The visible grid always
rounded them; the accessible table did not, so a reader heard thirteen
decimal places for a number the screen shows as 71.

## D59 — A section can be named without being labelled

The trend card and the history grid each carry their own visual title — a
range, a legend — so a grey heading above them would be repetition. Without
any heading they were unnamed regions that a screen reader could neither
navigate to nor skip. `Section` can now render its heading visually hidden,
which structures the document without adding chrome. The shell also gained
the `main` landmark it never had.

## D60 — Hit areas grow; the design does not

An iOS switch is 51×31, a segmented option 40 tall inside a 44px track, and
a sheet's close button 30×30. All three are smaller than the 44px this
project sets as its own minimum, and all three are that size deliberately —
they are the native proportions.

Growing the boxes would change the design. Growing the *targets* costs
nothing: an invisible `::before` extends each to 44px, over areas that hold
nothing tappable. The pixels are unchanged and the thumb has the room the
project promised.

Measured by hit-testing rather than by the elements' own boxes, because an
element's rectangle says nothing about where a tap actually lands.

## D61 — A decorative image claims no name

The rank badge carried `role="img"` and `aria-hidden="true"` at once. The
`aria-hidden` wins, so nothing was broken, but the pair is a contradiction:
an image role promises a name the badge has no way to supply, and does not
need to — the rank's name is always in text beside it.

## D62 — Zoom is never blocked

The viewport meta carried `user-scalable=no`. Android Chrome honours it, so
pinch-to-zoom was taken away from anyone who needs it — a straight
accessibility failure, and there was nothing to protect: the layout holds at
the narrowest supported width and the type scale is fixed in px, so nothing
reflowed badly when zoomed.

## D63 — The document's language follows the interface

`<html lang>` was fixed at `de`. Switching to English left a screen reader
pronouncing English words with German phonetics. The provider now sets it
whenever the language changes.

## D64 — The gap gives way before the tap target

At 320px, five 44px scale bubbles plus four 8px gaps come to 252px inside a
240px card, and the card's `overflow: hidden` silently cut the right-hand
edge off 5 and off 10. Below 360px the gap drops to 4px, which fits without
taking the targets under 44px or breaking the five-and-five layout.

The reason this survived earlier passes is that a document-level overflow
check cannot see it: the card clips its own content and the page never gains
a scrollbar. The regression check now asks every element whether it fits
inside whatever is clipping it.

## D65 — A generic storage failure no longer blames private mode

`error.storage.body` — the fallback for an unclassified failure — was a
byte-for-byte copy of `error.storage.unavailable`, so any storage error the
app could not classify told the user their browser was in private mode.

---

# Iteration 2

Decisions made building iteration 2, continuing the numbering above. Where
these refer to a decision from the iteration 2 brief they say so explicitly —
that document has its own D-numbers, and the two sequences are unrelated.

## D66 — Wellbeing keeps `mental` as its stored name

The product calls the domain Wellbeing. The discriminator every answer row
carries still says `mental`, and will keep saying it. Renaming it means
rewriting every answer, every question and every config snapshot on every
device, in exchange for a label — and the label belongs in the string layer,
where it can differ per language anyway. Display name changes; type does not.

## D67 — Boss weights live in the config snapshot

The brief's D3 asks that a weight change apply forward only and never rewrite
historical Boss progression. That reads like a demand for an append-only Boss
log, which would be a departure from replay.

It is not needed. Weights go into the config snapshot, and the replay already
evaluates every day against the snapshot in force on that day. Editing weights
today changes what today and every later day mean and cannot reach January.
Nothing is stored that could drift from what is replayed, and there is no
second source of truth to keep in step.

## D68 — A snapshot with no `boss` field is the RC2 era

This is the whole of the grandfathering mechanism, and it needed no new data.

Every snapshot RC2 wrote lacks the field. The Boss replay reads that absence
as "one undivided progression" and uses the legacy rating for that day — so
the Boss for a pre-upgrade day is not a number carried across a boundary and
seeded, it is the same replay RC2 ran. Pre-upgrade Boss history is exactly
what the user already saw and cannot drift. Every snapshot this build writes
carries weights, so the marker stays unambiguous.

## D68a — The Boss accumulates weighted movement from the RC2 anchor

*Required at the Phase 1 review, replacing the era step this originally had.*

The rule is that **an application upgrade alone must not create progress or
take progress away.** The first implementation broke it: the RC2 era averaged
Wellbeing and Sport into one number, the new era took the weighted *level* of
the separate ledgers, and those are different quantities — so the Boss could
move a tier on the day the update landed, without the user doing anything.

The Boss now continues from where the RC2 era left it and moves by the
weighted *movement* of the domain ledgers:

```
boss[t] = clamp( boss[t-1] + Σ w[d,t] · ( p[d,t] − p[d,t-1] ) , 0 , 8 )
```

`p[d,t]` is domain `d`'s ladder position on day `t`; `w[d,t]` are the weights
in the config snapshot in force on day `t`, normalised over the domains that
are enabled, weighted, and have actually started. The anchor `boss[t0-1]` is
the RC2 era's final value, bit for bit. A profile with no RC2 era has nothing
to continue from, so it opens at the weighted level of what it has — the one
place a level is used at all.

What this buys, beyond continuity:

- **A domain ledger's starting rating stops being visible.** It is an
  arbitrary constant; in a weighted level it would read as real standing, and
  in a difference it cancels.
- **Weights stay forward-only.** Each day's movement uses that day's
  snapshot, so changing weights today cannot reach back, and enabling Food
  later cannot alter a single earlier Boss value.
- **A domain that has not started contributes nothing** and its weight leaves
  the denominator with it, so it cannot drag the Boss towards zero — and a day
  on which nothing has started moves the Boss by zero.
- Lifetime XP is a sum over history that only ever grows, and peak rank is a
  maximum over a series that now runs unbroken through the anchor, so neither
  can fall at the boundary.

It is not smoothing and not a grace period: no value is adjusted towards
another, and nothing is suspended for a while. It is one continuous series
whose increments change definition at a point.

## D69 — The Boss averages ladder position, not rating

Ranks do not span equal numbers of rating points: Rookie covers 120 and
Legend covers the last 50. Averaging ratings would let the shape of the tier
boundaries distort the mean. The Boss averages the position on the ladder —
rank index plus the fraction climbed towards the next rank, on one continuous
0–8 scale — which is the quantity a user actually experiences.

Legend measures its fraction across the rest of the rating range rather than
sitting at a flat 7.0, so a maxed-out domain keeps contributing. The result is
converted back to a rating so the Boss inherits the existing hysteresis and
sustained-demotion rules instead of growing a second copy of them.

## D70 — A domain that has never been used is left out of the Boss

Not counted as zero, and not given a history it never had. Boss continuity
(D68a) and domain-history truth are separate concerns, and solving the first
by fabricating the second — handing Gym, Running and Food the user's old
overall rank as a stand-in — would make every domain screen a lie.

A domain contributes from the first day it actually has a scored, recorded
day, and its weight leaves the denominator until then. Legacy Sport is the
one exception, and only because the user themselves said what those sessions
were.

## D71 — Converting legacy Sport copies the sessions, it never moves them

Every day before the conversion resolves to a config snapshot in which Sport
is the enabled weekly domain, and snapshots are never rewritten. Deleting the
rows those days count would turn a year of met targets into a year of empty
weeks — the user's history rewritten by an act meant to reinterpret it. The
legacy rows stay; the domain that holds them going forward changes, from the
day of the conversion.

Nothing is fabricated in the copy. RC2 recorded no distance, elevation or step
count, so a converted run has none. Duration is carried only where the user
actually entered one. The weekly target is inherited because it is the number
the user themselves set.

And there is no default: until the user answers, `legacySportMigration` stays
`pending`, the sports domain is untouched and the app works exactly as it did.

## D72 — The decay placeholder is RC2's decay, unchanged

The cooling-off formula is a product-owner gate. A placeholder that guessed at
it would quietly become it: every screen built in phases 2 to 6 would rest on
a number nobody approved, and the approved formula would then read as a
regression. The provisional model reproduces RC2 day for day, behind one
switch and one flag, and a test asserts the flag and the model cannot
disagree.

Rest days and pause periods are already-approved product decisions rather than
part of the formula question, so the input carries them and the placeholder
honours them. On RC2 data this changes nothing, because RC2 recorded neither.

## D73 — The week lookup was quadratic, and the measurement found it

Reconstructing the weeks looked up each week's first day by scanning the whole
date range. At two years that scan was five sixths of the entire cost of a
replay — 338 ms of 427 ms — and it grew as the square of a user's history. It
was there in RC2 too; nobody had a long enough profile to feel it.

Remembering the day while walking the range removes it: two years of four
domains now replays in about 60 ms, of which 25 ms is reading the answers.
The four per-domain ledgers and the Boss aggregation together cost about 4 ms,
so memoising day scores would buy nothing and is not being done.

## D74 — Wellbeing questions are picked from categories, not from a list

The daily score means within a category before it means across them (D17 of
the brief), so choosing six questions from one shelf and none from another is
a decision about weighting whether the user knows it or not. Showing the
shelves is how they get to know it — in the picker, and again in Areas, where
the questions are grouped the way the score groups them.

"Eigene" is not one of the shelves offered. It is where a question the user
writes lands, not a place with anything on it. A question written from scratch
defaults to it and can be moved anywhere.

## D75 — The 1–10 palette needs four values per band, not one

The product decision is about hue: 1–4 red, 5 orange, 6 yellow, 7–8 green,
9–10 dark green. The accessibility half of it is not settled by that, and
cannot be checked by eye.

One colour cannot do four jobs, so each band declares four: a `-fill` at full
strength for a selected control, an `-on` that reads on that fill, an `-ink`
that reads on white and on the band's own tint, and a `-tint` for the
unselected ramp. `-on` is white for four of the five and near-black for
yellow — a yellow dark enough to carry white text is not a yellow any more.

Two consequences worth naming. A yellow fill cannot clear 3:1 against a white
card, so a selected control is outlined in its own ink; that outline is what
makes it a graphical object rather than a pale wash, and every band carries it
so the selected shape is the same all the way along the ramp. And green and
dark green are two steps of one hue, so they are separated by luminance as
well — `contrast.test.ts` checks the gap, because hue alone would leave 8 and
9 indistinguishable for a colour-blind reader and the ramp would lose its top
half.

Red and orange sit at similar luminance and are told apart by hue alone. That
is inherent to the mapping asked for, and it is why the number is always
present next to the colour.

## D76 — Tapping a question in Verlauf opens the question, not Today

Verlauf is where you look; Today is where you act. Someone who taps a question
in a history view is asking how *that* has been going, and landing them on a
check-in answers a question they did not ask. The drill-down is its own
screen: the question, its category, the latest answer, the average, a chart,
and the recent days as a list.

Answering today is offered as a secondary action, and only while the question
is actually being asked — a paused or archived question has no check-in to
reach, and a button that leads nowhere is worse than no button.

The values there are the answers themselves, 1 to 10 or yes and no, not the
percentages the history grid works in. A percentage is the right unit for
comparing a day against a week and the wrong one for reading back what you
said.

## D77 — Today shows one card per training domain

Gym and Running are separate quotas, so a week that met one and missed the
other has to read that way. The check-in service returns a list rather than a
single Sport view, and each log — gym sessions, runs, and RC2's Sport log —
sits behind the same small view type. Phases 4 and 5 add sets and distances
behind that, not instead of it.

The retired Sport card is read-only: it still shows the week it was scored in,
and there is no button that adds anything to it.

## D78 — Grouping the question picker made the step the scroller

The picker used to be one flat list that scrolled itself. Grouped by category
it is several lists on one step, and several independent scrollers is not a
screen — the last question of the first group sat under a footer it could not
scroll past. The step scrolls now and the lists inside it simply flow.

Found by driving the flow in a browser rather than by reading the CSS, which
is the only way this class of defect is ever found.
