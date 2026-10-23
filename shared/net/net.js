// Síťová vrstva, kterou vidí herní pravidla. Ve hře pro jednoho nic neposílá; prohlížeč (client/src/game/boot.js)
// nebo server (server/sim.js) ji při startu nastaví: režim, jméno, kdo jsou hráči (cíle tvorů) a kam posílat zprávy.
export const NET = {
  mode: 'sp', // 'sp' = hra pro jednoho, 'host' = server v prohlížeči, 'client' = připojený hráč, 'server' = Node.js server
  host: false, client: false, name: 'Hráč',
  ready: false, silent: 0, ops: [], mobN: 0, uidN: 0, killer: null,
  perm: true, // smí hráč používat kreativní režim?
  pvpOn: false, // hráč u obrazovky si zapnul souboje (Esc menu; bojuje jen s hráči, kteří je mají také zapnuté, pose.pv)
  pvp: false, // můžou se hráči v tomhle světě navzájem zranit? (svět s volbou pvp na serveru; pravidla: hitPlayer v shared/net/room.js)
  uidPrefix: 'h', // začátek jedinečných id (vyhozené předměty, dokumenty, auta…)
  // Změna světa: ve hře pro více hráčů se rozešle ostatním (při přehrávání cizí změny se neposílá).
  op(o) { if (this.mode !== 'sp' && this.ready && !this.silent) this.ops.push(o); },
  quiet(fn) { this.silent++; try { return fn(); } finally { this.silent--; } },
  uid() { return `${this.uidPrefix}-${++this.uidN}-${Math.random().toString(36).slice(2, 6)}`; },
  req() {}, give() {}, sendTo() {}, update() {},
  // Cíle tvorů: hráči { pos, alive, creative, set, safe, pid } (pid null = hráč u této obrazovky).
  targets() { return []; },
  spawnCenter() { return null; },
  nearestDist() { return Infinity; },
  // Hráč u této obrazovky (ve hře pro jednoho a u hostitele): kořist z tvora poblíž a zranění od tvora.
  localLoot: null, // (m, id, n) => void
  hurtLocal: null, // (dmg, dx, dz) => void
  dirtyBlocks: false, dirtyForest: false,
  // multiplayer: kód / adresa serveru, id tohoto hráče, kreativní režim pro všechny, max. hráčů, časovače zpráv
  code: '', pid: null, allowAll: false, maxPlayers: 6, kvLast: {}, pend: new Map(), poseT: 0, mobT: 0, kvT: 0, boxT: 0,
};

// Okna strojů a truhel otevřená hráči v multiplayeru: hostitel je mezitím nesimuluje (klíč -> do kdy), aby se změny nepřepsaly a předměty nezdvojily
export const uiBusy = new Map();
export const isBusy = (k) => (uiBusy.get(k) || 0) > performance.now();
export const r2 = (v) => Math.round(v * 100) / 100;
export const nearestTarget = (list, p) => {
  let best = list[0], bd = Infinity;
  for (const t of list) { const d = (t.pos.x - p.x) ** 2 + (t.pos.z - p.z) ** 2; if (d < bd) { bd = d; best = t; } }
  return best;
};
