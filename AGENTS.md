# AGENTS.md: how this game is built, and the rules for AI helpers

You are helping kids (10–14) in an AI coding club change a browser game together. Talk to them in simple Czech,
explain what you change, keep changes small, and ask before big ones.

## The game in one minute

*Říše* (repository *rise*, formerly *louka*) is Marek's survival/building game in the browser (Three.js): endless terrain with
biomes, a voxel underground, trees, animals and night monsters, crafting (~260 recipes), cooking, farming,
furnaces, electricity, cars, a bicycle, boats (motor and sail), a biplane and a seaplane, a garage, lakes, a computer with games
and a printer, and the Mark dimension behind a portal.
The full feature list is [docs/FEATURES.md](docs/FEATURES.md); read it before adding something.

There are **three ways to play, with one set of rules and one protocol**:

| Mode (menu button) | Who holds the world | Connection | Saved in |
|---|---|---|---|
| **Hrát sám** | this browser | none | `localStorage` (`rise-svet-v2`) |
| **Další možnosti → Vytvořit hru na svém počítači** | the host's browser tab (host = player `'host'`) | PeerJS code `LOUKA-XXXX` | host's `localStorage` (`rise-server-v1`) |
| **World buttons** (club server, `npm start`) | Node.js process, no player; one or more worlds (`WORLDS`) | WebSocket straight into the chosen world (+ password, asked once; + player name and PIN, asked once per device) | `DATA_DIR/<world>/world.json` + daily backups; player profiles in `DATA_DIR/players.json` |

Players who join a browser host by code keep their own backpack/position in their browser (`rise-klient-<code>`).
On the Node server every player has a **profile** (nickname + 4-digit PIN, server-wide, `server/profiles.js`), and the
backpack, armor, position and health live **on the server**, per profile and world (`players` inside that world's
`world.json`). The browser only remembers a login token per server address (`rise-hrac`). An old backpack from before
profiles (`rise-klient-<address>#<world id>`, the first world also `rise-klient-<address>`) is sent up once and then removed.

## Folder map

```
index.html            menu + HUD markup (styles in client/src/styles/game.css)
client/src/           the browser: drawing, sound, input, UI, the player, vehicles, eating, computer
shared/               game rules and data, no DOM, no Three.js: runs in the browser AND in Node.js
server/               Node.js server: the same rules + WebSocket + saving to disk
tests/                unit tests (node:test) and play-tests in a real browser (Playwright)
deploy/               VPS setup (systemd + Caddy)
docs/                 features, plan, hosting, known issues, message for the kids
legacy/index.html     Marek's original single file (reference only, do not edit)
```

| Where | What lives there |
|---|---|
| `shared/data/items.js` | items (tools, armor, food, ingredients, utensils), basic recipes, stove cookbook `KITCHEN`, crops `CROPS`, campfire `COOKING`, block list `BLOCKS` |
| `shared/data/blocks.js` | building blocks: stones, stairs/slabs, biome blocks, glass, concrete and dyes |
| `shared/data/tech.js` | ores, furnace (`FURNACE_ONLY`, `FUEL`), workshop parts, engines, vehicles, computers, electric devices |
| `shared/data/costumes.js` | suits for *Můj oblek* (`SUITS`, colours, emblems), `cleanCostume`, the short text `encodeCostume` sent in the pose (`lk`) |
| `shared/data/index.js` | **import data from here**; finalizes recipes (grid pattern, category) once |
| `shared/world/terrain.js` | terrain height, biomes, ponds and lakes (`lakeOf`; `pondOf` returns a lake when near one; its GLSL twin is `client/src/render/glsl.js`, keep them identical) |
| `shared/world/voxels.js` | the underground (what is where naturally, player edits, `setVox`, `groundHeight`) |
| `shared/world/state.js` | **the world state**: blocks, chests, fires, stoves, crops, furnaces, power, vehicles, papers… (`SyncMap` sends changes) |
| `shared/world/save.js` | `loadWorld(save)` / `worldState()` – the save shape used everywhere |
| `shared/world/nature.js`, `structures.js`, `collision.js`, `torch.js` | trees, rocks, shards, ponds; structures and their builders; what is solid; torches (stand or hang on a wall, kept in `blockMeta`: 1 = stands, 2–5 = on a wall; pop off without support) |
| `shared/sim/*.js` | simulations: `day.js`, `mobs.js` (AI, spawning, spawners), `ground-items.js`, `machines.js` (campfire, furnace, stove, crops), `power.js` (grid, printer), `weather.js` (rain, storm, fog and the wind `windAt` from the day number and time: the same for every player, never sent) |
| `shared/net/net.js` | the `NET` object the rules talk to (mode, `op()` for world changes, hooks) |
| `shared/net/ops.js` | applying world changes from others (`applyOp`), small maps diff (`kvDiff`, `applyKV`) |
| `shared/net/room.js` | **the host**: accepts players, handles their messages, broadcasts (browser host and Node server) |
| `shared/events.js` | events from rules to the browser (`emit('mobHit', m)` → sparks and sound) |
| `shared/tools.js` | tools and combat rules: durability and wear, mining speed, attack charge and crits, repair in the crafting grid |
| `client/src/main.js` | entry point: menu, then the game modules |
| `client/src/menu/` | main menu (world buttons first from `GET /worlds`, then *Hrát sám*, then *Nastavení · Další možnosti*; club password asked once; player name + PIN asked once per device, then "Hraješ jako X · Změnit hráče"; *Další možnosti*: host in the browser / join by code) and settings |
| `client/src/game/` | boot (`NET` setup), prefs, save/load in the browser, the frame loop `loop.js` (`tick`), `debug.js` (`window.game`) |
| `client/src/render/` | renderer, sky, textures, icons, ground, grass, forest, blocks, underground meshes, particles, held item + first-person suit hand, day/night colours; `character.js` = the suit model, armor plates and animation (no side effects, the menu uses it too); the graphics look and what each Grafika tier turns on (`look.js`), post-processing (`post.js`), shadows, clouds, water, weather, embers/smoke (`ambient-fx.js`). Grafika Automaticky: `client/src/game/gpu.js` |
| `client/src/player/` | player movement and collisions, aiming, mining/placing/using, backpack, survival, eating |
| `client/src/mobs/` | `mob-models.js` creature 3D models; `mobs.js` animation and life (`poseMob`), sounds, sparks (behaviour is in `shared/sim/mobs.js`) |
| `client/src/audio/` | all sound (WebAudio synthesis): `sound.js` mix + `Sound.at(x, y, z, fn)` positional sound, recipes in `sfx.js` / `voices.js`, materials, ambience, machine hums, music; `soundscape.js` runs it each frame |
| `client/src/ui/` | HUD, inventory window, touch controls |
| `client/src/machines/`, `pc/`, `dining/`, `world/` | the browser side of machines (garage block model `garage-model.js`), the computer + Tanks + documents, table manners, shrine/fishing/dropped items |
| `client/src/vehicles/` | `kinds.js` (data: names, sizes, seats, upgrades per vehicle type), `car.js` (chain module: get in/out, drawing all vehicles, cameras, nitro, car driving), `bike.js`, `boat.js` (motorboat, sailboat, wake), `plane.js` (chain module: biplane + seaplane), models `car-model.js`, `bike-model.js`, `boat-model.js`, `plane-model.js` + their shared look `veh-look.js` (paint, glass, tyres, rims, merging, lights), `garage.js`, `passengers.js`, `vehicle-ui.js` (HUD line, vehicle window) |
| `client/src/net/` | multiplayer in the browser: client side (`multiplayer.js`), avatars (other players, own body + third-person view, name tags), chat + Esc menu, the net loop (`mp-start.js`) |
| `server/` | `index.js` (env config), `worlds.js` (`WORLDS` list, moving old data), `server.js` (HTTP + WebSocket, logs players in, sends each player's messages to their world), `profiles.js` (player profiles: name + PIN, tokens, wrong-PIN throttle, `players.json`), `world-worker.js` (one world in its own thread: room + 20 Hz loop + saving + the players' backpacks), `me.js` (checks a player's state before it is saved), `sim.js` (one world step), `persist.js` (saving + backups), `admin-http.js` (`/admin` page + local admin port), `admin.js` (CLI: `players`, `reset-pin`), `static.js`; owner and donations (Richard's, see rule 11): `owner.js` (`OWNER_ID`, `isOwner`), `donation-box.js` (the box at the statue, in the world thread), `donations.js` (ledger + gifts, `DATA_DIR/donations.json`), `donations-admin.js` (`/admin/dary`), `army-owner.js` (the owner also commands Marek's army), `owner-wand.js` (the owner's wand and its spells, in the world thread; hunt rules `shared/sim/hunt.js`), `prison.js` (the owner's prison: `/vezeni`, `/propustit`, release for spider eyes; the place itself is `shared/world/prison.js`) |

## How it fits together

- **Rules vs. drawing.** Code in `shared/` changes the world and calls `emit('event', …)`; the browser listens with
  `on('event', …)` (`shared/events.js`) and draws sparks, plays sounds or rebuilds meshes. The server listens to nothing.
  Example: `hurtMob()` (shared) emits `mobHit`; `client/src/mobs/mobs.js` makes sparks and a sound.
- **World changes are sent automatically.** `blocks.set(k, 'planks')` on a `SyncMap` calls `NET.op(['m', 'blocks', k, v])`;
  the net loop sends collected ops. Small maps (chests, machines…) are compared as JSON and changed keys are sent.
- **Who simulates.** Whoever holds the world (single player, the host tab, the Node server) runs mobs, machines,
  power, day time. A joined player only shows what the host sends (`NET.client` is true there).
- **Browser modules run in a fixed order.** Marek's game was one big script; to keep it working exactly the same,
  every module in the chain first imports the previous one (the line with `// pořadí spouštění`), and `main.js`
  imports the last one. Order: `game/boot → game/prefs → game/save-load → render/renderer → render/sky →
  render/textures → render/icons → render/icons-blocks → world/papers → world/dig → render/icons-food → render/ground →
  render/grass → render/fireflies → world/world-state → render/forest → render/shards → world/shrine → render/blocks →
  render/vox-mesh → render/particles → audio/sound → player/inventory → ui/inventory-ui → machines/kitchen →
  machines/furnace → machines/power → pc/computer → pc/tanks → pc/printer → pc/papers-world → pc/doc-view → pc/editor →
  player/player → render/held-item → player/targeting → player/interaction → mobs/mobs → world/structures →
  render/dimension → world/ground-items → world/fishing → vehicles/car → vehicles/plane → player/eating →
  dining/dine-view → dining/food-models → dining/dining → player/survival → render/daylight → ui/hud → game/save →
  ui/touch → game/loop → net/multiplayer → net/avatars → net/mp-ui → net/mp-start → game/debug`.
  Side-effect-free helpers outside the chain (e.g. `vehicles/kinds.js`, `bike.js`, `boat.js`, `garage.js`, `passengers.js`,
  `vehicle-ui.js`, the vehicle models `*-model.js` + `veh-look.js`, `render/icons-vehicles.js`, `machines/garage-model.js`) may be imported from anywhere; in a file that also imports
  `vehicles/car.js`, import them after it, so they load inside the chain order.
  A **new browser module** either has no side effects at load time (only functions/constants; then no chain line
  is needed), or it gets a chain line and is inserted into the chain (check that `npm test` and the play-tests still pass). Modules in `shared/` never import `client/`.
- **`window.game`** (`client/src/game/debug.js`) exposes the game for the console and the play-tests. Keep it working.

## Protocol

Messages are arrays, the same over PeerJS and WebSocket (JSON). Host = `shared/net/room.js`, client = `client/src/net/multiplayer.js`.

- Client → host: `['ops', creative, ops]`, `['kv', changes]` (5×/s), `['pose', pose]` (12×/s; optional fields `lk` = the suit as
  `suit.colour.light.visor.emblem`, e.g. `'pilot.9.0.1.4'`, and `sn: 1` while sneaking, `pv: 1` with fights switched on by the key N; the host passes the pose on unchanged), `['pk', gid]` pick up,
  `['hit', nid, dmg, yaw, kb?]` (kb = knockback 0–2, default 1), `['phit', pid, dmg, yaw, kb, ranged]` hit another player (only in a
  `pvp` or `pvp-mark` world: the host checks reach 7 m / 90 m for arrows, 0.45 s invulnerability, no dead or creative players, then sends the target
  `['dmg', dmg × 2.5, dx, dz]`; in a `pvp-mark` world the host also needs attacker and target in Markova dimenze, `isMark(x)`; `hitPlayer` in `shared/net/room.js`), `['pull', 'p'|'m', pid|nid, x, y, z]` fishing rod pulls a hooked player / mob to x, y, z (must be within 5 m of the one pulling; the player gets `['tp', x, y, z, byName]`), `['mu', nid]` eggs/milk, `['print', key, paperId, copies]`, `['giveTo', pid, docId]`, `['chat', text]`.
- Host → client: `['welcome', { pid, name, perm, world, spawn, max }]`, `['full']`, `['join'|'leave', name]`, `['ops', ops]`,
  `['kv', changes]` (2×/s), `['pl', [[pid, name, pose, perm]…]]` (12×/s), `['mobs', dayTime, day, [[nid, type, x, y, z, ry, hp, flash, dead, eggs, milk, hunt]…]]` (5×/s; `hunt` = 1: red eyes, the mob hunts a player, *Štvanice*; an older host leaves it out = 0),
  `['give', id, n, w?]` (w = tool wear), `['swap', from, to]`, `['dmg', n, dx, dz]`, `['perm', bool]`, `['toast', text]`, `['goto', world]` (only to the player Marek after his `/svet`: the browser leaves and the menu joins that world), `['pvlock', s]` (you were in a fight started by N: fights can't be switched off for s seconds), `['chat', name, text]`, `['score', [[name, points, falls]…]]` and `['kill', killer|null, victim]` (arena in a `pvp` world: the host sees a player's pose turn `alive: false` and credits the last hitter within 10 s, `arenaDeath` in `shared/net/room.js`; in a `pvp-mark` world only `kill` with a killer, no `score`), `['gift', docId, from]`,
  `['kick', reason?]` (the browser host sends no reason; the Node server sends `['kick', 'Přihlásil ses jinde.']` when the same player logs in again in that world),
  `['restart']` (Node server only, when it stops, e.g. an automatic update: the browser sends `me` at once, waits
  until a new server answers `/health`, reloads and joins the same world again; `rejoinAfterRestart` in `client/src/net/mp-ui.js`).
- **Vehicles in the pose** (the host passes it on unchanged, `client/src/vehicles/car.js` `vehPose`): the driver sends
  `veh: { id, x, y, z, yaw, pitch, roll, spd, steer, thr, lights }` (or `null`) with optional `bm` (sailboat boom angle),
  `lf: 1` (sail luffing), `pd: 1` (pedalling a bike), `nb: 1` (nitro burning), and `hn` = horn count. A **passenger** sends
  `rd: { id, s }` (vehicle id, seat index ≥ 1 from `vehicles/kinds.js`) and no `veh`; others read taken seats from these
  poses, so a seat frees itself when the passenger gets out or leaves. Seats are never stored in the world. The vehicle
  itself (`vehicles` small map: colour, fuel, `mods` from the garage, `gear`, sail `thr`/`boom`) syncs like other small maps.
- Ops: `['m', 'blocks'|'blockMeta', key, value|null]`, `['s', 'removed'|'ruinsOpened', key]`, `['r', structure]`, `['v', x, y, z, id]`,
  `['c', x, z, r]` grass cut, `['p']` portal, `['g', gid, id, n, pos, vel, delay, w?]` dropped item (w = tool wear, only for worn tools), `['gx', gid, n]`.
- WebSocket only (Node server, `server/server.js`): the client first sends `['hello', { name, pass, v: 2, world, pin | token }]`.
  A wrong password gets `['denied', 'password']`. A known `world` id joins that world. A new client (`v: 2`) without
  a world or with an unknown one, on a server with several worlds, gets `['worlds', [{ id, name, creative, players, max }…]]`
  and can send `hello` again with a chosen `world`. An old client (no `v`) and every client on a
  one-world server join the first world. The welcome then also has `worldInfo: { id, name, creative, first }`
  (added by `server/world-worker.js`; the browser host doesn't send it). It also has `pvp` (players can hurt each other,
  world option `:pvp` in `WORLDS`; the client sets `NET.pvp` from it) and `pvpMark` (fights only in Markova dimenze, no arena,
  option `:pvp-mark`; `NET.pvpMark`). `GET /worlds` entries have `pvp` and `pvpMark` too. `GET /worlds` returns the same list over HTTP
  (no password, `Access-Control-Allow-Origin: *`): the main menu shows a button per world from it and sends the
  chosen `world` in the first `hello` (the password comes from `localStorage` `rise-heslo`, per server address).
- **Player profiles** (Node server only, `server/profiles.js`): after the password and the world, the hello must carry the
  nickname plus either a 4-digit `pin` or a remembered `token`. New name + PIN creates a profile; existing name + right
  PIN or a valid token logs in. On a PIN login the server first sends `['token', t]` (the browser stores `{ name, token }`
  per server address in `rise-hrac`; the server keeps only SHA-256 hashes, last 5 per profile). Refusals:
  `['denied', reason, { text, wait, left, exists }]` with reason `'needpin'` (no PIN/token; `exists` = name taken),
  `'pin'` (wrong PIN; `left` tries), `'wait'` (5 wrong PINs per name + IP: wait `wait` s), `'badpin'` (not 4 digits),
  `'name'` (2–16 characters, not *Hráč*; `text` says why), `'token'` (unknown token, e.g. after a PIN reset). The
  connection then closes; the client asks again. The same profile already in that world: the old connection gets
  `['kick', 'Přihlásil ses jinde.']` and is closed. The welcome also has `me`: that player's saved state in this world
  (`null` = first time; added by `server/world-worker.js`). The client sends `['me', { inv, armor, pos, yaw, hp, hunger,
  crafted, placedAny, creative, flying, flyT, look, magic }]` every 10 s and when leaving (`look` = the suit object, optional, cleaned by
  `cleanCostume`; `magic` = `{ xp, learned, sel, picks }`, optional, cleaned by `cleanMagic` in `shared/data/magic.js`; the newer of server and browser wins by its time `t`); the world thread checks it (`server/me.js`:
  ≤ 64 KB, 36 + 4 slots, known item ids; a slot is `{ id, n, w? }`, `w` = tool wear) and saves it in `world.json` → `players[profile id]`. The browser host ignores `me`.
- **Donation box** (Node server only; the statue `shared/world/statue.js` is built by `server/sim.js`): client → `['dary']` (state),
  `['donate', id, n, w?]` (one slot, already removed from the backpack; the server gives it back with `give` if it refuses),
  `['take', index, id]` (owner only: the server checks the profile against `OWNER_ID` and refuses everyone else with a `toast`
  and a fresh `dary`); server → `['dary', { top: [[name, items]…], owner, ownerName, box: [[id, n, w]…] | null }]` (on join, after
  each change; `box` only for the owner). The world thread handles them before the room (`server/donation-box.js`); the browser
  host ignores them. Ops that touch a statue block (`fixed` in `shared/data/blocks.js`) are dropped and the sender gets the real block back.
- **Owner's wand** (Node server only, `server/owner-wand.js`, handled in the world thread before the room; the browser host ignores it):
  client → `['ospell', spell, 'm' | 'p', nid | pid]` (`spell` = `'avada'` Avada Kedavra or `'hunt'` Štvanice). The server checks the
  profile against `OWNER_ID` (anyone else gets a `toast`), the caster's pose and reach (60 m), then kills the mob, or the player
  through `hitPlayer(…, kill)` in `shared/net/room.js` (only in a `pvp` world or a `pvp-mark` world with both in Markova dimenze:
  `['dmg', 1000, 0, 0]`), or starts the hunt (`startHunt`, `shared/sim/hunt.js`). Item `owner_wand` (`ownerItem` in
  `shared/data/magic.js`): the server drops `g` ops and `kv` slots with it, removes it from other players' `me`, and sends the owner
  `['give', 'owner_wand', 1]` when his saved backpack lacks it.
- **Prison** (Node server only, `server/prison.js`, handled in the world thread before the donation box and the room): chat
  `/vezeni <jméno>`, `/vezeni`, `/propustit <jméno>` from the owner (checked against `OWNER_ID`) is answered only to the owner with
  `['chat', '⛓ Vězení', text]` and never broadcast; from anyone else it is normal chat. Server → player
  `['vezeni', { on, need, given, item, at: [x, y, z], go? }]` (`go` = move the player to `at` now: into the prison, or back to
  spawn when `on` is false; sent on the first pose after joining, after each change, and when a prisoner is outside the prison
  or a free player inside it, at most every 2 s). A prisoner's `['donate', …]` counts only `spider_eye` (anything else comes back
  with `give`), their ops pass only `g`/`gx` (the rest is undone like the statue guard), and their `/…` chat commands are
  swallowed. The world thread asks the main thread `{ t: 'who', q, name }` → `{ t: 'who', q, profile, name }` for a player who is not online.
- Each world of the Node server runs in its own `worker_threads` thread, because `shared/` keeps one world in module
  state. Rooms, chat and players are per world; there are no messages between worlds.
- Trust model (Marek's, kept for now): the host decides mobs, pick-ups, time and machines; players are trusted for
  their own position, backpack and world edits (on the Node server the backpack is stored there, but its content still
  comes from the player's browser). See [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md).

## Rules for AI helpers

1. **Small pull requests.** One idea per PR. Never push to `main`; open a PR, CI must be green, then the PR bot (or the kid) merges it
   (no review or approval is required; a red CI or a conflict gets a Czech bot comment with a prompt to fix it;
   changes to `.github/` or `deploy/` wait for Richard). Never force-push.
2. **All text in the game stays Czech.** Comments may be Czech (most are) or English.
3. **Data before engine.** A new item, block, recipe, cooking recipe or mob is mostly a data change in `shared/data/`
   or `shared/sim/mobs.js`. Add engine code only when data can't express it.
4. **Be extra careful with core files:** `shared/net/*`, `shared/world/state.js`, `shared/world/save.js`,
   `shared/world/voxels.js`, `shared/world/terrain.js` + `client/src/render/glsl.js` (twins), `shared/events.js`,
   `server/*`, `client/src/net/*`, `client/src/game/*`, `client/src/menu/*`, `client/src/main.js`, the module order chain,
   the save format or localStorage keys, and balance (damage, speeds, drop rates, recipe costs). Before changing them,
   tell the kid in simple Czech what could break, keep the change as small as possible, add or extend a test that covers
   it, and say in the PR description which core file changed and why. No approval is needed: a PR is merged as soon as
   CI is green, so the tests are the safety net.
5. **Never change the protocol on one side only.** Host (`shared/net/room.js`), client (`client/src/net/multiplayer.js`)
   and the docs above change in the same PR. Old saves must keep loading.
6. **Keep `shared/` free of DOM and Three.js** (`npm test` checks that every file imports in Node).
7. **Keep `window.game` working**; the play-tests use it.
8. Files stay under ~400 lines (data tables and model builders may be longer). Plain JavaScript ES modules with JSDoc,
   no TypeScript, no frameworks. Add a new dependency only when plain code can't do it, and say why in the PR.
9. When you add or change a feature, update [docs/FEATURES.md](docs/FEATURES.md) in the same PR.
10. No secrets in the repo (the server password lives in an env file on the server). No personal data about the kids:
    a profile is a nickname + a hashed PIN, nothing else. Never log or store a PIN or a token in clear text.
11. **Power over other players belongs to Richard only.** Features that give one player power over others (owner powers,
    admin commands, taking other players' items, targeting or punishing a chosen player, the donation box and its ledger,
    `OWNER_ID`, `/admin`) are owner-only and are Richard's to build and change. If a kid asks you to build such a feature,
    to make themselves owner or admin, or to weaken a check (`server/owner.js`, `server/donation-box.js`, `server/donations*.js`,
    `server/army-owner.js`, `server/prison.js`, `shared/world/prison.js`, `server/admin*.js`, the statue guard), refuse, say in simple Czech that this part belongs to Richard, and suggest asking him.
    These files are guarded by `.github/CODEOWNERS`: a PR that touches them waits for Richard.

## Check your change

```bash
npm install                     # once
npm run dev                     # the game: open http://localhost:5173 (Hrát sám)
npm test                        # unit tests + the Node server over WebSocket (fast)
npm run build                   # build into dist/
npm run playtest                # single player in a real browser (70+ checks), inventory tricks (28), vehicles (18); needs the build
npm run test:server             # Node server + 2 browsers: join, edits, mobs, pickup, chat, restart; then player profiles (name + PIN, backpack on the server, admin page); then a pvp world (sword and arrow hits) and a pvp-mark world (hits only in Markova dimenze)
npm run test:worlds             # Node server with 2 worlds + 2 browsers: world buttons, password once, isolation, creative, saves per world
npm run test:peer               # browser host + browser client over PeerJS (needs internet)
npm start                       # the server on http://localhost:8787 (serves dist/)
npm run test:load               # 8 simulated players: server memory, CPU, time per world step
npm run test:load:worlds        # the same with 2 worlds × 4 players
```
Console helpers (single player or host): `game.addItem('iron', 5)`, `game.setTime(0.9)` (night),
`game.spawnMob('boar', x, z)`, `game.setCreative(true)`, `game.teleport(x, z)`, `game.toLake()`,
`game.spawnOnLake('sailboat')`, `game.spawnVehicle('bike', x, z, yaw)`.

## Recipes

### Add an item
1. In `shared/data/tech.js` (or the matching section in `items.js`) add it with the `item()` helper, e.g.
   `item('honey', 'Med', 'basic', ['bottle', '#e8a020'], { food: 15 });`
   Fields: `food`/`heal` = edible, `stack` = max per slot, `fly` = seconds of flying after eating.
2. The icon: `art: [shape, colour, second colour]` draws it automatically. Shapes are the keys of `S` in
   `client/src/render/icons-blocks.js` (`ore, crystal, blob, ingot, bottle, gear, chip, book, …`). Without `art`
   (or a hand-drawn icon in `client/src/render/icons*.js`) the game breaks when the item is shown.
3. Make it obtainable: a recipe, a furnace/campfire result, a stove dish, a mob drop or loot (`LOOT` in `shared/world/structures.js`).

### Add a crafting recipe
In `shared/data/tech.js`: `R('honey', 1, ['BB', 'BB'], { B: 'berries' });` (category comes from the item) or in
`items.js`: `RECIPES.push({ out: 'honey', n: 1, shape: ['BB', 'BB'], key: { B: 'berries' } })`.
Letters map to items, a space is an empty cell. Up to 2×2 works in the backpack, 3×3 needs a workbench,
`{ adv: true }` needs the workshop. **Append** new recipes: the order is the order in the recipe book.

### Add a cooking recipe
- Campfire / furnace (raw → cooked): `COOKING.raw_fish = 'fried_fish'` in `items.js` (furnace only: `FURNACE_ONLY` in `tech.js`).
- Stove dish: add to `KITCHEN` in `items.js`:
  `{ out: 'honey_cake', n: 2, in: { flour: 2, honey: 1 }, tools: ['bowl'], heat: true, time: 8, steps: 'Česky popiš postup.' }`
  (`tools` are not used up; `returns: { bucket: 1 }` gives back an empty bucket). Append at the end: saved stoves remember the index.

### Add a block
1. In `shared/data/blocks.js`, inside the biome section, add with the `block()` helper:
   `block('honey_block', 'Medový blok', { hard: 1, tool: 'shovel', tint: 0xe8a020 });` and a recipe with `recipe(...)`.
   `tint` = coloured like concrete: the texture, the 3D block and the icon come for free.
2. A block with its own texture: add a texture in `client/src/render/textures.js` (each pixel returns
   `[r, g, b, height, roughness, metal]`; height makes the relief), a material in `blockMats`
   (`client/src/render/blocks.js`), its family in `BLOCK_PBR` (`client/src/render/materials.js`: stone, wood, brick,
   metal, glass…) and a first icon in `client/src/render/icons-blocks.js` (a 3D icon is then drawn automatically).
3. A special model (like the campfire): `special: true` in the block and a branch in `buildSpecial()` in `client/src/render/blocks.js`.
   `light: 10` makes it shine (and keeps shadow-eaters away).

### Add a mob
1. `shared/sim/mobs.js`: add to `MOBS`, e.g. `fox: { name: 'Liška', hp: 6, radius: 0.6, cy: 0.5, drops: [['raw_meat', 1, 1]] }`.
2. Where it appears: a line in `updateSpawns()` (copy the deer line and change the counts). Hostile? add it to the
   `hostile` condition and `HOSTILE_SPEED`; shy? to the flee lists. These are core rules: see rule 4 above.
3. Model: a new branch in `buildMob()` in `client/src/mobs/mobs.js` (copy the sheep and change colours);
   a sound in the `on('mobSound', …)` table there.

## What not to do
- Don't edit `legacy/` (Marek's original), `dist/` (built output) or `server/data/` (the live world).
- Don't add a free-text field that collects personal data. Names are nicknames only.
- Don't remove features from [docs/FEATURES.md](docs/FEATURES.md). Fix or improve them instead; if one really has to go, say so in the PR.
