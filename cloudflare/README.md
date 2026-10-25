# Říše on Cloudflare (Workers + Durable Objects)

**Status: experiment, runs locally only (`wrangler dev`). Nothing is deployed and no Cloudflare account is set up.**
The club server still runs on the VPS (`server/`, [docs/HOSTING.md](../docs/HOSTING.md)). Plan and costs: option C in
Richard's brain (`2-areas/krouzek/ai-agent-inbox/rise-on-cloudflare.md`).

## How it fits

| Node server (`server/`) | Cloudflare (`cloudflare/`) |
|---|---|
| `server.js`: HTTP, `/worlds`, `/health`, WebSocket, login | `router.js` (Worker `rise`): `/worlds`, `/health`, game files from `dist/` (+ the `louka-server` meta), `/ws?world=<id>` → that world's Durable Object |
| `profiles.js` + `players.json` | the same `profiles.js` inside the Durable Object `Profiles` (router), saved in its SQLite storage |
| `world-worker.js`: one thread per world, ticks 24/7 | `world.js`: one Worker **per world** (`rise-world-<id>`) with one Durable Object `World`; reads the `hello` (password, PIN/token via `Profiles`), then the same `room.js` + `sim.js` |
| `persist.js`: `world.json` + daily backups | `store.js`: the same `{ version: 2, world, players }` in the DO's SQLite storage, in 400 k-character chunks (2 MB per value) |

- **One Worker per world**, because `shared/` keeps the world in module variables and Durable Objects in one Worker may share memory.
  `gen-config.mjs` writes the wrangler configs from `WORLDS` (same syntax as the Node server) into `.gen/`.
- **A world runs only while someone plays.** The last player leaving saves it and stops the 20 Hz loop; the Durable Object
  then sleeps (costs nothing). Until the next player comes, nothing happens there (crops don't grow, the day stands still).
- **The client** adds `?world=<id>` to the WebSocket address (`client/src/menu/menu.js`), so the router can send the
  connection straight to the world. The Node server ignores it. Without it (an old page) the player lands in the first world, which answers
  `['worlds', …]` if they wanted another one.
- Data in the EU (`jurisdiction('eu')`, `store.js` `doId`).
- **Moving from the VPS** (once, right after the first deploy, before anyone joins):
  `POST /admin/import/players` with `players.json`, `POST /admin/import/world/<id>` with that world's `world.json`,
  header `Authorization: Bearer <ADMIN_PASSWORD>`. Both refuse to overwrite live data.

## Run and test (your own computer, no account)

```bash
npm run build                 # in the repo root: the game into dist/
cd cloudflare && npm install  # wrangler (only here, not in the game's package.json)
ROOM_PASSWORD=heslo npm run dev   # http://127.0.0.1:8788 (data in cloudflare/.gen/state)
npm test                      # router + 2 worlds: password, PIN/token, edits, isolation, backpack, restart, import (~30 s)
npm run test:browser          # the real game in 2 browsers against wrangler dev, then a restart (~3 min)
```

## Not done yet

- `/admin` page (player list, PIN reset) and `node server/admin.js`: only the import endpoints exist.
- Catching up crops, furnaces and the day clock after a world has slept.
- A deploy workflow (`wrangler deploy` from GitHub Actions only when `/health` shows nobody playing), a Cloudflare API
  token in GitHub secrets, `ROOM_PASSWORD`/`ADMIN_PASSWORD` as Worker secrets for the router and each world, a hostname.
- CI does not run `cloudflare/` tests yet (that needs a change in `.github/`).
- A load test (`tests/load/bots.mjs`) against wrangler dev. (Single player and the browser host don't use any of this.)

## Deploying (needs Richard: account, plan, hostname)

```bash
node gen-config.mjs                                  # WORLDS=… like on the VPS
for c in .gen/world-*.jsonc; do npx wrangler deploy -c $c; done   # worlds and router bind to each other: the very
                                                                  # first deploy may need a second round (not tried yet)
npx wrangler deploy -c .gen/router.jsonc
npx wrangler secret put ROOM_PASSWORD -c .gen/router.jsonc        # and for every .gen/world-*.jsonc
```
