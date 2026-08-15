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
| M2 | Day loop: clock, day advance, end-of-day summary, `localStorage` save/load | **Done** |
| M3 | Meters + Stress + Visibility HUD; Fax Machine minigame wired to Productivity | **Done** |
| M4 | 4 NPCs with schedules, dialogue system, favor tokens, cover-for-Steve | Next |
| M5 | Line-of-sight Visibility, Solitaire fluff, caught cutscene | **Done** |
| M6 | Printer Jam, Dial-Up + IT favor sink | Next |
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

### The day loop (M2)

`src/sim/` is pure — no Phaser, no DOM, no wall clock — except `DayDirector`,
which owns the composition and needs an event emitter.

- **`DayClock`** is a fixed-timestep accumulator. It emits exactly one discrete
  in-game minute per 687.5 real ms, so a day is always 480 minute-events whatever
  the frame rate. **State changes and RNG draws hang off the discrete minute;
  only presentation reads the continuous float.** A per-frame `rng.chance()`
  would make a 144Hz machine play a different day from a 60Hz one — invisible in
  a playtest on one laptop, and unfixable by seed once saves are in the wild.
- **`DayDirector` owns the clock lifecycle**, not `DayState`. `DayState` is pure
  and knows nothing about the clock, so advancing a day through the pure function
  alone would leave the clock parked past five and day two would never tick.
  Game code calls `director.beginDay()`, never the pure `beginDay()`.
- **`PauseStack`** is a named-reason `Set`, not a boolean and not a refcount. The
  case that decides it: the player alt-tabs while the summary is up. A boolean
  resumes the clock behind a still-visible modal.
- **Nothing calls `scene.pause()` on Office by hand.** Office listens for
  `CLOCK_HELD`/`CLOCK_RELEASED` and derives its own pause from the stack's
  modality. Every caller says `director.hold(reason)` and nothing else. This is
  what lets M4's in-scene dialogue stop time without pausing the scene, while
  M3's minigames stop both, through one mechanism.
- **`DayEndScene` owns every tween in the transition**, because Office is paused
  for most of it and a paused scene's tweens do not advance.

### The meters (M3)

Five meters in `RunState.meters`, an open record that has round-tripped through
the save since M2. Productivity is a **daily** quantity reset each morning;
Standing, Rapport and Strain carry across days and regress overnight toward
their baselines (the boss's memory is short, coworkers remember, and Friday
night is three nights). Visibility lives in the same record but is **excluded
from the save blob** by an explicit transient-key filter and reseeded every
morning — it is a reading about *now*, and the inputs that produce it are not
persisted, so persisting the output would be a lie.

Passive drift hangs off the discrete MINUTE event, never off `update()`. Both
the Boss and Strain terms are multiplied by visibility, which means being seen is
never free: it accelerates the gain at your desk and the bleed anywhere else, and
it always costs strain. That one multiplier closes the exploit where holding
Shift and wiggling on your own desk tile raised Standing at no cost.

**Rapport has no passive drift.** It moves only on discrete events, which gives
it a different character from the other two reputations: management forms an
impression by watching, peers by remembering.

### The fax machine (M3)

Six unlabeled keys, a legible keypad, two identical trays and an LCD that
explains nothing. The panel is generated **per run, not per day** (channel
`fax:panel:v1`), so the label you earned on Monday is still on the key on
Thursday. Mastery is nine tokens in `RunState.learned`, one per FACT — the token
records only *that* the player knows; the generator supplies *what* they know,
so nothing goes stale if `generatePanel` is ever touched.

Two failure modes, one lesson each. A **jam** (wrong tray) costs time and strain
but never Productivity — you did not un-do work, you made the job take longer,
and that distinction is the entire "funny, not punishing" bar. A **misdial** (no
leading 9) transmits successfully, and the bill arrives 25-70 in-game minutes
later, back at your desk, as a Rapport hit. You learn the 9 the way you learn it
in a real office.

The machine bills per ACTION, never per real second, through
`DayDirector.spendMinutes()`. Deliberation is free; decisions are not. Note that
this could NOT use `DayClock.tick`, which clamps a delta to 250ms — less than one
game minute — so a loop of `tick(oneMinute)` silently charges a third of what it
claims. `advanceMinutes()` is the second, explicit mutation point.

### Persistence

`src/save/` is the only place that knows about `localStorage`, behind a
four-method `StorageBackend` that degrades to an in-memory map when storage is
absent, blocked, or full — the game stays playable when saving is impossible.

Reading is **repair-shaped, not reject-shaped**: one `NaN` in `meters` must not
cost the player their week. The one case where refusing is correct is a save
written by a *newer* build, which is left byte-identical in storage rather than
downgraded.

**The version-bump ritual:** copy the current schema to a frozen `vN`, add a step
to `MIGRATIONS`, **capture a fixture written by the outgoing build**, then
repoint the current type. Skipping the fixture is how migrations rot unnoticed.
Migrations **inline their own literal constants and never import `BALANCE`** — if
a migration defaulted a meter to `BALANCE.meters.startStress` and a designer
retuned it in March, the same save would migrate to different values on the
February and March builds. That is the one sanctioned exception to the
balance-file rule, and it is commented in both files.

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
8. **The run seed is date-derived only on FIRST boot,** then persisted in the
   save. Precedence is `?seed=` > saved seed > date. *Amended in M2:* it used to
   re-derive on every boot, which was wrong in a way that only bites once saving
   exists — the derivation is UTC, so a player west of Greenwich crosses the
   boundary mid-afternoon and a resumed game would silently become a different
   game. A pinned `?seed=` is a **scratch run**: nothing is read, written, or
   cleared, so replaying a seed cannot clobber a real week.
9. **Vitest, added in M2** rather than M3 as originally planned. The trigger moved
   earlier because M2's bugs are the invisible kind — a day-rollover off-by-one, a
   `hour % 12` rendering "0:00 PM", a coerce path that drops a week. None show up
   in a five-minute playtest. The sim, save and format modules were written
   Phaser-free and DOM-free anyway, so the coverage cost a config file.
   **`npm run build` deliberately does NOT run the tests** — the build gates the
   Cloudflare deploy, and that is a bigger decision than a test harness. Run
   `npm test` yourself, or add `vitest run` to the build script if you want a
   failing test to block a deploy.
10. **No sound in M1.** Audio starts in M9 per the build order, but the
    fluorescent hum is the obvious early exception if the office feels dead.
11. **Resuming starts at the BEGINNING of the saved day,** replaying that day's
    seed. Losing up to five and a half minutes is the right trade against
    serialising player position, room-visit sets and an in-flight minigame — a
    surface that would grow and need migrating every milestone. It also makes
    quitting to dodge a bad outcome worthless in both directions, since
    uncommitted progress was never committed.
12. **The save stores no player position and no tile coordinates,** only symbolic
    keys, because the ASCII map is expected to be edited. A saved position plus an
    edited map spawns you inside a wall with no in-game escape.
13. **One RNG stream per purpose, never one per scene.** Channels are derived as
    `hashSeed(seed|channel)`. Otherwise a player who examines eleven things before
    lunch gets a different afternoon from one who examines two.
14. **`SAVE_KEY`, the schema version and all layout geometry live with their code,
    not in `balance.ts`.** That file holds numbers a designer can safely retune; a
    storage key and a schema version are code contracts whose "retuning" orphans
    every save.
15. **The end-of-day summary reports walking distance and rooms entered** rather
    than stubbed meters. Every value is real at M2, and the joke is real: the
    system watched you for eight hours and reported your footsteps. `Work
    completed: —` is both the punchline and the M3 meter slot. Three grey bars
    reading 0/100 would be a placeholder wearing a costume.
16. **Every fax job is somebody's paper** — yours, Management's, or a colleague's.
    This is the cheapest honest answer to "why isn't the dominant strategy just
    always fax": the tray is a scarce resource allocated across three meters
    under a time budget, so every job is a two-meter decision and no ordering is
    free. It needs no NPCs, and the colleague ids become M4's NPC ids.
17. **Rapport's only M3 consequence is the morning jam.** When colleagues think
    less of you they stop clearing the machine, so you arrive to somebody else's
    jam and lose 18 minutes. Without it, "never take a colleague's job" strictly
    dominates, because Rapport would be a number with no teeth until M4's favor
    economy exists.
18. **A per-job busy signal keeps a mastered fax a decision.** Seeded per job, so
    it is replayable but unknowable in advance, and REDIAL — useless every other
    day — is exactly the right key when it fires. Without it, a player who knows
    the panel is executing nine fixed keypresses by day eight, which is data
    entry with a bar that fills.
19. ~~The break room and bathroom have no stress-shedding drift yet.~~
    **Paid in M5.** Strain now falls during the day at three venues: the card
    table, the cooler and the bathroom. The bathroom recovers fastest and cannot
    be caught at all — nobody on the floor can see it — so it is priced in the
    two currencies that are not risk: an eleven-minute round trip, and Boss
    Approval bleeding the entire time you are gone.
21. **The card table holds no pause reason.** The clock runs, the cast walks, and
    the boss can arrive behind you. The fax is modal because it bills per action
    and deliberation must be free; Solitaire bills in real seconds and the world
    must keep watching. They are opposite minigames and must never share a
    mechanism — any hold freezes the boss and deletes the threat.
22. **Detection is a dwell counter, never a die roll.** A reporter must hold a
    clear view for consecutive minutes. RNG picks only what Dale says. Every
    catch therefore traces back to a decision the player could have unmade, which
    is the difference between tense and unfair.
23. **Screen exposure is gated on the observer's facing, hard.** A man with his
    back to your monitor cannot read it. Without this the boss's twenty-minute
    park beside your desk made exposure a step function, and the game became a
    timetable to memorise rather than a risk to judge.
24. **Silence is the common catch, speech is rare.** A boss who looks, says
    nothing and keeps walking is the whole joke about this office.
20. **Conditional summary remarks resolve in file order,** first match wins. A
    Friday where you never left the cubicle farm gets the "one room" line rather
    than the Friday line. Reorder the `remarks` array in `dayEnd.json` to change
    the priority — that ordering is a writer's decision, not a code one.
