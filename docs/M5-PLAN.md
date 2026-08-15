# M5 — implementation plan

Fluffing, line-of-sight Visibility, and getting caught.

The design review's verdict on the first draft was that it was **"a timer with
extra steps"**, and it proved it with measurements rather than opinion. What
follows is what survived, what changed, and what is deliberately cut.

---

## Done

**Line of sight** — `src/sim/sight.ts`, pure and node-tested (11 tests).

A separate opacity grid from the walk grid, because *blocks walking* and *blocks
seeing* are different sets and the difference is the milestone. A desk hides
nobody. A cubicle partition hides a **seated** player and merely dims a standing
one.

**The fix that made it a game: screen exposure is gated on the observer's
facing, hard.** Dale parks at the end of your aisle for twenty-three minutes
facing away and cannot read your monitor for any of it. The threat is his
approach and his departure — two windows of a minute or two. Before the fix his
sight arrived in runs of `[27, 1, 1, 32, 27]` minutes against a 6-minute
threshold, which made the game a timetable to memorise; now it is a wave to read.

The measured profile is pinned by a test, so a future tuning pass that flattens
it back into a step function fails rather than quietly killing the milestone.

**The diagonal corner rule is deliberately asymmetric** and the catch depends on
it: a partition *corner* is a seam you can see through even seated; a partition
*face* is not. That is what makes a cubicle mouth a sightline. Making it
"consistent" would render the catch unreachable and M5 inert with no test
failing — so there is now a named test for exactly that.

---

## Decided, not yet built

### Solitaire takes no pause reason at all

The crux of the milestone, and all three design lenses plus the critique agreed
after verifying it against the source. `MODAL_REASONS` is only `summary` and
`minigame`; the card table holds **nothing**. The clock keeps running,
`syncCast()` keeps recomputing poses, `onMinute` keeps firing — so Dale keeps
walking down the aisle behind the card table in real time. The player is frozen
by calling `player.setFrozen(true)` directly, which is already independent of the
pause stack.

The fax is modal because it bills *per action* and deliberation must be free.
Solitaire is the exact inverse: it bills in real seconds and the world must keep
watching. They are opposite minigames and must not share a mechanism. Any hold at
all freezes Dale and deletes the threat the milestone exists to create.

### The hand survives Esc

Named by the critique as the best idea in the document, and the one feature that
carries the milestone: close the board, watch Dale walk past, reopen to the same
red nine on the same black ten. It only pays off because closing is now a
judgement call rather than either unnecessary or mandatory.

### Silence is common; speech is rare

Inverted from the draft, which gated the silent catch behind a lifetime counter
so most players would never see it. Dale looking, saying nothing, and walking on
is the funniest thing available and it is the whole joke about this office. The
written lines are the rare case.

### Getting caught destroys the hand and costs no meters

The critique called this "the single best-calibrated consequence in the design"
and it is the model for the rest: the sting is losing the game you were enjoying,
not a number going down. The draft's extra −14 Standing, +9 Strain and 6 charged
minutes on top is the game raising its voice, which the cutscene must not do.

---

## Blocking issues to fix during implementation

1. **`interact()` ordering.** The seat-and-facing-DESK check must come first, or
   an NPC standing in your cubicle mouth makes the board unopenable.
2. **A "tidying" posture must not be a timeout.** As drafted, sitting still for
   six minutes silently moved the player from `desk` (bossTarget 76) to `tidying`
   (68), retuning M3's honest-work economy by accident. Make it an explicit
   choice or give it identical Boss numbers.
3. **`spendMinutes` is re-entrant and this is a bug that exists TODAY.**
   `DayDirector.spendMinutes` checks only `run.phase` and the modal cap — not
   `pause.running` — and `advanceMinutes` fires MINUTE events synchronously. So
   `advanceTalk()`'s `spendMinutes(24)` already fires 24 MINUTE events *during* an
   open conversation. Any M5 state machine driven from `onMinute` must be
   re-entrancy-safe, and this is worth fixing on its own merits.
4. **Cold boot faces the wrong way.** `create()` builds the Player facing `down`;
   only `resetForNewDay()` faces them `up` at the desk. So "E at your seat facing
   the desk" fails on day one of every session — which is exactly when a player
   must discover Solitaire.

---

## Cut

- **Full Klondike.** Roughly the size of M3's fax machine, which was a whole
  milestone. The tension comes from the clock and the reflection, not from
  whether the red nine goes on the black ten. A cut-down deal with real rules is
  the deliverable.
- **The two-sink dialogue menu refactor.** That is M4 debt; it belongs in its own
  commit, not inside M5.
- **Pat's memo** as a second delayed-consequence system alongside the fax's
  misdial reply. Building the same pattern twice is the argument against it, and
  it creates M5's only silent unattributable penalty.
- **A meter bar that changes colour to warn.** The CRT reflection already signals
  it, and colour currently means one thing only (Stress is inverted because high
  is bad). Adding a second vocabulary to a UI whose discipline is having one.
- **`DayRecord.observations` / `solitaireWins`.** M7 groundwork, cheap but not
  needed by anything M5 does; it breaks two passing test files. Ship it with M7.

---

## Still open

The critique's sharpest remaining point: the board deliberately covers row 5 and
your cubicle mouth, so you commit blind and find out you were wrong seconds
later. With graded exposure that is now survivable — the reflection warns you —
but the **CRT reflection is the only warning the player gets, and it only exists
once the board is already open**. There needs to be a pre-commitment tell: some
signal, before you sit down, that Dale is mid-aisle. The obvious candidate is the
status bar noticing him, and it costs one branch in an evaluation that already
runs.
