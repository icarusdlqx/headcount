# M4 — implementation plan

NPCs, schedules, dialogue, favor tokens, cover-for-Steve.

This is the decision record from M4's design pass. The full generated spec was
much longer; what survived review is below. Where a decision reverses the spec,
the reason is stated, because the reasons are the useful part.

---

## Decisions taken before implementation

### 1. Covering for Steve puts his filing at the FRONT of your tray

The generated design appended Steve's job to the back of a 4-6 job tray that a
player never empties in a 480-minute day. The Productivity cost therefore never
materialised: covering was +14 Rapport and a token for 22 minutes and no
downside — a gift, not a two-meter choice, on the game's first real moral
compromise.

His filing now jumps the queue and displaces your own work at full opportunity
cost. **The tray order is a contract**, and it needs stating in `faxTray.ts`:
`DayDirector.nextJob` is `jobs[0]`, so anything inserted must choose an end
deliberately.

This also makes Dale's "did you actually do his filing?" check a real question
rather than a branch that can never open.

### 2. Reporting Steve buys durable standing, not a one-off

As designed it paid about +0.03 weighted points and permanently closed the
richest favor line in the game, so no rational player took it twice — a museum
exhibit where DESIGN.md lists it as one of the two canonical two-meter actions.

Reporting now shifts Dale's `bossTarget` permanently: he checks with you first
from then on. A real long-term gain against a real long-term loss, which is the
trade the game is actually about.

---

## Blocking defects the critique found, and their fixes

| # | Defect | Fix | Status |
| --- | --- | --- | --- |
| 1 | `src/sim` modules would transitively import Phaser via `placeholder.ts`, so no M4 test could run in node | Extract `CharDirection` + frame geometry into `src/art/charFrames.ts` | **Done** |
| 2 | The proposed pause refactor resumes `OfficeScene` mid-day-transition, regressing M2's most carefully built sequence | Gate the resume arm on `pause.running` as well as `!pause.modal`, or add `dayTransition` to `MODAL_REASONS`. Add a test asserting Office is never resumed between `DAY_ADVANCED` and `DAY_START` | Open |
| 3 | The "clear a foreign jam" earn source has no hook: `clearJam` returns a `FaxStep` with no outcome, and `FaxOutcome` carries no foreign-jam field, so `BALANCE.fax.coworkerRepPerForeignJamCleared` can never apply | Add `foreignJamCleared` to `FaxOutcome`, carry it through `pressStart`/`pressStop`, branch in `faxOutcomeDeltas`. Touches `faxMachine.ts`, `FaxScene.ts` and `fax.test.ts` | Open |
| 4 | Steve's job unreachable at the back of the tray | Decision 1 above | Open |

Also confirmed against source and worth fixing while nearby:

- The new lift lobby tiles sit outside every `ROOMS` rect, so `roomAt` returns
  the fallback, `visibilityTarget` silently uses `fallbackExposure`, and the
  `visitedEveryRoom` predicate fires one room early. If the lobby ships, it needs
  a `RoomRect` and a `roomExposure` entry — and then the existing
  `assertVisibilityCoverage` guard does its job for free.
- `misdialReplyDeltas()` hard-codes `stress: 3` — a tunable in logic.
- `narrateFaxOutcome` never selects the `sentColleague` pool, so that prose is
  unreachable.
- `Hud.setHint()` and `hints.atFax` are defined and never called.

---

## Cut from the generated design

Each of these is real work that belongs to a later milestone, or a smaller
version of something that already exists.

- **The lift lobby.** A tile-vocabulary change, a new art block, a map edit, a
  `PLACES` entry and a missing room rect — justified mostly by M7 and M9. Steve's
  absence is already legible from an empty chair six tiles from your desk.
- **Dale as a fifth full actor** with two scripts and an unprompted-report trip.
  M4's scope is four NPCs. Dale needs a schedule and one conversation; the second
  script exists so the player can do a thing the scene already allows.
- **`walkthroughStanding`** — a getting-noticed reward. Line-of-sight is M5's
  entire scope, and shipping the reward arm before the risk arm is exactly the
  mistake assumption 19 refuses to make with the break room.
- **`src/sim/deadlines.ts`** — arm/pending/due/take/cancel for four keys, when
  `pendingReplyMinute` + `takeMisdialReply` is nine working lines. The spec argues
  against reintroducing `DayClock.at()` and then builds a smaller one.
- **Dead-on-arrival fields**: `NpcDef.faction` (M8, read by nothing), `SinkKey`
  as a typed field when sinks dispatch through dialogue effect ids.
- **`flags['fax.favorClear']`** — a new overnight mechanic invented so one favor
  sink never has to say "nothing to sell today", which the prose already handles.
- **The timed nodding minigame** ("listen to the fantasy football recap"). This
  IS in M4's scope line in the build order, and it is being cut deliberately, not
  overlooked: M4 already ships a dialogue runtime, a schedule system, a favor
  ledger and a scenario state machine. Enduring the story stays a dialogue node
  with a time cost. Revisit when M5's Meeting minigame gives it a home.

---

## Open problems worth solving during implementation

- **Pat is the metronome, and the design jitters her ±6 minutes.** Pat exists so
  the player can learn one schedule. Jitter must be per-NPC, and Pat's is zero.
- **Dennis appears once, at 1:50, for fifty minutes.** A player can finish week
  one without ever seeing him, which makes "the hermit" indistinguishable from
  "not implemented".
- **Content volume.** Two chatter lines and one story per NPC means the player
  has read everything these four people will ever say by Wednesday. This is the
  most likely reason M4 feels thin, and it is a writing problem rather than an
  engineering one — good work for a designer who is not a coder.
- **Favor anti-farm numbers do not implement their own intent.** The caps allow
  four grants a day against a cap of three, with a weekend decay of one, so all
  four NPCs cap by Wednesday of week one.
- **`BALANCE.dialogue.effects[id]` will not typecheck** under `strict` against an
  `as const` object with heterogeneous entries. Declare an explicit `EffectSpec`
  interface and cast once at module scope, as `meters.ts` does with `EXPOSURE`.

---

## The shape that survived review

- **NPC position is a pure function of the clock**: `poseAt(plan, id, minute)`.
  Never simulated forward, never accumulated, never saved. That one decision
  makes NPCs deterministic across frame rates, correct under both pause kinds,
  correct across the day boundary, and correct when a fax charges 100 minutes in
  one frame while `OfficeScene` is paused.
- **Paths are derived from the map, not authored**: BFS distance fields over the
  real tile grid, memoised per goal, traced with a heading-preserving tie-break
  so corridors do not staircase. A map edit re-routes the cast automatically.
  Same flood-fill primitive `findUnreachablePlaces()` already uses. No A*.
- **NPCs get no physics bodies.** Path-driven sprites that overwrite velocity
  fight Arcade separation; four pushable bodies in a two-tile doorway is a
  soft-lock waiting to happen.
- **Dialogue is an in-scene Win95 overlay** using the non-modal `'dialogue'`
  pause reason M2 built and left unused: the clock stops, `OfficeScene` keeps
  running and keeps input.
- **Favor tokens are per-NPC integers in `RunState.flags`**, which already
  round-trips, caps and coerces — `save.test.ts` has been exercising
  `flags['favor.steve']` since M2. No schema bump.
