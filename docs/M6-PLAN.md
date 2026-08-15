# M6 — implementation plan

Printer Jam, the IT ticket, and the dial-up cut.

Every measurement here was taken against the real source — Dijkstra over the
actual `OFFICE_MAP` and the actual `BALANCE.fax.minutes` arithmetic — and
independently re-derived by the review. Where an earlier number disagrees, the
earlier one was wrong.

---

## Decision: dial-up does not ship

Every verb a 1994 modem offers is already spoken for in this economy:

| The modem would… | …but the game already has |
| --- | --- |
| Send something | the fax, which is the Productivity engine |
| Deliver a bill later | `pendingReplyMinute` / `takeMisdialReply` |
| Put a screen at your desk you shouldn't be looking at | Solitaire |
| Give you somewhere nobody can see | the bathroom (`noticeMinutes: 999`) |
| Sell you information | Marjorie's favour sink |
| Teach a machine by breaking it | the nine `FAX_TOKENS` |
| Keep a mastered machine uncertain | `FaxJob.busyRoll` |

The architecture agrees independently, and this is the decisive part.
`MS_PER_GAME_MINUTE` is 687.5, so a **non-modal** minigame bills **87.3 in-game
minutes per real minute**: a thirty-second handshake costs 44 in-game minutes,
and the brief's three-fails path costs 131 before the escalation even starts.
Built **modal** instead, the world freezes for thirty real seconds out of a
330-second day with no input accepted — which is a cutscene, and one that
deletes its own joke by making the wait free.

Dial-up is the one minigame for which **both** existing patterns are wrong. That
is a diagnosis, not a puzzle to solve. It also has no gesture left: `interact()`
already gives "E at your own desk facing `TILE.DESK`" to the card table.

And "connection fails randomly" is a straight violation of assumption 22, which
this codebase enforces everywhere else.

**Precedent:** M4 cut the nodding minigame named in its own scope line, on
exactly these grounds. This is the same cut.

**What ships in its slot** is the half of the scope line that has a job: the IT
ticket, transplanted onto the printer. The brief's third bullet — *"IT Guy
unblocks your dial-up / prioritizes your ticket"* — survives verbatim, attached
to a machine that is physically in front of you and visibly broken. Dennis's own
shipped chatter already contains the design: *"I can raise a ticket. The ticket
will go to me. I'll see it tomorrow."*

The one non-redundant idea the modem had — a shared outside line raising
`fax.busyChance` for whoever is at the fax — belongs in M8 as an **event**, not
a minigame.

---

## There is room in the day. The premise was wrong.

A **mastered fax job is 14 in-game minutes, not 26.** `createMachine()` always
selects the wrong tray, so every session pays tray 2 + FEED 2 + LINE 2 + five
digits at 0 + START 2 + transmit 6. `fax.test.ts` asserted `<= 30` against a
comment claiming 26, so the error never failed a test and propagated into
planning.

Measured walks from the cubicle at (16,4), at 0.394 min/tile:

| Trip | Cost |
| --- | --- |
| Fax stand (34,13) | 9.3 min (6.4 on Shift) |
| Printer stand (34,12) | 9.4 min |
| Fax → printer | **0.4 min — the same trip** |
| IT closet (5,27) | 12.5 each way, 25 round trip |
| Bathroom | 10.1 each way, **20.2 round trip** |

A mastered day commits ~133 of 480 minutes; a fumbling week-one day ~211.
**Nothing has to give.** Minutes are not the scarce resource.

The scarce resources are the **tray** (a hard cap on Output — five typical jobs
already yield 88.7 of 100), **Rapport** (no passive drift, two earn sources
against five drains), and **desk-minutes** (the only source of Standing). M6 is
therefore priced against Rapport and Standing and never against the clock.

*(Note: DESIGN.md assumption 19 and a `balance.ts` comment both say the bathroom
is an "eleven-minute round trip". It is eleven minutes **each way**. Fix both or
neither.)*

---

## The printer is MODAL, and must reuse `'minigame'`

From the fiction: you are kneeling with the lid up and a toner cartridge in one
hand. Deliberation must be free, because the puzzle is a diagnosis with a right
answer that has to be reasoned out.

From the source, decisively: `BALANCE.sight.observers` marks only `dale` and
`pat` as reporters, and **neither ever enters the printer room** — both are
outside `sight.rangeTiles` from it all day. The only visitors are Marjorie and
Dennis, both `reports: false`. The fiction that justifies the non-modal pattern —
*"the world is still watching you"* — is factually false at that tile.

**Do NOT add a `'printer'` PauseReason.** This is the most expensive mistake
available in M6 and it is invisible. `samplePresence()` derives posture from the
string literal `pause.has('minigame')`, and `presence.busy` is the only posture
with zero drift. A new reason silently makes a printer session read as
`elsewhere`, bleeding Standing and adding Strain while an identical fax jam three
tiles away costs neither — retuning M3's economy by string comparison with no
test failing.

Belt and braces: derive posture from `pause.modal` rather than a reason name.

---

## Blocking defects to fix before building

1. **The fuser jam is unplayable-around.** As designed, a player following the
   one stated rule opens panel C, the machine says the edge is free, and pulling
   tears anyway because the fuser is hot — and nothing ever displays the "hot"
   state before the first pull. `rollSegment` is uniform, so **25% of jams
   deterministically shred a rule-following player on day one.** That is exactly
   what assumption 22 forbids. The lamp must be readable *before* the first pull.
2. **No per-day machine state.** The design holds a segment but not the tear
   count or an out-of-service state, so walking out and back re-creates the
   machine with `tears: 0` — defeating the escalation ladder, re-applying the
   Rapport hit, and re-arming the ticket indefinitely. Hold a
   `printerMachine` on the director, built once per day.
3. **The door/segment table has two exceptions it claims not to have.** One
   segment cannot be failed at all and another can only be failed, so on half of
   all jams the triage is either a formality or a trap.

---

## The honest read on whether it is fun

The review's verdict, which I agree with: the new verb is real — the fax asks
*what does this key do*, the printer asks *how much diagnosis do I buy* — and
nothing else in the game makes you purchase information. The three-word door
readings are a deduction grammar the fax has no equivalent of, and *"the diagram
inside panel A is for the 4ML and its arrows run the wrong way"* is the best joke
in the document.

But mastered, it is six charged minutes and four keystrokes for +2 Rapport, on a
walk you were making anyway. **That is a chore, not a toy.**

The fix is already in the design and is under-invested: the **witnessed vs
unwitnessed split** — fixing the printer is worth +2 if nobody sees you and +8 if
somebody does. That is the sharpest satire available here and it is currently
worth six points with no way to know who is walking in. Build the read, not the
eighth biro annotation.
