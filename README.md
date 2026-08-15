# HEADCOUNT

A satirical top-down pixel-art office simulator set in a 1990s corporate office.
You are a low-level employee. There are tasks. There is a favor economy. There is
a Performance Review on Friday.

Think Stardew Valley's daily loop meets Papers, Please's moral compromise,
rendered entirely in beige.

**Play it:** <https://headcount.ligand-ave.workers.dev> — published from `main`
on every push.

**Status:** M1 (skeleton) — the office exists and you can walk around it.
See [DESIGN.md](DESIGN.md) for the full spec and the milestone roadmap.

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
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` on its own |

### Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | Walk |
| Shift | Walk with purpose (nobody runs here) |
| E or Space | Look at whatever you are facing |

### Dev flags

Append to the URL:

- `?debug=1` — FPS, tile coordinates and the active RNG seed, top-left
- `?seed=1234` — pin the daily RNG seed so a day replays identically

Without `?seed`, the seed is derived from the calendar date, so everyone playing
on the same day gets the same office nonsense.

In dev builds the running game is exposed as `window.game` for console poking.

---

## Deploying

Cloudflare builds straight from the repository, so **a push to `main` is a
deploy**. Set up once:

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a
   repository**. Pick `icarusdlqx/headcount`.
2. Build command `npm run build`, output directory `dist`, production branch
   `main`. Node version comes from `.node-version`, so leave it alone.
3. **Turn the URL on.** Project → **Domains** → enable the `*.workers.dev`
   address. It is off by default, and until it is on the Overview tab says
   "No URLs enabled" and nothing is reachable however well the build went.

After that, every push to `main` redeploys automatically. Pushes to any other
branch get their own preview URL and leave production alone.

Full details, including caching and deploying without pushing, are in
[docs/HOSTING.md](docs/HOSTING.md). No GitHub Actions workflow is needed.

---

## Repo layout

```
src/
  main.ts              Phaser game config and entry point
  config/balance.ts    EVERY tunable number. Designers live here.
  content/             Dialogue and event text as JSON. Writers live here.
  scenes/              Boot, Office (day loop, meters and minigames land here)
  entities/            Player, and later the NPCs
  world/               ASCII office map, tile vocabulary, room bounds
  art/                 Palette and the procedural placeholder art
  ui/                  Windows 95 chrome and the HUD
  util/                Seeded RNG
```

Two rules keep the project tunable by two people at once:

- **No hard-coded balance numbers outside `src/config/balance.ts`.**
- **No player-facing prose outside `src/content/`.**
