# Hosting HEADCOUNT

The game is a static site — no server, no database, no API. Anything that can
serve files can host it. This is the same setup as IRONLINE, including the
things that are easy to get wrong.

## Cloudflare (what this repo is set up for)

Cloudflare builds straight from the repository, so a push to `main` is a deploy.

Connecting a repo now creates a **Worker serving static assets** rather than a
Pages project — the same thing for a static site, but the dashboard looks
different and the address is `*.workers.dev` rather than `*.pages.dev`.

The live URL is under **Workers & Pages → the project → Domains**, and it has an
enable switch that is **off by default**. With it off, the Overview tab reads
"No URLs enabled" and nothing is reachable however well the build went. This is
the single most common reason a successful deploy appears not to work.

**Settings**, under **Workers & Pages → your project → Settings → Build**:

| Field | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Production branch | `main` |

Node version comes from `.node-version` in the repository root, so there is
nothing to set for it.

### wrangler.jsonc is not optional

A Worker build runs the build command and then `wrangler deploy`. That second
step reads `wrangler.jsonc` to learn there is no server-side script here, just a
directory of files:

```jsonc
{
  "name": "headcount",
  "compatibility_date": "2026-08-01",
  "assets": { "directory": "./dist" }
}
```

Without that file the build compiles fine and the deploy fails, which looks like
"the build failed" while the placeholder Worker carries on serving **Hello
world** at the live URL.

`"name"` must match the Worker in the dashboard. If it does not, the deploy
creates a *second* Worker and the URL you already have keeps serving the
placeholder.

Validate any change to it without deploying, and without credentials:

```sh
npx wrangler deploy --dry-run
```

An older-style Pages project does not need this file at all, which is why
IRONLINE does not have one.

`npm run build` runs `tsc --noEmit` before Vite, so a type error fails the
Cloudflare build and never reaches the live site.

### Deploying on command rather than on push

Every push to `main` deploys. To publish without pushing, open the project in
the dashboard, go to **Deployments**, and use **New deployment**.

Pushing to any other branch produces a preview deployment on its own URL and
leaves production alone — which is the way to look at a change before it is
live. Useful when two people are tuning `balance.ts` and disagree.

### Caching

`public/_headers` is copied into the build output and read by Cloudflare.
Fingerprinted assets are cached for a year; `index.html` is not cached at all.
Without that second rule, a browser that has played once keeps loading the build
it first saw.

## Somewhere else

`npm run build` writes a plain static site to `dist/`. Upload that directory
anywhere — Netlify, an S3 bucket, a folder on a web server. The build uses
relative asset paths (`base: './'` in `vite.config.ts`), so it works from a
domain root or a subdirectory without configuration.
