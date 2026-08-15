# HEADCOUNT — Design

Living document. It mirrors the original brief and is updated as decisions
change. If the code and this file disagree, that is a bug in one of them.

---

## Tone

Deadpan corporate satire. Pale yellow walls, gray cubicles, CRT monitors,
fluorescent hum. Everything is slightly too slow and slightly too broken.
Failure states are funny, not punishing.

## Tech

- Phaser 3 + TypeScript + Vite
- Static build only. No backend. Saves in `localStorage`.
- Desktop browser first, 960×640 design resolution, pixel-perfect scaling.
- Cloudflare Pages, auto-deploy from `main`, build `npm run build`, output `dist`.

---

## The day loop

One in-game workday is 9:00 AM – 5:00 PM, compressed to ~5–6 real minutes
(`BALANCE.clock.realSecondsPerDay`). The player moves around a top-down office:
their cubicle, coworkers' cubicles, printer/fax room, break room, IT closet,
boss's office, bathroom, conference room.

Days advance Mon–Fri. Friday ends with a Performance Review screen — the
dopamine checkpoint. Weekends are skipped with a one-line summary gag.

## The three-meter score

The Performance Review score is a weighted function of:

1. **Productivity** — tasks actually completed
2. **Boss Approval** — how much management likes you
3. **Coworker Rep** — how much peers like you

Weights live in `BALANCE.review.weights`.

**The critical design rule:** most meaningful actions move two meters in
*opposite* directions.

| Action | Effect |
| --- | --- |
| Report Steve's 2-hour lunch | Boss Approval ↑, Coworker Rep ↓ |
| Cover for Steve | Coworker Rep ↑, Productivity ↓, +1 Steve Favor Token |
| Stay late visibly | Boss Approval ↑, Stress ↑ |
| Attend the birthday cake gathering | Coworker Rep ↑, Productivity ↓ |

This tension is the addiction engine. **Never let a dominant strategy exist.**
Any balance change that creates one is a bug, regardless of how good the numbers
look in isolation.

## Visibility and getting caught

A Visibility meter tracks how observed the player currently is: line-of-sight
from the boss and snitch-type NPCs, and whether their monitor faces the aisle.

Fluffing (fake work) restores Stress but risks getting caught — Solitaire on the
CRT, extended water-cooler chats, long bathroom breaks, "reorganizing" the desk.
Getting caught is a large Boss Approval hit plus a one-line passive-aggressive
cutscene.

Counterplay the player can buy or earn: a monitor privacy angle, a fake
spreadsheet overlay, or a lookout arrangement (a coworker coughs when the boss
approaches — costs a Favor Token).

## Favor economy

Favor Tokens are **per-NPC, not a global currency**. Steve's favor is not the IT
Guy's favor.

- **Earn:** cover for people, bring donuts, fix a printer jam, sit through the
  fantasy football recap (a timed dialogue minigame — nod at the right intervals).
- **Spend:** IT Guy unblocks dial-up or prioritises your ticket; the Receptionist
  tips you off about the boss's mood; the Janitor "loses" an incriminating printout.

## Factions

| Faction | Character |
| --- | --- |
| Sales | Loud, credit-stealing, the boss's favorites |
| Accounting | Rule-lawyers who control the expense reports you need |
| IT | Gatekeepers of everything electronic; respond only to favors |
| The Old Guard | 20 years in, know where the bodies are buried, hate the new phone system |

Faction rep unlocks perks and gates certain favors. Helping one faction in a
dispute (the thermostat war) shifts standing with its rival.

## Work task minigames

Each is diegetic and short (20–60 seconds).

1. **Fax Machine** — a panel of unlabeled buttons; discover the correct sequence
   (dial 9 first; wrong tray jams). Sequence knowledge persists across days, so
   mastery feels good.
2. **Printer Jam** — open the right panels in order, remove paper without tearing
   it. Tearing makes the jam worse. Jam location is randomised per incident.
3. **Dial-Up Internet** — timing minigame, fails randomly. After 3 fails you need
   IT: a Favor Token, or a 45-in-game-minute wait while the ticket "escalates".
4. **TPS Report** — transcribe fields from a memo into a form. Later versions add
   contradictory memos; obeying one angers a different manager.
5. **The Meeting** — stay awake, nod when your name is said, do not nod during
   the moment of silence for the Q3 numbers.
6. **Phone Call Transfer** — route a call using a barely legible printed
   directory taped to the wall.

## Random events

1–2 per day, escalating in absurdity over weeks: birthday cake in the break room
(mandatory fun), surprise audit, boss walkthrough, fire drill during your fax,
thermostat war, someone microwaved fish, mandatory team-building survey, the
copier repair guy cometh, casual Friday ambiguity crisis.

## Stress

Rises from tasks, meetings, and getting caught. Falls via fluffing, the break
room, and the weekend. At max Stress the character visibly deteriorates (coffee
tremor animation) and minigames get harder (button labels blur).

**Never a hard fail — just comedic degradation.**

## Meta-progression

Friday review feeds a raise/promotion track over multiple in-game weeks.
Promotions unlock a better cubicle position (corner = lower Visibility), desk
items (radio, plant, second monitor), and eventually junior management: delegate
one task per day, or take credit for a subordinate's report (huge Boss Approval,
catastrophic Coworker Rep if discovered).

Endgame tease: the corner office. It is empty and the view is of the parking lot.

## Art direction

32×32 tile pixel art. Pale yellow walls, gray-blue cubicle fabric, beige CRTs,
brown veneer desks, and a sickly fluorescent white-green wash over everything.
The full palette is `src/art/palette.ts` — one source of truth.

NPCs get simple but distinct silhouettes: Steve's Hawaiian shirt on Fridays, the
IT Guy's black t-shirt, the boss's power tie.

UI is skinned as Windows 95 dialog boxes; meter bars are styled as loading bars.

Sound: fluorescent hum ambient loop, dot-matrix printer, a short royalty-free
synth recreation of a dial-up handshake, keyboard clacks. Elevator-jazz muzak in
the break room only.

---

## Milestones

| # | Scope | Status |
| --- | --- | --- |
| M1 | Skeleton: Vite + Phaser + TS boots; player moves on an office tilemap with collision; deployable | **Done** |
| M2 | Day loop: clock, day advance, end-of-day summary, `localStorage` save/load | Next |
| M3 | Meters + Stress + Visibility HUD; Fax Machine minigame wired to Productivity | |
| M4 | 4 NPCs with schedules, dialogue system, favor tokens, cover-for-Steve | |
| M5 | Line-of-sight Visibility, Solitaire fluff, caught cutscene | |
| M6 | Printer Jam, Dial-Up + IT favor sink | |
| M7 | Friday review, weighted scoring, boss commentary, week progression | |
| M8 | Faction rep, thermostat war, 4 more random events | |
| M9 | Real pixel art, sound, Win95 UI skin, title screen, landing copy | |

---

## Quality bars

- 60fps on a mid laptop. **No per-frame allocations in hot loops** — `update()`
  and `preUpdate()` reuse scratch vectors rather than constructing new ones.
- All balance numbers in `src/config/balance.ts`.
- All dialogue and event text in `src/content/` as JSON.
- Deterministic seeded RNG for daily events, replayable with `?seed=`.
- This document stays current.

---

## Architecture notes

### The map is ASCII

`src/world/officeMap.ts` holds the floor plan as an array of strings, one
character per tile, with the legend in the file header. Editing the office means
editing text. Three guards protect that:

- `buildTileGrid()` throws on a ragged row or an unknown character at boot.
- `findUnreachablePlaces()` flood-fills from the spawn in dev builds and warns to
  the console if any named room has been sealed off.
- Room bounds live in `ROOMS`, used now for the status readout and later for NPC
  schedules, ambient audio zones and boss line-of-sight.

### Art is generated, for now

`src/art/placeholder.ts` draws the entire tileset and the player sheet into
canvas textures at boot from the palette, using the seeded RNG so the speckle is
identical every load. There are no binary assets in the repo yet. M9 replaces
this module with real art and a loader; nothing else should need to change.

### Movement

8-directional, normalised so diagonals are not a speed exploit. The physics body
is a 16×12 feet-box rather than the full 24×32 sprite, so the character's head
can overlap furniture and corners feel forgiving. Tile lookups use the body
centre, not the sprite centre — the sprite is taller than a tile, so its centre
reads as the tile in front of the one being stood on.

---

## Assumptions

Logged where the brief left a decision open. Each one is cheap to reverse; raise
it if you disagree.

1. **Phaser 3.90.0** — the latest v3, not Phaser 4. The brief said Phaser 3 and
   marked the stack non-negotiable, so v4 was not considered despite being current.
2. **Scaling is `Scale.FIT`, not integer-only.** The canvas is 960×640 and scales
   to fit the window with aspect preserved, `pixelArt` and `roundPixels` on.
   True integer-only scaling would letterbox heavily on common laptop screens.
   Swap `mode` in `src/main.ts` if crispness beats screen coverage.
3. **Placeholder art is procedural, not stub PNGs.** No binary assets to review
   in diffs, and the palette stays the single source of truth.
4. **The office is one 40×30 map,** not per-room scenes. Every room in the brief
   exists on it, plus corridors. One scene keeps NPC pathing, line-of-sight and
   camera work simple later.
5. **Doorways are 2 tiles wide.** 1-tile doors made the feet-box catch on the
   wall above unless the player was near-perfectly aligned. Two tiles removes an
   entire category of annoyance and reads better.
6. **`E` and `Space` both "look at" things in M1.** This is a placeholder for the
   real interact verb; it exists to exercise the `src/content/` JSON pipeline
   before M3 needs it. Reassign freely.
7. **Shift = "walk with purpose"** rather than run. Faster, but slightly absurd,
   and it gives Visibility something to react to later.
8. **The day seed comes from the calendar date** unless `?seed=` overrides it, so
   a bug report of "Tuesday, the fax exploded" is reproducible.
9. **No test framework yet.** M1 was verified by driving the running game
   (BFS pathfinding to all eight rooms through real collision). A proper harness
   is worth adding when the minigames land in M3, since their state machines are
   the first thing genuinely worth unit-testing.
10. **No sound in M1.** Audio starts in M9 per the build order, but the
    fluorescent hum is the obvious early exception if the office feels dead.
