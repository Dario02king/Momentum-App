# RC1 — real-device acceptance checklist

29 tests, for an actual iPhone (and iPad if you have one). Everything here is
something browser automation cannot prove: real Safari, the installed
standalone shell, real touch, the real keyboard, real VoiceOver.

Start from a clean slate: Safari → Settings → Clear History and Website Data,
or use a fresh profile, so test 6 really is a first launch.

**URL:** the deployed GitHub Pages address for `ae8b479`.

## How to report what you find

| Severity | Means | During RC1 |
|---|---|---|
| **Blocker** | Data loss, app will not start or cannot be used, install or offline flow broken, a core action unreachable | Fix before promotion |
| **Major** | An important workflow is broken or materially confusing | Fix before promotion |
| **Minor** | A genuine defect that does not block use | Fix if cheap and safe |
| **Polish** | Visual or copy refinement only | Defer past RC1 unless exceptionally cheap and risk-free |

For each failure note: **test number · severity · what you did · what happened
· what you expected · device and iOS version.** A photo or screen recording
beats a description.

---

## Install and the PWA shell

| # | Action | Expected | ✅/❌ |
|---|---|---|---|
| 1 | In Safari, open the URL, then Share → Add to Home Screen | The sheet offers the name **Momentum** with the app icon, not a generic page thumbnail | ☐ |
| 2 | Tap the Home Screen icon | Opens standalone: **no Safari address bar, no toolbar** | ☐ |
| 3 | Look at the icon and label on the Home Screen | Icon is sharp at Retina resolution, not stretched or letterboxed; label reads Momentum | ☐ |
| 4 | Look at the top of the screen in the installed app | Content clears the notch / Dynamic Island; the status bar stays legible over the app background | ☐ |
| 5 | Swipe up to the app switcher, swipe the app away, relaunch from the icon | Relaunches standalone and lands on Today with everything intact | ☐ |

## Core interaction

| # | Action | Expected | ✅/❌ |
|---|---|---|---|
| 6 | Complete onboarding from scratch: pick 3 questions, set a weekly Sport target, tap Starten | Lands on Today; your chosen questions are listed; the target you picked is shown | ☐ |
| 7 | Holding the phone in one hand, answer every question with your thumb only | Every option is comfortably reachable; no stretching to the top of the screen; no mis-taps between adjacent options | ☐ |
| 8 | Tap an answered (folded) question, change the answer | Row opens, the new answer takes effect, the row folds again after a moment | ☐ |
| 9 | Open a folded question and tap **Antwort entfernen** | The question returns to the unanswered list and the header count goes back up | ☐ |
| 10 | Tap the same answer option twice in a row | It stays selected. It must **not** clear | ☐ |
| 11 | Log a Sport session, then open it and change the type, note and duration | The week counter increases; edits stick | ☐ |
| 12 | Move through Heute → Verlauf → Rang → Bereiche and back | Tab switching is immediate; each screen keeps its scroll position sensibly; the current tab is obvious | ☐ |
| 13 | Scroll each screen to its bottom | Scrolling is smooth with normal momentum; nothing is hidden behind the tab bar; no rubber-band revealing browser chrome | ☐ |

## Persistence

| # | Action | Expected | ✅/❌ |
|---|---|---|---|
| 14 | Note today's answers, week count, rank and XP. Force-quit and relaunch | All four are exactly as you left them | ☐ |
| 15 | Restart the phone, then open the app from the Home Screen | Same again: nothing lost, no re-onboarding | ☐ |
| 16 | Leave the app for a few hours, come back | Still your data; the date header shows the correct current day | ☐ |

## Offline

| # | Action | Expected | ✅/❌ |
|---|---|---|---|
| 17 | Open the app online once. Turn on Airplane Mode. Force-quit and relaunch | The app launches fully offline — no error page, no blank screen | ☐ |
| 18 | Still offline: answer a question, log a Sport session, visit all four tabs | Everything works. Progress and Rank render normally | ☐ |
| 19 | Still offline: force-quit and relaunch again | The offline changes are still there | ☐ |
| 20 | Turn Airplane Mode off and use the app | No data loss, no duplicate entries, no reset, no "recovering" state | ☐ |

## iOS-specific UI

| # | Action | Expected | ✅/❌ |
|---|---|---|---|
| 21 | Scroll to the bottom of Bereiche and look at the tab bar | The bar clears the home indicator; nothing is cut off underneath it | ☐ |
| 22 | Rotate to landscape on each of the four tabs | Layout adapts without clipping or overlap. *(Portrait is the designed orientation; landscape must be usable, not beautiful.)* | ☐ |
| 23 | Bereiche → add a question, type into the text field. Then edit a Sport session's note | The keyboard never covers the field you are typing in; you can scroll while it is open; Sichern/Hinzufügen stays reachable | ☐ |
| 24 | Dismiss the keyboard | The layout settles back with no leftover gap or jump | ☐ |

## Accessibility

| # | Action | Expected | ✅/❌ |
|---|---|---|---|
| 25 | Pinch to zoom in, and out again | Zoom works. *(Blocked zoom would be a Blocker — it was fixed in RC1, so this test is confirming the fix on real hardware.)* | ☐ |
| 26 | Settings → Accessibility → Display & Text Size → Larger Text, raise it, return to the app | **Known limitation:** the app's own text will not resize — it is fixed in px. Report only if something *breaks*, not that it fails to grow | ☐ |
| 27 | Turn on VoiceOver. Swipe through Today | Each question is announced with its answer options; the answered rows announce the question and the chosen value; the clear action is reachable | ☐ |
| 28 | With VoiceOver on Verlauf: use the rotor to move by heading, then find the daily-values table | Headings: Verlauf, Trend, Tagesverlauf. The trend chart is announced as one image with range, direction and values. The table gives dates as column headers and percentages per day. **The 30 bars must not be announced individually** | ☐ |
| 29 | With VoiceOver on Rang and Bereiche: swipe through both | Rank, Peak and XP are announced as three separate statements; the rank badges are silent (decorative); switches announce their on/off state | ☐ |

---

### Notes while testing

Read the expected column before you act — several tests describe known
limitations deliberately, so you don't spend time reporting something already
recorded in [`RC1.md`](RC1.md).

Tests 15 and 22 are the two most likely to be impractical depending on your
device and patience. Skipping either is fine; mark it and say so.
