# HEADCOUNT

A satirical top-down pixel-art office simulator set in a 1990s corporate office.
You are a low-level employee. There are tasks. There is a favor economy. There is
a Performance Review on Friday.

Think Stardew Valley's daily loop meets Papers, Please's moral compromise,
rendered entirely in beige.

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

## Deploying to Cloudflare Pages

Pages builds this repo directly; there is no backend and no environment config.

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Pick the `headcount` repo and authorise access.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/`
   - **Node version:** set `NODE_VERSION` to `20` (or newer) under
     Settings → Environment variables, if the default image is older.
4. Save and deploy. Every push to `main` redeploys; pull requests get preview
   URLs automatically.

No GitHub Actions workflow is needed — Pages handles CI.

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
