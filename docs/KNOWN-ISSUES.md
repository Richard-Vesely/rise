# Known issues

Things that are not right yet. v2 kept Marek's behaviour on purpose ("parity first"); only what blocked the server was
changed. Pick one, open an issue, fix it in a small PR (core files: see rule 4 in AGENTS.md).

## Multiplayer (all hosts)
- **Players are trusted.** The host accepts every world edit (`ops`), every small-map value (`kv`: chests, machines, cars…),
  and each player's own position, health and backpack. A modified browser could cheat or wipe chests.
  Creative edits from players without permission are refused, nothing else is checked.
- **Small maps: last change wins.** Two players changing the same chest or machine within about half a second can lose
  one change. (v2 fixed the common case where a player's own fresh change hid another player's change.)
- **Shards and printed papers can be picked up twice** when two players grab them at the same moment
  (pick-up is decided by each player, not the host; dropped items already go through the host).
- **Two players can get into one car** at the same moment (the driver check is done by each player).
- **Machine credit:** when any machine finishes (campfire, furnace, stove…), the *host's* tips progress counts it.
- **Trap loot:** a mob killed on spikes with no chest nearby gives its loot to the host if the host is within 24 m,
  otherwise the loot is lost (always lost on the Node server).
- **Animal sounds** for joined players are made in their own browser (same voices, from the right place), so two players
  don't hear the same sheep bleat at the same moment.
- **Chat is free text** (kept from Marek's version; Richard decides whether it stays).

## Node server
- Admin tools are only the player list and PIN reset (`/admin`, `node server/admin.js`): no kick/ban, no way to give creative
  to one player (only for everyone: `ALLOW_CREATIVE=1` or a `:creative` world), no renaming or deleting a profile
  (edit `players.json` with the server stopped).
- **Still client-trusted with profiles:** the backpack is now *stored* on the server per player and world, but its content
  still comes from the player's browser (`['me', …]` every 10 s). The server checks only the shape and size (≤ 64 KB,
  36 + 4 slots, known item ids, numbers in range), not where the items came from: a modified browser could still give
  itself items, or bring creative items into the survival world by editing the message. Position, health and world
  edits are trusted as before.
- The server keeps the state the browser sent last: what happened in the last ≤ 10 s before a crash or a lost connection
  can be lost (a normal *Odejít* or closing the tab sends it at once). A world is written to disk every 30 s, so a server
  crash can lose up to 30 s of backpack changes too.
- Logging in again in the same world (another computer or tab) closes the older game and loads the backpack from the
  last saved state, so the last few seconds of the older game can be lost.
- A 4-digit PIN is easy to guess for someone who has `players.json` (10 000 combinations, even with scrypt); online it is
  limited to 5 tries per name and address per minute. It protects the backpack from classmates, not from an attacker.
  A wrong PIN and a taken name give the same message (the server can't tell them apart).
- Game pages from before profiles (an old cached page or an old Pages build) can't join a server with profiles: they
  don't send a PIN and see the password prompt again. Reload the page.
- Profiles are server-wide; the browser host (*Vytvořit hru na svém počítači*) has no profiles and keeps backpacks in
  the joined players' browsers as before. There is no way to travel between worlds in the
  game: leave (Esc → Odejít) and choose another world. Changing a world's id in `WORLDS` starts an empty world (rename its folder).
- No rate limiting of messages; the password is the only protection. Use a password on a public server.
- A new player gets the whole world in one message (fine for club-sized worlds).
- When nobody is online, mobs are removed; machines, crops and the day keep running.

## Single player and drawing
- **Grass cut mask repeats every 128 m** and the **dug-hole mask every 512 m** (shader textures wrap): cut grass or a hole can
  also show up 128/512 m away.
- Terrain height exists twice (JavaScript `shared/world/terrain.js`, GLSL `client/src/render/glsl.js`); they must be changed together.
- `ITEMS[x].icon` (emoji) and `TIER_COLOR` are unused leftovers.

## Project
- The VPS setup (`deploy/`) is written but not yet run on a real VPS; the Cloudflare tunnel for a laptop is not tested.
- GitHub Pages deploy needs v2 merged into `main` and Settings → Pages → Source = GitHub Actions.
- `playwright` 1.55.0 (dev only) has an advisory about browser downloads; update it when convenient (`npx playwright install` after).
- The PeerJS mode depends on the public broker `0.peerjs.com`; its CI test is allowed to fail.

## Changed in v2 (on purpose)
- Structure guards (Markomen at ruins and fortresses) are spawned only by whoever holds the world; before, joined players
  also created local "ghost" Markomen that never moved.
- A joined player no longer loses another player's chest or machine change that arrives right after its own change.
- Mobs collide with trees and rocks around themselves (before: only those near the host's own player; same result in practice).
- The touch-button size setting applies at once (before: one change late), because settings now load first.
