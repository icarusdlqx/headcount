# HEADCOUNT

A satirical top-down pixel-art office simulator set in a 1990s corporate office.
You are a low-level employee. There are tasks. There is a favor economy. There
will be a Performance Review on Friday.

Think Stardew Valley's daily loop meets Papers, Please's moral compromise,
rendered entirely in beige.

**Play it:** <https://headcount.ligand-ave.workers.dev> — deploys automatically
on every push to `main`. See [Deploying](#deploying).

**Status:** M6 — the workday runs 9-to-5 in about five and a half minutes, you
have five meters and real work to do, four colleagues on real schedules, and
neither the fax machine nor the printer is on your side. The boss can only catch
you at Solitaire if he can actually see your screen. Friday's Performance Review
is next. See [DESIGN.md](DESIGN.md) for the full spec, the milestone roadmap, and
the running list of assumptions.

---

## Local development

Requires Node 20+.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm test` | Vitest — clock, day/week rollover, save round-trip and repair |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` on its own |

### Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | Walk |
| Shift | Walk with purpose (nobody runs here) |
| E or Space | Use the fax machine, or look at whatever you are facing |
| Q W E / A S D | The fax machine's six function keys (at the machine) |
| 0-9 / Enter / T / Esc | Dial · send · flip tray · give up |
| Enter / Space / Esc | Dismiss the end-of-day summary |

### Dev flags

Append to the URL:

- `?debug=1` — FPS, tile coords, clock minute, day, pause reasons and the seed
- `?seed=1234` — pin the RNG seed. This also makes it a **scratch run**: nothing
  is loaded, saved or cleared, so replaying a seed can't clobber a real week
- `?timescale=12` — burn through days fast. Requires `?debug=1`
- `L` (with `?debug=1`) — end the current day immediately

The seed is derived from the calendar date on first boot and then persisted, so a
run stays replayable across sessions.

In dev builds the game is exposed as `window.game`, plus
`window.headcount.wipeSave()` and `window.headcount.dumpSave()`.

---

## Deploying

**Pushing to `main` is the deploy.** The repository is connected to Cloudflare,
which runs `npm run build` and then `npx wrangler deploy` on every push; the
live site follows `main` by a couple of minutes. Pushes to any other branch get
their own preview URL and leave production alone.

The manual command still works and does the same thing without a push:

```bash
npm run build && npx wrangler deploy
```

Two things worth knowing:

- **The build does not run the tests.** `tsc` gates it (a type error never
  reaches the live site), but a failing test sails through — `npm test` before
  pushing to `main` is on you.
- **If deploys silently stop,** look for a "disconnected from your Git account"
  banner under **Settings → Build** in the dashboard. The fix is not the
  disconnect button; it is re-granting the Cloudflare Workers and Pages GitHub
  App access to this repository at <https://github.com/settings/installations>.

Full details, including caching and deploying without pushing, are in
[docs/HOSTING.md](docs/HOSTING.md). No GitHub Actions workflow is needed.

---

## Repo layout

```
src/
  main.ts              Phaser game config and entry point
  config/balance.ts    EVERY tunable number. Designers live here.
  content/             Dialogue, summary and event text as JSON. Writers live here.
  sim/                 Clock, day/week state, pause stack, events. Pure logic.
  save/                Schema, coercion, storage backend, save service.
  scenes/              Boot, Office, DayEnd
  entities/            Player, and later the NPCs
  world/               ASCII office map, tile vocabulary, room bounds
  art/                 Palette and the procedural placeholder art
  ui/                  Windows 95 chrome, HUD, formatting, summary view-model
  util/                Seeded RNG and URL flags
```

`src/sim` and `src/save` import nothing from Phaser or the DOM, which is what
makes them testable in plain node — and what keeps the rules about determinism
enforceable rather than aspirational.

Two rules keep the project tunable by two people at once:

- **No hard-coded balance numbers outside `src/config/balance.ts`.**
- **No player-facing prose outside `src/content/`.**
