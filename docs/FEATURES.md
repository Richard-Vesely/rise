# Říše: what the game can do (feature list)

The full list of features in *Říše* (repo *rise*, formerly *louka*), as of Marek's version `2778d1b` (17.10.2026), plus the v2 server.
Each section ends with *Kód:* = where it lives in the code (rules in `shared/`, the browser in `client/src/`).
It is for AI helpers and kids: read it to know what already exists before adding something, and use it as the
checklist that nothing got lost when the code moves around. Czech names are what players see in the game.

When you add or change a feature, update this file in the same pull request.

---

## 1. Start and menu
- **Main menu "ŘÍŠE"**, made simple for kids, top to bottom: the login line (not logged in: *Tvoje jméno* field;
  logged in on the club server: *Hraješ jako **Ája** · Změnit hráče*), the **world buttons** of the club server, then
  **Hrát sám**, then small links **Nastavení · Další možnosti**. No technical words on the main page. Big buttons, works
  on a phone in portrait and landscape.
- **World buttons** (e.g. *Hlavní svět*, *Kreativní svět*): the list comes from the club server (`GET /worlds`), so a new
  world appears by itself. Each button: the big name, players n/max (full worlds are disabled; counts refresh every 15 s)
  and one line about the world: survival *Přežij a stav spolu s ostatními z kroužku*, creative *Stav bez omezení, všechno
  máš hned*. While loading: *Načítám světy…*; when the server can't be reached: *Svět teď není dostupný, zkus to za chvíli
  nebo hraj sám.* (everything else still works). The club server is the page's own server (game served by `npm start`),
  a `?server=<address>` link, or the build's `VITE_SERVER_URL`; without one there are no world buttons.
- **Hrát sám** (*Jen ty, svět se uloží v tomhle prohlížeči*): single player, world saved in the browser.
- **Heslo kroužku (řekne ti ho Richard)**: the first click on a world asks for the club password once (only if the
  server has one) and remembers it per server address (`rise-heslo`). A wrong password: *Špatné heslo. Zkus to znovu.*,
  the stored one is forgotten and the menu asks again. The last chosen world is highlighted; a `?world=<id>` link
  highlights and focuses one (Enter joins).
- **Player login on the club server** (*Kdo hraje?*): the first time on a device, the name (prefilled) and a **PIN
  (4 číslice)** the kid makes up: *Zapamatuj si ho, s ním se dostaneš ke svému batohu i na jiném počítači.* A new name
  creates the player, a known name needs its PIN. Then the browser remembers the login and never asks again;
  *Změnit hráče* forgets it. Messages: wrong PIN or name taken (*Špatný PIN, nebo jméno „Ája“ už má někdo jiný…*, with
  the tries left), too many tries (*Moc špatných pokusů. Počkej 1 min…*), a bad name (2–16 characters, not *Hráč*).
  The **backpack, armor, position and health are kept on the server** per player and world, so they come back on any
  computer. Logging in somewhere else closes the older game with *Přihlásil ses jinde.* An old backpack saved in this
  browser before profiles is taken over once.
- **Další možnosti**: **Vytvořit hru na svém počítači** (*Kamarádi se připojí kódem, který uvidíš. Nech hru
  otevřenou.*; the host in the browser): option *Povolit kamarádům kreativní režim*; you get a code like `LOUKA-7K2F`
  (the same code next time). Max 6 players. **Připojit se ke kamarádovi kódem**: type the friend's code (just the 4
  characters is enough).
- After leaving a multiplayer game the menu shows why (e.g. *Spojení se přerušilo. Zkus se připojit znovu.*).
- **Club server update while playing:** the server warns in the chat (*Server se aktualizuje na novou verzi hry. Za chvíli
  tě připojím zpátky.*), saves the backpack, and the game shows *Nová verze hry · server se restartuje…*; as soon as the
  new server runs, the page reloads in the new version and joins the same world again by itself.
- **Nastavení**: graphics quality (auto by graphics card/low/medium/high), controls (auto/touch/mouse), touch button size, mouse sensitivity,
  and the sound sliders **Hlasitost** (80 %), **Zvuky** (100 %) and **Hudba** (60 %); they apply at once (a short click plays at the new volume).
- **Můj oblek** (link in the main menu, **O** or the *Oblek* button under the armor slots in the backpack): pick a futuristic suit
  with a live 3D preview on a holographic stand (drag to turn it; the model walks and swings to show off). Suits:
  *Průzkumník* (backpack with a blinking antenna), *Inženýr* (headlamp, glowing power cell, tool belt), *Pilot* (big
  visor, jet pack), *Strážce* (heavy shoulder plates, a cape that flutters), *Vědec* (lab coat whose flaps swing,
  a hologram next to the head), *Stínový* (dark hood, torn cape) and *Nebeský* (white and gold, halo, small jets).
  Then **Barva obleku** (12), **Světla** (only the game's glow colours: azurová, jantarová, zelená, purpurová),
  **Hledí** (5 tinted visors) and **Znak na hrudi** (8 emblems, glowing in the light colour). *Náhodně*, *Zrušit*,
  *Hotovo* (Enter / Esc work too). Every new name starts in its own colour. The suit is saved in the browser per
  player name (`rise-obleky`) and, on the club server, in the player's profile, so it comes back on any computer.
  In the game a toast says *Nový oblek je na tobě!*
- **Heroes in the Hytale style** (graphic update): three more choices in *Můj oblek* without a helmet: *Mág* (long robe with gold
  ornaments, a glowing gem, wild hair), *Rytíř* (mail shirt, tabard, metal pauldrons, short cape) and *Hraničář* (leather vest,
  hood on the back, quiver, scarf). They have a pixel face with blinking eyes, ears and a haircut; the picker then offers *Vlasy*
  (5 colours), *Pleť* (8 tones) and *Oči a drahokam* (the 4 light colours). The same costume slots are reused (visor = hair,
  emblem = skin), so saves and the pose text `lk` stay the same. A helmet hides the hair. Code: `heroHead`, `HAIR` and
  `SUIT_EXTRAS` in `client/src/render/character.js`.
- **Intro screen** on the very first start; **Návod** (H) is a long in-game help text that explains every system.
- **Tips** (*Rada*, 14 steps) guide a new player: chop a tree, craft, build, find shards, wake the shrine…

*Kód:* `index.html` (menu, Návod text), `client/src/menu/menu.js`, `client/src/menu/settings.js`, costume picker `client/src/menu/costume.js` (data and checks `shared/data/costumes.js`), tips in `client/src/ui/hud.js`.

## 2. World
- **Oceans** (only in worlds created with this version; the save keeps `oceans: true`, old worlds keep their terrain): more than
  520 m from the home shrine there are big seas (slow waves about 1.5 km long) with sandy beaches, a sea floor about 9 m deep and
  islands. The sea surface uses the pond water (ripples, sky reflection, colour by depth, foam at the shore); you can swim and dive
  in it. No grass, trees, boulders or animals in the sea or on the beach. Code: `oceanK`, `beachK`, `WORLD_GEN` in
  `shared/world/terrain.js` and their GLSL twins (uniform `uOceans`) in `client/src/render/glsl.js`, the surface `client/src/render/ocean.js`.
- **Endless terrain** with smooth hills and a **voxel underground** (1 m blocks down to bedrock at y = −48).
  The world is the same for everyone (no seed): it is computed from coordinates.
- **Biomes** (name shown next to the clock): meadow and forest, cherry grove, jungle, savanna, desert, tundra,
  mushroom forest, volcano (lava in the crater hurts).
  Biome borders meander into bays and peninsulas. Warm, dry regions are more common, with broader deserts and
  rolling dunes of varying height. Climate regions are compressed 12×, with a 35 m starting meadow and a smooth
  45 m transition: desert, jungle and cherry forest start roughly 60 m from spawn, tundra about 85 m away.
  The Mark dimension stays unchanged.
  This changes generated terrain in existing worlds too; player-built blocks keep their saved positions.
- **Trees** per biome (oak, spruce, cherry with rose-pink blossom, jungle, snowy spruce, acacia, dead tree/bush, cactus, giant mushroom)
  and **boulders** (16 % with iron).
- **Grass** you can cut (fiber, seeds, berries, potatoes, rice near water, flowers); it grows back in ~2 minutes.
- **Ponds** with water (fishing, slows vehicles), fireflies at night.
- **Lakes** (*jezera*): rare big lakes, 100–240 m across and 6–8 m deep, in about 4 of 10 squares of 1 × 1 km, never closer
  than 500 m to the home shrine (where the club builds), never in the Mark dimension or by a volcano. The land around a
  lake levels out to a flat shore with reeds and stones; the bottom is flat from 0.7 of the radius. No trees, boulders,
  structures, grass or animals spawn in a lake. Fishing, the wet shore, frogs and water sounds work like at ponds.
  The lake nearest to the shrine is at about (−420, −520). Console: `game.toLake()` (shore of the nearest lake), `game.nearestLake(x, z)`.
- **Swimming**: in deep water (chest under the surface) you float up until your head is above water; Space swims up,
  Shift dives, you move a bit slower, and Space at the shore climbs out.
- **Wind** (*vítr*): one wind for everyone, from the day number and the time of day (`windAt` in `shared/sim/weather.js`):
  each quarter of the day it blows from its own side with its own strength, turns smoothly between them, gusts, and
  blows harder in rain and storms. Grass, tree crowns, reeds and smoke bend with it, and sailboats sail by it.
- **Underground**: caves (tunnels and domes), rock layers (stone, granite, marble, basalt, sandstone, obsidian),
  ores in nests: coal, iron, copper, gold, quartz, crystal, markorite (Mark dimension only).
  No digging within 10.5 m of a shrine.
  - **Look**: 128 px textures made by code (64 px on *nízká*), one layer per block type in a texture array (no colour
    bleeding at a distance): natural rock with chipped ledges and thin cracks in a cool grey, dirt with pebbles, every
    ore on the same stone as plain stone, with big, dense grains so an ore block reads from afar. Each pixel also has relief (normal map, softer with distance, *střední* and
    *vysoká*), roughness, metal and glow: gold, copper and iron nuggets shine like metal and glint; **crystal and
    markorite glow only in their shards**, pulse gently and sparkle, and **light the cave walls around them** (cyan or
    violet, up to ~3 blocks). Block edges are slightly darker so every block reads, also in caves.
- **Day and night**: a day is 8 minutes, nights run twice as fast. Sun, moon, stars, fog.
- **Light shards** (*Úlomky světla*): glowing crystals with a light beam, scattered far apart. Walk into one to collect it.
- **Shrine** (*Svatyně*) at the start. Bring **3 shards** and right-click the portal to wake it (*Svatyně se probudila!*).
  The portal leads to the **Mark dimension** (*Markova dimenze*): purple sky, markwood, markorite, markomen, golems.
- **Země draka**: a second, always-open amber portal 16 m east of the home shrine. It leads to a rocky western
  dimension (x < −20000, return portal at −40000, 0), with warm fog and a torch-marked path to a large basalt cave
  72 m north of the return portal. Walk through the return portal to go home; dying here revives you by that portal.
  The original Mark portal still works independently. The cave uses ordinary saved blocks; no new save format.
  Code: `shared/world/dragon-land.js`, `dragon-den.js`, terrain + GLSL twin, `client/src/world/dragon-portal.js`, `shrine.js`.
- **Structures** with chests and loot: ruins, Markoman fortress, watchtower, abandoned camp, dungeon (underground,
  with a spawner), desert pyramid, jungle temple, igloo, cherry pavilion, savanna hut, mushroom house, obsidian altar.
  The compass shows the nearest unexplored one.

- **Graphics look „Jasná budoucnost“** (`client/src/render/look.js`): realistic light on clean, softly stylised shapes;
  lush nature; only technology glows in saturated colours. Fixed light colours: cyan = electricity and tech, warm
  white/amber = fire, magenta/violet = Mark dimension, green = OK status lights. Nothing in the playable area is pure
  black (nights and caves are dark but readable). All look numbers can be tuned live in the console (`game.LK`).
  - **Grafika Automaticky** picks the tier from the graphics card (`client/src/game/gpu.js`): separate card → *vysoká*,
    integrated (Intel, AMD Radeon Graphics, Apple) → *střední*, software WebGL (CI) or touch device → *nízká*.
    The Settings window shows what Automaticky chose.
  - **Day and night**: golden hour with long warm shadows, a **sunset** with an orange-to-pink horizon and violet sky
    (about 17:00–19:30), stars only after dusk, a moon that lights the land in cool blue and casts shadows, fireflies
    that pulse gently. Sky light fills shadows (about a third of the sun) so shadows are never black.
  - **Weather** (`shared/sim/weather.js` decides it from the day number and time, so every player sees the same sky;
    nothing is sent or saved): rain with streaks and splashes, wet darker ground and **puddles** that reflect a muted sky
    (wet grey, not white patches) and ripple, grey overcast sky and thicker air, **thunderstorms** with lightning bolts, a flash and thunder delayed by
    distance, and **foggy mornings** in valleys. Day 1 of a new world is always clear. Messages: *Začíná pršet*,
    *Blíží se bouřka – schovej se!*, *Přestalo pršet*. Rain noise and drops are synthesised (`render/weather.js`).
    Console: `game.setWeather({ rain: 1, storm: 1 })` (this browser only), `game.setWeather(null)` back to the rules.
  - **Fire light** (torches, campfires, lanterns) is warm white (~3000 K) and flickers 2–3× a second; green grass stays
    green under it. Campfires and torches give off **embers and thin smoke** that the wind carries. Electric lamps light
    cool white. Glowing mushrooms light cyan, spawners violet.
  - **Wind**: one shared wind (`U.wind`) bends grass, sways tree crowns and reeds, slants rain and carries smoke; gusts
    roll across the land as waves and get stronger in rain and storms.
  - **Trees**: smooth crowns, **leaf clusters** around crowns near the player (střední/vysoká), light through the crown
    edge against the sun, pines and spruces in drooping branch tiers, bark relief and darker trunk feet.
    **Grass** has yellow-green patches and ~5 % small yellow, white and violet flowers.
  - **Ponds**: turquoise at the shore, deep teal in the middle, reflect more sky at grazing angles, small sun
    **sparkles** instead of one glare spot, broken foam only where ripples meet the shore, an uneven edge, **reeds,
    cattails and stones** along the real shoreline and a band of dark wet soil. Rain ripples the surface.
    **Under water** the view turns short and blue-green.
  - **Caves**: cool blue-grey cave air against warm torch light, every block edge is darkened so blocks always read,
    **crystal and markorite ore light the stone around them**, dust drifts in torchlight, and the eyes adapt
    (brighter after a moment underground).
  - **Mark dimension**: darker violet sky, violet fog, a large cyan-and-magenta **aurora**, nights tinted violet instead
    of blue, and slow floating motes of light. The tundra gets a green aurora at night.
  - **Light-shard beams** are a landmark: brighter by day so they stay visible against the sky; by day beams fade out
    beyond ~250 m (no wall of lines on the horizon; the compass still shows shards), at night all of them shine.
  - **Powered cables** show their metal (copper, gold) and carry **cyan pulses**; faster pulses = more power used.
  - **Grafika: střední / vysoká** draw through a post-processing chain (`client/src/render/post.js`, `postprocessing`
    + `n8ao`): HDR; sun/moon **shadows** (`shadows.js`: one map that follows the player, 20–30 updates per second; near
    trees cast shadows through invisible copies); **height fog coloured by the sky** in the view direction (bluer away
    from the sun, warmer toward it) plus a distant lighter mountain ridge; **bloom** on lights, lava, crystals and neon;
    AgX tone mapping with hue protection (no orange-to-red shift), cool shadows and warm highlights, moonlit blue
    nights; **eye adaptation** (up to +0.8 EV at night, +1.2 EV in caves, over ~1.5 s); **clouds** lit by the sun with
    pink undersides at sunset; **normal maps** on blocks and cave walls.
    - *vysoká*: MSAA 2×, sun **shafts** (16 steps, only when looking toward the sun), 2048 px shadows and **ambient
      occlusion** (N8AO, half resolution) on a separate graphics card; 1024 px shadows and no AO on integrated graphics.
    - *střední* (the club laptops): 1024 px shadows, no AO or shafts, FXAA instead of MSAA.
    - **Dynamic resolution** drops to 60–70 % when a frame takes over ~18 ms and comes back when there is headroom.
      With a window open (backpack, computer, guide, *Můj oblek*) the world behind it renders at half resolution without AO.
  - **Grafika: nízká** stays as cheap as before (no composer, no shadows, ACES); it still gets the warm-white fire light,
    wind, weather, dusk sky, simple water, reeds, embers, cave edges and ore light. CI renders with it.
  - Screenshots for comparing graphics: `node tests/playtest/shots.mjs dist <out> [--quality low|medium|high|auto]
    [--perf] [--views all] [--jpeg] [--size WxH] [--timeout s] [--skipdraw]` (fixed views at 1600×900, `--views all` adds golden hour, night, rain, dawn fog and the
    Mark dimension; `--perf` writes ms per frame).

*Kód:* terrain and biomes `shared/world/terrain.js` (+ GLSL twin `client/src/render/glsl.js`), underground `shared/world/voxels.js`, trees/rocks/shards/ponds `shared/world/nature.js`, structures and loot `shared/world/structures.js`, day clock `shared/sim/day.js`; drawing in `client/src/render/` (`ground`, `grass`, `forest`, `shards`, `vox-mesh` + underground textures `vox-tex`, `sky`, `daylight`; look `look.js`, post-processing `post.js`, shadows `shadows.js`, clouds and distant ridge `clouds.js`, water `water.js`, light shader bits `light-glsl.js`, weather `weather.js`, embers/smoke/dust `ambient-fx.js`), shrine and portal `client/src/world/shrine.js`.

## 3. Player
- **Survival**: health ❤️, hunger 🍗 (drops faster when running), armor 🛡. Starving hurts; full stomach heals.
  Death: *Padl jsi…*, you respawn at the shrine.
- **Creative mode** (C): fly (double-tap Space), instant breaking, all items. In multiplayer only if the host allows.
- **Movement**: walk, run (Shift), jump, step up blocks and stairs, sit on chairs.
- **Armor**: helmet, chestplate, leggings, boots in iron, crystal, markorite; special sets:
  *Stínové* (shadow: faster, shadow-eaters ignore you) and *Nebeské* (sky: double jump, slow fall, healing; chests only).
  Armor **wears out** too: every mob hit takes 1 point (1 per 20 damage) from each worn piece (iron 165/240/225/195,
  crystal and markorite more); a broken piece falls off with a snap and *Železná helma se rozbila!*.
- **Getting hurt**: the camera tilts away from the hit, the screen edge flashes red and the heart bar blinks.
- **View bobbing**: the camera dips and sways a little with every step (not while flying).
- **Mark apple** (*Markojablko*) lets you fly for 10 s.
- **Your character** is a kid in a futuristic suit (see *Můj oblek*): bevelled parts that catch the light, fabric,
  painted shell, metal plates, a reflective visor with glowing eyes behind it (they blink), glowing strips in the
  light colour that stand out at night, an emblem on the chest and a soft shadow under the feet. **Armor shows on
  the model** as plates on the helmet, chest, shoulders, thighs and boots: iron is steel, crystal is icy with glowing
  cyan cracks, markorite is violet metal with a purple glow, *Stínové* is dark with magenta seams, *Nebeské* is white
  enamel with gold trim. Putting on a piece clicks. White and light suits are never pure white, so they don't glare
  or blur into a glow in the sun with Grafika střední/vysoká.
- **Animations** (procedural, also on other players): walk and run (longer stride, leaning forward, knees bend),
  idle breathing and looking around now and then, the head follows where you look (the body turns after 75°),
  swings that depend on the tool (pick and axe chop, sword sweeps, shovel scoops, hand and blocks punch), eating
  (hand to the mouth, crumbs fly), flying (legs back, jets glow and spark), sitting, a short squash when landing,
  red flash when hurt; capes, coat flaps and the halo move on their own. Sneaking is supported by the model (pose
  `sn`) but has no key yet.
- **First-person hand**: a gloved suit sleeve (your colours, glowing cuff) holds the item. It sways with your steps,
  lags a little behind fast turns, dips and comes back up when you switch items, jolts when you get hurt, and swings
  with the same tool arcs.
- **V** (touch: *Pohled*) switches the view: *Pohled z první osoby*, *Pohled zezadu*, *Pohled zepředu* (in a vehicle V
  still switches the car camera). The camera stops in front of walls (with a wall right behind you the head hides so it
  doesn't block the view); aiming still works from the eyes.

*Kód:* movement, flying, creative `client/src/player/player.js`, health and hunger `client/src/player/survival.js`, armor data `shared/data/items.js`, armor slots `client/src/ui/inventory-ui.js`; character model, armor plates and animation `client/src/render/character.js` (one skinned mesh per material, joints are bones), first-person hand `client/src/render/held-item.js`, own body and third-person view `client/src/net/avatars.js`.

## 4. Mining, building, items
- **Mining** with hold-to-break and tool tiers: wood → stone → iron → crystal → markorite.
  Axe, pickaxe, shovel, sword (and hoe). Some ores need a better pickaxe (*Potřebuješ…*).
  - **Drops pop out** like in Minecraft: what you mine (blocks, underground, trees, rocks, grass, crops) jumps out of
    where it was as a small item with a little random hop; after 0.5 s the magnet pulls it in (see *Drop items*). Breaking a
    chest, furnace, campfire, stove, generator or table drops everything inside on the ground (tool wear kept).
    **In creative mode mined blocks drop nothing** (the contents of a chest still do).
  - **Speed** (Minecraft formula): time = hardness ÷ tool speed (hand 1, wood 2, stone 4, iron 6, crystal 8, markorite 10,
    only with the right tool for the material); 3× slower with your head under water, 2.5× slower while jumping; a sword
    cuts grass faster. A short 0.3 s pause before the next block.
  - **Cracks**: 10 crack stages grow over the block (stairs and slabs only on their shape; on the smooth ground surface as a
    decal that follows the slope). Trees, rocks and cars show a cyan progress ring instead.
  - **Chips per material**: every 0.2 s crumbs in the block's own colours fly from the hit point (with the material's hit
    sound, see *Sound*); breaking throws 64 chips (40 on *střední*, 16 on *nízká*) that fall, bounce once and fade.
- **Tool durability** (*Odolnost*): wood 59, stone 131, iron 250, crystal 900, markorite 2000 uses; hoe 131, fishing rod 64.
  A mined block costs 1, the wrong job costs 2 (sword on blocks, pickaxe on wood…), instant blocks cost nothing; a mob hit
  costs a sword 1 and other tools 2; tilling 1, a caught fish 1. A coloured bar (green → yellow → red) shows under the icon of a
  worn tool; at 10 % the hotbar slot pulses red and *Krumpáč se brzy rozbije* warns once. At 0 the tool breaks: snap
  sound, shards from the hand, the hand dips and comes back empty, *Železný krumpáč se rozbil!*. **No wear in creative.**
  Wear is kept in saves, chests, the server backpack and dropped items (old saves load as new tools).
- **Repair** (*Oprava*) in any crafting grid: two worn tools of the same kind → one with both durabilities + 5 %;
  or a worn tool + 1–4 cells of its material (any planks, stone, iron ingot, light shard, markorite; essence for the shadow
  set) → +25 % per cell. Armor too. The output glows cyan, *🔧 Oprava…* shows the result and an anvil sound plays.
- **Tooltips** of tools also show the attack speed (*⏱ 1,7 úderů/s*), what a pickaxe can mine, the crit hint,
  *Odolnost 187 / 250* (red under 10 %), how to repair.
- **Inventory** (*Batoh*, E): 9-slot hotbar + 27 slots, drag, split (right-click: take half, put one; with a different
  item it swaps like a left click), Shift-move, throw out of the window (left = all, right = one). Glassy futuristic look: slots glow on hover, rarity-tinted edges, the window is only as wide
  as the backpack; UI sounds for take, put, gather, spread, sort, open and close. Minecraft tricks:
  - **Drag with an item** over several slots: left splits the stack evenly, right puts one in each; swept slots glow and
    show the count they will get, the cursor shows what is left. Dragging over one slot is an ordinary click.
  - **Double-click** gathers the same items onto the cursor (partial stacks first, at most one full stack);
    **Shift + double-click** moves every stack of that item to the other side (chest ↔ backpack, hotbar ↔ backpack).
  - **Shift + drag** shift-moves every slot you sweep; **1–9 over a slot** swaps it with that hotbar slot (from a machine
    output it only takes); **Q over a slot** drops one, **Ctrl+Q** the stack; **wheel** over a stack moves one item to
    the other side (down) or pulls one back (up).
  - **Seřadit** (sort) merges and orders the backpack (hotbar stays) or a chest: tools, weapons, armor, food, blocks,
    materials, tech.
  - **Crafting**: hovering a recipe in the book previews it in the grid; a ready result glows (*Shift + klik = vyrob
    vše*); Shift-click on the result crafts everything; **Space** crafts the last recipe again into the backpack
    (Shift + Space as many as possible).
  - **Creative**: middle-click on a slot takes a full stack, middle-drag puts a full stack into every empty slot swept.
  - **Rich tooltips** (Czech): name coloured by rarity (white, yellow, cyan, purple), kind and tier, a short description,
    chips for attack, mining speed, armor, food, health and flying, durability (when an item has it), fuel time, what it
    smelts into, in how many recipes it is used; **F3 + H** adds the item id.
  - Clicking a tool onto the same kind of tool swaps them (tools don't stack).
  - Nothing is lost with a full backpack: closing the window, refilling the campfire or returning the grid drops the rest
    on the ground (*Batoh je plný*).
- **Hotbar**: a glowing ring slides to the selected slot, slot numbers 1–9, an icon pops when its slot gains items, the
  item name fades in above the hotbar for 2 s, worn tools pulse red (≤ 10 % durability).
- **Pick block** (middle mouse button in the world): takes what you aim at into your hand from the backpack (in creative
  a full stack even if you don't have it); otherwise *V batohu nemáš: …*.
- **Drop items** (Q one, Ctrl+Q whole stack; G and Shift+G still work): they lie on the ground, anyone can pick them up;
  they vanish after 5 min. Identical items lying together merge into one stack (decided by whoever holds the world).
  Lying items bob and spin with a soft shadow and show 1–5 models by count (1, 2–16, 17–32, 33–48, 49+). Within 2.4 m an
  item slides toward you (magnet), flies into you shrinking and plays a short high *plip* (also from a hole one block
  deeper than your feet). Like Minecraft: an item you throw can be picked up after **2 s**, a mined block after **0.5 s**;
  in a pond or lake an item dips, **floats up and bobs on the surface**; in the **lava** of a volcano crater it **burns**
  with sparks, smoke and a hiss (whoever holds the world decides); a block placed on an item pushes it up on top.
  A dropped tool keeps its wear (also with Q over a slot), and the save keeps wear and how long items have lain there.
- **Building**: ~115 block types: planks of 5 woods, stones and polished stones, bricks, tiles, glass and panes,
  sandstone, snow, obsidian, mushroom blocks, roof tiles, concrete in 8 colours (from flower dyes), copper,
  gold, steel, quartz, lanterns, torches, and futuristic blocks: **Technický panel** (graphite metal panels with
  screws and vents, 4 from steel plates), **Bílý panel** (quartz + plastic) and **neons** that glow and light their
  surroundings in their colour (they keep shadow-eaters away like torches): **Tyrkysový neon** (glass + shard),
  **Jantarový neon** (glass + torch), **Fialový neon** (glass + raw markorite).
  **Stairs and slabs** (two slabs make a full block), bars, railings, rotation from where you look. Pillar jumping
  (place under your feet).
- **Torches** (*Pochodeň*, coal or charcoal + stick = 8, fibre + stick = 4; works in the backpack grid) work like
  Minecraft's: clicking the top of a block stands a torch on it, clicking a side hangs it on the wall, its base at the
  wall and leaning away from it by 22.5°. Never on the ceiling: clicking the bottom of a block (or any spot where a torch
  can't go) tries the next direction you look along (a wall in front, else the floor); if nothing holds it:
  *Pochodeň potřebuje pevný blok pod sebou nebo vedle sebe* (under pond water: *Pod vodou pochodeň nehoří*). Torches
  stand on full blocks, glass, upper slabs, panes, bars and railings, the furnace and the ground; walls must be a full
  block face (not slabs, stairs, chests or machines). When the block holding a torch goes away (mined, dug out, removed by
  another player), the torch **pops off and drops as an item** (decided by whoever holds the world). No collision, it breaks
  instantly with anything, and its thin hit box lets you mine the wall behind it. Bright warm light that flickers, a
  teardrop flame with a glowing head, embers and thin smoke. **Fire light is baked into the cave walls** (torches,
  lanterns and campfires; up to 13 blocks, fading with distance, rock between the flame and a wall stops it,
  gently flickering), so a cave with 30+ torches is fully lit with no extra cost per frame; only the nearest few fires
  get real-time lights (3 / 4 / 6 by Grafika), and every torch has a soft warm halo around its flame (it fades out up
  close, where the real light is), so walls built from blocks glow around far torches too. Old saves: a torch from
  before learns once whether it stands or hangs on the wall next to it. Not in the game, so not done: water flow and
  lava (they would wash a torch away), melting snow and ice, falling sand.
- **Block materials**: every block family has its own physical material (`client/src/render/materials.js`): stone is
  rough, polished stone and marble are glossy, metal blocks reflect the sky, glass is clear but keeps its reflections,
  bricks have recessed mortar, planks grooves and nails, metal blocks seams, rivets and brushed streaks. On *střední*
  and *vysoká* each texture also gets a normal map and a roughness/metal/cavity map (made once, only for blocks that
  are actually built); *nízká* keeps flat textures. Block edges are slightly darker so every block's outline reads.
- **Icons**: building blocks and machines have **3D icons** rendered from their real model and material (metal shines,
  machine strips glow); they are drawn in the background right after the start. Items keep their pixel-art icons.
- **Crafting**: 2×2 in the inventory, 3×3 at the **workbench** (*Pracovní stůl*), advanced recipes at the
  **workshop** (*Dílna*). ~260 recipes in 12 categories with a recipe book and "only what I can make".
  A **search box** (🔍 *Hledat…*) above the book filters it by item name (accents optional, so *zelezo* finds *Železo*);
  it works for recipes, the creative item list, the campfire, the furnace and the stove cookbook, and is cleared when the window closes.
- **Chest** (*Truhla*, 27 slots).
- **Farm traps**: spikes (*Bodce*) hurt mobs; loot of mobs killed on spikes goes to a chest nearby.
- **Mob spawner** blocks in dungeons and fortresses.
- **Graphic update (Hytale style)**: every hit while mining makes the block jolt (the crack shell swells for 130 ms), knocks out
  a handful of bigger chips and a puff of dust in the block's colours; a broken block also throws 5–7 big chunks that bounce and
  lie for 1–2 s plus a dust cloud. Item icons in windows and the hotbar get a thicker dark outline, light from above and lit top
  and left edges (`client/src/ui/icon-style.js`; 3D block icons and items in hand stay as they are). Animals have big Hytale eyes
  (white, coloured iris, pupil, highlight) turned half forward and a 15–20 % bigger head; the Markoman is a purple knight hero.

*Kód:* torches `shared/world/torch.js` (rules), `client/src/render/torch-model.js` (model), `client/src/render/torch-light.js` (baked light), block textures `client/src/render/textures.js` (helpers `texgen.js`), materials `client/src/render/materials.js`, 3D icons `client/src/render/icon-render.js`, tool rules (durability, mining speed, attack charge, repair) `shared/tools.js`, wear on this screen `client/src/player/durability.js`,
cracks `client/src/render/crack.js`, chips and crit stars `client/src/render/chips.js`, tool and combat sounds `client/src/audio/tool-sounds.js`,
mining and placing `client/src/player/interaction.js` + `targeting.js`, backpack `client/src/player/inventory.js`, inventory window and crafting `client/src/ui/inventory-ui.js` (search box `book-search.js`, tricks `inv-tricks.js`, tooltips `item-tooltip.js`, slots and hotbar `slots.js`, look `client/src/styles/inventory.css`, UI sounds `client/src/audio/ui-sound.js`), inventory rules `shared/inventory.js`, data `shared/data/` (items, blocks, recipes), dropped items `shared/sim/ground-items.js` + `client/src/world/ground-items.js`, spikes and spawners `shared/sim/mobs.js`.

- **Gold shop**: in the chat (T, now also in single player, where it is only for commands) `/sell` (or `/prodat`) sells
  all gold from the backpack for coins (*Zlaťák*, a normal item: gold ingot 10, gold ore 6, gold block 90, gold wire 1, gold
  contact 3) and `/shop` (or `/obchod`) opens the shop window. Gadgets only from the shop: light sabers (blue, green, purple
  16 dmg, red 17; glowing blade in the hand), trident (stabs like a sword, right-click throws it: 14 dmg, stays in the hand),
  wings (right-click = 30 s of flying), flamethrower (hold right-click = stream of fire ~9 m), medkit (full health) and the
  fighter jet (*Stíhačka*, vehicle `jet`: flies like the biplane with a 3.4× stronger engine). Prices and items
  `shared/data/shop.js`, window `client/src/ui/shop.js`, gadgets `client/src/player/gadgets.js`, jet model `client/src/vehicles/jet-model.js`.

## 5. Food and cooking
- **Campfire** (*Táborák*): roast meat and fish, smelt iron, bake sand into glass, clay into tiles.
- **Stove kitchen** (*Sporák*, cookbook *Kuchařka*): 36 dishes (goulash, schnitzel, dumplings, pizza, pancakes,
  strudel, soups, sushi…). Needs ingredients **and utensils** (pot, pan, knife… they are not used up). Takes time.
- **Fields** (*Pole*): hoe turns grass into farmland; plant wheat, tomatoes, potatoes, rice; 4 growth stages.
- **Animals**: chickens lay eggs (right-click), cows give milk (bucket), well gives water.
- **Fishing** (*Prut*): cast into a pond, wait for *Zabírá!*, right-click fast: trout, salmon, seaweed.
- **Rod hook**: right-click with the rod on a player or mob (up to 24 m) hooks them (a line leads to them); the second
  right-click pulls them right in front of you, even after you went through a portal to another dimension. The world holder
  checks that the place is within 5 m of the one pulling (`pullTarget` in `shared/net/room.js`); code `client/src/player/rod-hook.js`.
- **Eating**: hold right-click. With **cutlery** (and chopsticks for sushi) you eat bite by bite with an animation
  (twirl spaghetti, cut steak, spoon soup); sitting at a **table** with cutlery gives a bigger bonus.
  Food can be put on a table. Every dish has its own 3D model.

*Kód:* campfire, stove, crops `shared/sim/machines.js` + `client/src/machines/kitchen.js`, recipes `KITCHEN`/`CROPS`/`COOKING` in `shared/data/items.js`, fishing `client/src/world/fishing.js`, eating `client/src/player/eating.js`, table manners and food models `client/src/dining/`.

## 6. Animals and monsters
| | HP | Behaviour |
|---|---|---|
| Ovce (sheep) | 5 | flees when hit; mutton, wool |
| Slepice (chicken) | 4 | flees; eggs |
| Kráva (cow) | 10 | flees; beef, milk |
| Jelen (deer) | 8 | shy, flees; venison |
| Kanec (boar) | 12 | attacks when hit |
| Vlk (wolf) | 14 | attacks at night or when hit |
| Stínožrout (shadow-eater) | 10 | night monster, burns at sunrise, avoids light and the shrine; violet veins and a moonlit rim show its outline at night |
| Markoman | 26 | Mark dimension, always hostile, good loot |
| Krystalový golem | 60 | Mark dimension, strong, drops shards and markorite |
| Drak Země draka | 300 | guards the dragon cave; bites for 65 before armor, with 0.35 s warning and 1.15 s between attacks; flies after players at 8.5 m/s up to 140 m from the cave and does not despawn when far away |

The dragon has horns, wings, a moving tail, a roar and a health bar. It can be hit with existing weapons and arrows.
It does not attack creative players or bite through walls. Defeating it awards 8 light shards, 6 gold ingots and
3 markorite, and marks its cave cleared in the existing `ruinsOpened` set: it stays defeated after saving and reloading.
Leaving an undefeated dragon and returning can restore its health, as for other monsters.
Code: `shared/sim/dragon.js`, `mobs.js`; model `client/src/mobs/dragon-model.js`.

Monsters stay away from the shrine; light blocks keep shadow-eaters away.

- **Models** (Hytale-like, blocky but detailed): bevelled parts with generated wool, fur, hide and feather textures
  with normal maps, eyes with a white catchlight, a soft contact shadow. Sheep have a woolly cap, cows spots, horns and
  a tail tuft, chickens a comb and wings, deer antlers and a white tail, boars tusks and a bristly back, wolves a
  light mane. Hostile mobs have glowing eyes (wolf amber, shadow-eater magenta slits, Markoman magenta, golem cyan).
  *Markoman* is a guard suit in iron armor with an iron sword; the *Krystalový golem* is stone with pulsing cyan cracks.
- **Life**: eyes blink, the head turns to look at a player within 8 m, animals graze, sniff or look around when
  standing, ears and tails twitch, chickens flap on the run, running kicks up dust, the shadow-eater trails smoke, the
  golem gives off light motes, hit = short red flash, death = tips over sideways, then a puff of smoke (and a soft
  sound). At night mobs and players get a faint blue moonlight rim so their outline reads in the dark.


- **Death**: the whole backpack, the cursor item and the armor fall to the ground where you died (like Minecraft); you wake up
  at the shrine without them and can go back for them (anyone can pick them up; they vanish after 5 minutes). Not in the
  arena (a fresh kit) and not in creative mode. Code: `dropEverything` in `client/src/player/survival.js`.
- **XP, levels and the magic wand** (*Čarovná hůl*: stick + shadow essence, 2×2): XP for a knocked-out mob you hit
  (chicken 1 … boar 4, shadow-eater 6, Markoman 10, golem 25, dragon 120; within 4 s of your hit, any weapon or spell), for
  ore (coal 1, iron 2, crystal 6, markorite 8…), for crafting (1 per craft) and for taking cooked / smelted output (2). Levels
  need 20, 35, 50… XP (green bar with the level above the hotbar). Each new level offers **3 spells, you pick one** (mixed
  kinds; stronger ones need a level and an easier spell first). The wand casts the chosen spell with the right button for
  **mana** (blue bar, 40 + 10 per level, refills 4/s); **R** = next spell, **K** = spell book (learned spells, pick the active
  one). Spells: attack – *Magická střela* (6), *Ohnivá koule* (10 in 3 m + burning), *Ledová střela* (8 + slow 4 s; slow only
  in single player / browser host), *Blesk* (18 in 3 m where you aim, up to 40 m); healing – *Léčení* (+35), *Regenerace*
  (3/s for 10 s), *Ochranný štít* (half damage 10 s); movement – *Vysoký skok*, *Přenesení* (up to 20 m), *Krátký let* (6 s);
  utility – *Světlo* (glowing orb 60 s), *Těžba na dálku* (16 m, like an iron pickaxe), *Duchovní vlk* (20 s, attacks hostile
  mobs). Bolts also hit players when fights are on. Saved as `magic` in the browser and on the server. Code: data
  `shared/data/magic.js`, XP and windows `client/src/player/xp.js`, spells `client/src/player/magic.js`.
**Combat feel**
- **Attack charge**: every weapon has a speed (fist 4, sword 1.7, pickaxe 1.3, shovel 1.2, axe 1 hits per second). A thin cyan
  meter under the crosshair fills up; a hit does 20–100 % damage depending on the charge (Minecraft formula). Holding the
  button attacks every time the meter is full; clicking early gives a weak slap.
- **Critical hit**: a full-charge hit while falling (after a jump, not running) does 1.5× damage with gold stars and a bright *šing*.
  A full-charge hit while running knocks the mob 1.6× further.
- **Hit feedback**: the mob turns red, hops back with knockback, drops blood/crystal chips; the camera kicks up and a strong
  hit freezes the game for ~50 ms (hit-stop). After a hit a mob is invulnerable for 0.5 s (clicking faster does nothing).
- **Bow and arrows** (*Luk*: 3 sticks + 3 fibres at a workbench; *Šíp* ×4: stone + stick + fibre): hold the right
  button to draw (1 s, the bow comes up in front of the eyes with a nocked arrow, a creak and a click when full), let go
  to shoot. The arrow flies in an arc (gravity), its speed and damage grow with the draw: a full draw does 10 (more than an
  iron sword), a half draw 2–3. It hurts the mob it hits (the same `hit` message as a sword); one that hits the ground or
  a block sticks there for 4 s and then lies there as an arrow you can pick up. One shot uses one arrow (not in creative)
  and wears the bow by 1 (250 shots). With a bow in hand, the right button still opens chests, tables and machines.
  Only the shooter sees arrows in flight.
- **Death**: the mob tips over sideways and vanishes in a puff of smoke (0.8 s).
- **First-person hand**: an empty hand is the sleeve of your suit (colours and light from *Můj oblek*) with a glowing stripe
  and an armoured glove; holding an item, the gloved hand grips it.
  Swings differ per tool (sword sweeps sideways, axe and pickaxe chop down, shovel scoops, fist jabs), mining loops the
  swing, a new item slides up from below, and the hand lags a little behind camera turns.

*Kód:* behaviour, spawning, loot, invulnerability `shared/sim/mobs.js`; attack rules `shared/tools.js`; models `client/src/mobs/mob-models.js`; animation and life (`poseMob`, also for the client's puppets), sounds, hit effects `client/src/mobs/mobs.js`;
attack and meter `client/src/player/interaction.js`; camera kick, hurt tilt, hit-stop, view bobbing `client/src/player/camera-feel.js`; hand and swings `client/src/render/held-item.js`; bow and arrows `client/src/player/bow.js` (models `client/src/render/bow-model.js`).

## 7. Technology
- **Furnace** (*Pec*): ores → ingots (iron, copper, gold), quartz → silicon, iron → steel, resin → rubber,
  glass → lens, logs → charcoal; needs fuel. Works like Minecraft's: the top slot takes only things that smelt and the
  bottom only fuel (Shift+click sorts them; wood with no room on top goes to fuel). One fuel item burns out fully, no
  new fuel is lit while there is nothing to smelt or the output is full or holds something else. Without fuel the
  progress runs back, and a different input starts from zero. The window says why it stopped and how many items the
  fuel still smelts. A burning furnace **lights its surroundings**, smokes from the chimney and spits sparks from the
  mouth. The recipe book adds only as much fuel as needed (coal first, then wood; never ethanol).
- **Parts chain**: plates, rods, screws, gears, springs, wires, coils, magnets, LEDs, transistors, chips, CPU,
  engines, gearbox… (categories *Stroje, Elektro, Elektronika, Motory, Vozidla, Letadla, Počítače, Kancelář*).
- **Electricity** (*Elektrická síť*): copper and gold cables, coal generator, solar panel, battery block, switch;
  devices: electric lamp, bulb, motor, electric furnace, charger (charges car batteries), computer, printer.
  Cable capacity limits the power; devices switch off when there is not enough.
- **Futuristic machines**: graphite metal housings with panel seams and screws, white trim, one glowing strip in the
  colour of its job (cyan = electricity, amber = heat), and a **status light** (green = working, amber blinking = no
  power). The generator has a spinning side fan and an amber firebox, solar cells glow cyan at their edges in
  sunshine, the battery shows its charge with cyan bars, the electric lamp is a street lamp with a warm white panel,
  the computer has a lit keyboard and scanlines running over the screen (switched off but on a powered network it shows
  a slowly scrolling standby terminal). Above every running machine floats a
  **hologram** with its icon and a live value (*+60 W*, *40 W*, *75 %*): cyan, flickering, with scanlines, turned
  to the player, visible within ~22 m. A machine nearby that starts makes a short electric sound.
- **Cables** show their metal (copper, gold; a faint glow of their own metal keeps gold golden even at dusk) and carry
  **cyan energy pulses** when power flows: faster and brighter the more the network produces or uses; a cable without
  power shows only its metal.

*Kód:* furnace `shared/sim/machines.js`, power grid and printer `shared/sim/power.js`, data `shared/data/tech.js`, models and windows `client/src/machines/furnace.js` + `power.js`, machine look (materials, status lights, holograms) `client/src/machines/machine-models.js`.

## 8. Vehicles
- **Car** (*Auto*): place it, fill fuel (canister), put in a charged car battery, F to get in. Drive with WASD,
  Space handbrake, L lights, B horn, N nitro (from the garage), V camera. Trunk with 18 slots, front and back seats. Hits animals and monsters.
- **Bicycle** (*Jízdní kolo*, workbench: iron rods, wool saddle, gear, 2 tyres): no fuel, you pedal (W), which uses a
  little hunger (more in a higher gear; with an empty stomach you barely move). **Gears 1/2/3** (touch: *Převod*):
  1 climbs hills, 3 is fast on the flat (~49 km/h). Coasts and speeds up downhill on its own, leans into turns, S/Space
  brakes, B rings the **bell**, L dynamo lamp. It won't ride into deep water; shallow water slows it. Basket with 4 slots.
  The wheels spin, the handlebar turns with the front wheel and the pedals go round while you pedal.
- **Motorboat** (*Motorový člun*, workshop: hull, outboard motor, fuel tank, steering wheel, seat, headlight): launched
  onto a pond or lake with right click (it slides out from the shore until the water is deep enough). Fuel from the
  canister. W/S throttle and reverse, A/D rudder (turns even from standstill with the motor on), bow rises at speed,
  L lights, B horn, N nitro. Stops at shallow water and the shore with *Mělčina!* (never drives onto land). 9 slots.
- **Sailboat** (*Plachetnice*, workbench: sail, mast, hull, iron rods): driven only by the **wind**. W hoists the sail,
  S furls it, A/D rudder; the sail trims itself. **Points of sail**: within ~34° of the wind the sail **luffs** (flaps,
  no drive), close-hauled is slower, **beam reach** (wind from the side) is the fastest, running downwind is slower
  again, so to go upwind you **tack** (zig-zag). The boom swings to the side away from the wind, the sail bellies out
  and flutters when luffing, she heels away from the wind, and a cyan pennant on the masthead shows where the wind
  blows. The HUD shows the wind relative to the bow (arrow), where it comes from (*od SV*), its speed, the point of sail
  and how much sail is up. Same no-shore rule as the motorboat.
- **Boats** bob and roll on small waves (more in strong wind), leave a **wake** of foam rings and throw **spray** from
  the bow at speed, with slapping water and (sailboat) flapping sounds. F gets you out onto the nearest dry shore, or
  into the water to swim if there is none nearby. A parked boat keeps bobbing.
- **Seaplane** (*Hydroplán*, biplane + floats): placed on a lake, floats on two pontoons. Throttle up on the water,
  pull up at ~70 km/h; lands back on water (softer than on land) with a splash. On land it only slides and can't take
  off. Spray from the floats while taxiing.
- **Garage** (*Garáž*, workbench block): right click shows the vehicles parked within 8 m. **Repaint** in 16 colours
  (free, the model changes for everyone), and upgrades stored in the vehicle: **nitro** (*Nitro* bottles, up to 5 charges;
  N or 🔥 = 3 s of extra power with blue flames), **off-road tyres** (less slowdown uphill and in water, higher step;
  car and bike) and a **turbo** (*Turbodmychadlo*: higher top speed and acceleration; car, motorboat, planes).
- **Passengers** (multiplayer): F on a vehicle someone else drives puts you in a free seat (car 3, motorboat 3,
  sailboat 2, biplane and seaplane 1 in the front cockpit, bike none). You ride along, look around with the mouse, and
  F gets you out (not in the air). Your seat is part of your position, so it frees itself when you leave the game.
- **Riders are visible** on open vehicles (bike, boats, cockpits) for other players, and for yourself with the rear
  vehicle camera (V); in the car you sit inside.
- **Look „Jasná budoucnost“** (shared parts in `client/src/vehicles/veh-look.js`, one model file per vehicle): metallic
  clearcoat paint (*střední*, *vysoká*; plain gloss on *nízká*), graphite and white parts, tinted glass that reflects
  the sky, and **cyan light strips** (cyan = technology, like the machines and suits).
  - **Car**: smooth body from a side profile with wheel arches, tinted cabin under a black glass roof, LED light bars
    front and back (the front one is a daytime light, full with L), a cyan side stripe, an **underglow** (dim when
    parked, bright while driving or with lights on) and aero rims with a glowing ring.
  - **Biplane and seaplane**: smooth fuselage, a tinted canopy over both seats (invisible from inside, so the cockpit
    view stays clear), white wings joined at the tips by slim end plates with a glowing edge (no wooden struts),
    chrome spinner, cyan intake ring, two side **thrusters** that glow with the throttle (nitro flames come out of
    them), wheel spats or white floats with a glowing waterline. The club emblem (navy disc, glowing cyan ring, white
    *Ř*) is on the upper wing instead of military roundels.
  - **Bicycle**: thick frame with a cyan strip on the down tube, tri-spoke rims with glowing rings, LED lamp and tail light.
  - **Motorboat**: V-hull, curved tinted windscreen, console with a screen, electric outboard in a white cowl with a
    glowing ring. **Sailboat**: V-hull with a keel bulb, carbon mast and boom, shrouds, sails with the club emblem and
    a cyan band, a masthead light.
  - **Garage upgrades show on the model**: off-road tyres are wider and knobbly (the car also gets fender flares), the
    turbo adds a hood scoop and a rear wing (car), an intake under the engine (planes) or a bigger cowl with an intake
    (motorboat), nitro adds blue nozzles (car exhaust tips, rings on the plane thrusters, motorboat). The model is
    rebuilt when the paint or the upgrades change. Inventory icons show the new look.
  - Cheap to draw: fixed parts are merged per material; boats cast no shadow (a bobbing hull would stripe itself).
  - In first person the hand is hidden in every vehicle (and at a dining table); the car's driver camera follows the
    car's tilt, so on a slope it stays above the seat.
- **Biplane** (*Dvouplošník*): needs flat ground to place. Throttle Space/Shift, pitch W/S, roll A/D; stall if too slow;
  crash landing hurts.
- While you sit in a vehicle, its HUD line (speed, gear, fuel, wind) takes the place of the key hint, which hides.

*Kód:* kinds of vehicles (names, sizes, seats, upgrades) `client/src/vehicles/kinds.js`; shared parts (get in/out,
drawing, cameras, nitro, the car's driving) `car.js`; models `car-model.js`, `bike-model.js`, `boat-model.js`,
`plane-model.js` with the shared look (materials, tyres, rims, merging) in `veh-look.js`, icons
`client/src/render/icons-vehicles.js`; `bike.js`, `boat.js` (both boats, wake, wind), `plane.js` (biplane and seaplane), `garage.js` (window; block model `client/src/machines/garage-model.js`),
`passengers.js`, HUD and vehicle window `vehicle-ui.js`. State in `vehicles` (`shared/world/state.js`), wind in
`shared/sim/weather.js`, lakes in `shared/world/terrain.js` (+ GLSL twin). Console: `game.spawnVehicle('bike', x, z, yaw)`,
`game.spawnOnLake('sailboat' | 'motorboat' | 'seaplane')`, `game.windAt(day, t)`, `game.toggleCarCam()`.

## 9. Computer and documents
- **Computer** (*Počítač*, OS *ŘíšeOS*): needs power. Desktop with windows, start menu, clock.
  Apps: **Tanky 2D** (tank game vs. AI or 2 players), **Textový editor**, wallpapers, system info.
- **Documents**: write in the editor, **print** on a printer in the same network (needs paper). A printed document
  is an item: read it, put it on a table, hang it on a wall or in a picture frame, give it to another player.

*Kód:* `client/src/pc/` (computer, Tanks, editor, printer window, papers in the world, reading), printing `shared/sim/power.js`, document items `shared/world/papers.js`.

## 10. Multiplayer
- **Marek's army** (secret in the game: not in the guide, no message to anyone else; for the lektor): the player named
  *Marek* commands an army in every dimension with chat commands that are not sent to anyone (the answers go only to him):
  `/armada [n]` (90 units by default and at most: every fifth a crystal golem, the rest Markomen; never attacks Marek), `/utok <player>`, `/stop`,
  `/palac` (builds a palace 16 m in front of him, 20 blocks/s), `/tezit` (digs a pit 8 m in front, ores and some stone go to
  his backpack), `/rozpustit`, `/svet <name>` (club server only: Marek's browser leaves and joins that world by name or id),
  `/markorit [n]` (n markorite ingots, default 64, max. 640), `/pomoc`. When Marek hits a player (a valid hit, fights on) or a mob, the army goes after that one too (`armyHit`).
  `/at <player>` = atomic bomb on that player: everyone sees a missile fall for 2.5 s, then a flash, fireball, mushroom cloud and
  shock wave; the crater removes about 800 blocks (underground voxels and built blocks, not bedrock) and everyone within 16 m
  dies (Marek too, if he stands there), mobs there die. `/meteor` = meteor shower: 30 meteors over 14 s within 34 m of Marek,
  each a small crater and 9 damage within 4.5 m (Marek is spared). Rules `shared/sim/strikes.js`, look `client/src/world/boom.js`
  (`game.boomFx('nuke', x, y, z, t)` shows it without damage). This destroys other players' builds: the lektor may want it only in some worlds. Runs where the world is held (server or browser host); the soldiers are normal mobs
  whose goal comes from `armyPlan`. On the club server the name is protected by the PIN. Code: `shared/sim/army.js`.
- **Fights by choice (key N)** in every multiplayer world: N switches fights on or off (a badge top right, ⚔ in the name tag).
  Two players can hurt each other only when both have them on (pose `pv`, checked by the host in `hitPlayer`). After a hit both
  the attacker and the one hit can't switch them off for 20 s (`['pvlock', 20]`, the badge counts down; the host keeps them in the
  fight even if a client tries). The arena and pvp-mark rules stay as they were. H is still the guide.
- Host in the browser via code, max 6 players, the host's tab is the server, world saved in the host's browser.
- **Server** (Node.js, `npm start`, v2): always-on world on a VPS or a laptop, saved to disk every 30 s with daily backups,
  serves the game itself; its worlds are buttons in the main menu (when the game comes from the server, from a
  `?server=` link, or from the Pages build's `SERVER_URL`), optional password (asked once), max. 8 players by default.
- **Player profiles on the server**: nickname + PIN (asked once per device, then a remembered login); the backpack,
  armor, position and health are saved on the server per player and world (in that world's `world.json`).
  For Richard: the page `/admin` (password `ADMIN_PASSWORD`; players, last seen, last world, who plays now, *Resetovat
  PIN*) and `node server/admin.js players | reset-pin <name>`; the server log shows who logs in, joins and leaves.
- **Several worlds on one server** (`WORLDS`, e.g. *Hlavní svět* + *Kreativní svět*): the main menu shows a button per
  world (name, one line about the world, players n/max, full worlds disabled); the last choice is highlighted and a
  `?world=<id>` link preselects one. Each world has its own buildings, animals, day, players and chat;
  creative mode is on or off for everyone in a world. The backpack and position are saved per player and world on the server. The info box and the
  Esc menu show the world name.
- **Fights between players** (only in a world with the `:pvp` option, e.g. `arena:Aréna:pvp`): another player is a target
  (*hráč · souboj*), a sword or an arrow hurts them. Weapons are tuned for mobs, so a player gets 2.5× the damage (full iron
  sword 15, full arrow 25 of 100 hp; armor protects as against mobs). The host checks every hit: reach 7 m (arrows 90 m),
  0.45 s invulnerability after a hit, no hits on or by dead players or players in creative mode. Other worlds have no fights.
  *Kód:* rules `hitPlayer` in `shared/net/room.js`, the player's side `client/src/player/pvp.js`.
- **Fights only in Markova dimenze** (a world with the `:pvp-mark` option, e.g. `svet:Hlavní svět:pvp-mark`): the same fights,
  but only when both players are in Markova dimenze (behind the portal, `isMark(x)`); everywhere else the other player is no
  target and the host ignores the hit. It stays a normal world: no arena, no kit, your own backpack, normal respawn at the
  shrine, no score table. A knock-out by a player still gets the feed line (*⚔ Ája vyřadil(a) hráče Bára*); a death without a
  player hit is not announced. The world button says *Přežij a stav spolu, v Markově dimenzi se bojuje*.
  *Kód:* the same files; the check is in `hitPlayer` (host) and `pvpPlayers` (player).
- **Arena** (every `:pvp` world): the server builds it once when the world starts, 40 m west of the shrine: a round brick floor
  (radius 13) with a 4-block wall, 8 cover pillars and torches; trees and boulders inside are gone. Joining and every respawn
  put you on a free spot in the arena with the kit (iron sword, bow, 32 arrows, 32 planks, 8 meat, full iron armor) and full
  health; the backpack is replaced. A knock-out gives a point to the player who last hit you (within 10 s); everyone gets a feed
  line (*⚔ Ája vyřadil(a) hráče Bára*) and the score table (top left: player, points, falls). Scores count from the server start.
  The world button in the menu says *Aréna: bojuj mečem a lukem, sbírej body*.
  *Kód:* building `shared/world/arena.js` (from `server/sim.js`), points `arenaDeath` in `shared/net/room.js`, kit, respawn and table `client/src/player/arena.js`.
- **Pause menu** (Esc): code + copy, player list, host can allow creative for one player or everyone, and kick.
- **Chat** (T), only to players in the same world.
- Everyone sees other players in **their own suit** (*Můj oblek*, sent in the position as `lk`), with a modern
  name tag (dark glass, cyan edge, a dot in their light colour, a health bar when hurt; it fades with distance),
  armor plates, the held item, and all the animations (walking, running with dust, swinging per tool, eating with
  crumbs, flying with jet sparks, sitting, red flash when hurt); their blocks, vehicles, animals, day/night. Only one player can have a chest or machine open at a time.

*Kód:* host logic `shared/net/room.js` (browser host and server), world changes `shared/net/ops.js`, `shared/net/net.js`; browser side `client/src/net/` (client messages, avatars, chat and Esc menu, net loop); server `server/` (worlds: `server/worlds.js`, `server/world-worker.js`; profiles: `server/profiles.js`, `server/me.js`; admin: `server/admin-http.js`, `server/admin.js`); menu `client/src/menu/menu.js` (world buttons: `renderWorlds`, login: `askProfile`).

## 11. Sound and music
All sound is made in the browser (WebAudio synthesis, no recordings). Every sound varies a little in pitch (±10 %) and
volume (±15 %) so repeats don't sound like a machine gun; at most 32 short sounds play at once (ambient ones give way first).
A gentle compressor keeps the mix from clipping.
- **Footsteps by material** in the rhythm of the walk (heel + toe on hard floors): grass, leaves and crops, dirt, sand
  (grainy), snow (crunch and squeak), wood (hollow knock), stone, metal and machines (ringing), glass, crystal (chime) and
  shallow water (splash). Running steps are louder. **Landing** after a fall thumps, louder the higher the fall.
  **Water:** jumping or running in splashes, wading deep makes swimming strokes, and with the head under water everything
  is muffled (low-pass) with bubbles.
- **Mining, breaking and placing by material**: each hit of the hold-to-break sounds like the block (quieter and lower than
  the final break, plus a pickaxe clink on stone and ores), the break crumbles (glass shatters, crystal rings), placing knocks.
  Wrong tool: a dull *tonk*. A felled tree crashes with its crown rustling. Sounds come from where the block is (left/right).
- **Items and food**: pick-up *plip* with random pitch, throwing, opening a chest (creaky lid), filling a bucket or the car,
  eating crunches (soup and drinks slurp) and a swallow at the end, tool-break snap (`Sound.toolBreak()`, ready for tool wear).
- **Windows**: soft clicks on buttons, a quiet tick when hovering slots and buttons, pick / put sounds when moving items,
  a rising blip when the backpack opens and a falling one when it closes, a tick when the hotbar slot changes.
- **Ambience** that cross-fades with the place and time: wind by gusts (stronger in tundra, desert and high up; whistling
  in the tundra), leaves rustling in forests, insects by day (a loud drone in the jungle), **birds** by day (warbler,
  tit, cuckoo, dove, woodpecker; jungle calls and parrots; a hawk over the desert) with a **dawn chorus**,
  **crickets** at night, **owls** in night forests, **frogs** at ponds, lapping water; **caves**: low rumble,
  echoing drips and the occasional rock settling, plus **reverb** that grows with depth (also a little under a roof);
  volcano lava rumble and bubbling pops; the Mark dimension: a dark detuned drone and alien sweeps.
- **Things in the world hum** from where they stand (the 4 nearest): campfire and torches crackle, a burning furnace roars,
  a cooking stove sizzles, a running generator hums at 50 Hz, motors whine, electric furnaces and chargers buzz, computers
  whir, powered lamps and live cables buzz softly when you are close, spawners drone, an awake portal and light shards shimmer.
- **Positional sound in multiplayer**: other players' footsteps (by the material under them) and their building and
  breaking are heard from where they are; animal and monster voices (sheep, cow, chicken, wolf, boar, deer, shadow-eater,
  markoman, crystal golem) come from the creature, also for joined players; the golem stomps.
- **Music**: a quiet generated piece (soft piano, pads, bass) plays for 1–3 minutes, then 3–7 minutes of silence, like in
  Minecraft. Day: D dorian; night: A minor; caves: phrygian; the Mark dimension: whole-tone (it comes sooner when you
  arrive). When a piece starts its Czech name shows for a moment under the clock (*♪ Ranní louka*, *♪ Hvězdná noc*,
  *♪ Hlubiny*, *♪ Markova hvězda*…). Turn it off with the **Hudba** slider.
- **Weather hooks** (no weather yet): `Sound.rainLevel = 0–1` plays layered rain (muffled under a roof) and
  `Sound.thunder(distance)` a crackle and rumble delayed by the distance.

*Kód:* `client/src/audio/`: `sound.js` (mix, volumes, positional sound, reverb, test renderer `Sound.offline`), `sfx.js`
(material and game sound recipes), `voices.js` (animals, birds, insects, thunder), `materials.js` (which material is
under the feet / being mined), `ambience.js` (ambience beds and one-shots), `hums.js` (machines and fires), `music.js`,
`soundscape.js` (senses the surroundings each frame, other players, remote edits), `ui-sounds.js` (window sounds),
`volume.js` (slider values). Console: `game.Sound.music.start('night')`, `game.soundEnv`, `game.Sound.level()`.

## 12. Controls (summary)
WASD move · Shift run · Space jump · mouse look · left button mine/attack · right button place/use/eat ·
E inventory · Q / G drop (Ctrl+Q / Shift+G stack) · middle button pick block · C creative · H help · T chat · 1–9 / wheel hotbar · F vehicle (or passenger seat) · L lights · B horn / bell · N nitro · 1/2/3 bike gears · V view (first person / behind / front; vehicle camera in a vehicle) · O suit (*Můj oblek*) · Esc menu.
In vehicles the touch screen adds *Brzda, Převod, Nitro, Klakson/Zvonek/Houkačka, Světla, Kamera, Vystoupit*; a passenger only gets *Kamera* and *Vystoupit*.
Phones and tablets: joystick + buttons (*Těžit, Použít, Skok, Běh, Batoh, Výroba, Pohled…*), landscape only.

*Kód:* keyboard and mouse `client/src/player/player.js`, touch `client/src/ui/touch.js`, settings `client/src/menu/settings.js`.

## 13. Usage statistics (OFF)
Scaffolding only: aggregate PostHog events for a few inventory window actions. It is **switched off** (empty key, opt-in `false`)
and **collects nothing**. Activation is prohibited until a privacy review; see [ANALYTICS.md](ANALYTICS.md).

*Kód:* `client/src/ui/analytics.js`, calls in `client/src/ui/inventory-ui.js`, tests `tests/unit/analytics.test.mjs`.
