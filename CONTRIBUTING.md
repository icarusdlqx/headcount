# Working on HEADCOUNT

This project is built so that the **writing and the balance can be changed
without touching any code**. If you are here to make the jokes land better or to
make the game harder, everything you need is in two places and neither is
programming.

---

## Getting it running

You need [Node](https://nodejs.org) (version 20 or newer) installed once. Then,
in a terminal, from the project folder:

```bash
npm install
```

That is a one-time setup. After it finishes:

```bash
npm run dev
```

Open **http://localhost:5173** and the game is running. Leave that command
running while you work — **the page reloads by itself every time you save a
file**, so you can change a line, hit save, and watch it in the game a second
later.

Stop it with `Ctrl-C`.

---

## The two things you own

### 1. Every word anybody says — `src/content/`

| File | What's in it |
| --- | --- |
| `npcs.json` | The cast. Chatter, stories, greetings, favours, the Steve scene, everything Dale says when he catches you |
| `fax.json` | The fax machine's display, and what happens when you send or misdial |
| `printer.json` | The printer's panels and the outcomes |
| `dayEnd.json` | The Daily Activity Summary, the weekend lines, the morning openers |
| `interactions.json` | What you see when you press E on furniture |
| `hud.json` | The status bar, the meter names |

These are plain text files. A line of Marjorie's chatter looks like this:

```json
"The plant by the boss's office is plastic. I dust it anyway. It's not the plant's fault."
```

Change the words between the quotes and it's changed in the game. Add a new line
by copying an existing one, putting a comma after the previous one, and writing
yours. **Keep the commas and the quotes** — those are the only rules.

If the game stops loading after you edit a file, it's almost always a missing
comma or a stray quote. Undo your last change and try again more slowly.

**Apostrophes are fine** (`don't`), but a double quote inside a line needs a
backslash: `\"like this\"`.

### 2. Every number — `src/config/balance.ts`

One file, heavily commented, holding every tunable value in the game: how long a
workday is, how much Rapport covering for Steve pays, how many minutes a story
costs, how close the boss has to be before he notices your card game.

It looks like this:

```ts
/** Real seconds for one full 9-to-5. 480 game-minutes / 330s = 687.5ms each. */
realSecondsPerDay: 330,
```

Change `330` to `600` and days take ten minutes instead of five and a half. Every
number has a comment saying what it does and, usually, *why it is that value* —
those comments are the argument, so if you disagree with one, that's the thing to
push back on.

**Ignore the `.ts` extension.** You are editing numbers between a colon and a
comma. That's all.

---

## Checking you didn't break anything

```bash
npm test
```

That runs about 120 automated checks in a couple of seconds. If they all pass,
you have not broken the game's logic. Some of them deliberately guard design
decisions — for example, one fails if the printer ever pays Productivity, and one
fails if the boss's line of sight becomes an on/off switch rather than something
that fades in and out — so if a test fails after you change a number, **read
what it says before changing the test**. It is usually telling you something true.

---

## Three rules the whole game is built on

Worth knowing before you retune anything, because most of the design follows from
them:

1. **Most actions move two meters in opposite directions.** Covering for Steve
   buys Rapport and costs Output. Reporting him buys Standing and costs Steve.
   If a change makes something a pure win, that's a bug, however good the number
   looks on its own.
2. **Never punishing.** Failure is funny. Getting caught costs six Standing and
   your card game; it doesn't cost your afternoon. If a change makes failure
   sting rather than land, it's gone the wrong way.
3. **Every failure traces back to a decision.** The printer always tells you
   whether pulling is safe before you can pull. The boss can always be seen
   coming. Nothing is decided by a dice roll the player couldn't read.

---

## If you want to change code as well

The full design, the milestone history and the reasoning behind every major
decision live in [`DESIGN.md`](DESIGN.md), with a numbered list of assumptions at
the bottom — those are the decisions that were made deliberately and the reasons
why. `docs/` holds the plans for individual milestones, including the arguments
for things that were **cut**.

The layout is in the [README](README.md#repo-layout). The short version:
`src/sim/` is pure game logic with no graphics in it (and is where the tests
point), `src/scenes/` and `src/ui/` are what you see, `src/world/` is the office
map — which is drawn as **ASCII text** you can edit like a picture.

---

## Sending changes back

```bash
git pull            # get the latest before you start
git add -A
git commit -m "Marjorie: three new lines about the fourth floor"
git push
```

If `git push` says you don't have permission, you need to be added as a
collaborator on the repository — ask Dave.

Small commits with a clear message beat one big one. If you're unsure about a
change, push it to a branch instead and it can be looked at before it goes live:

```bash
git checkout -b marjorie-lines
```
