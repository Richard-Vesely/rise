// Vězení serveru kroužku (jen server v Node.js, běží ve vlákně světa server/world-worker.js). Pravomoc vlastníka
// serveru (Richard, AGENTS.md pravidlo 11): neměň ji a nedávej ji nikomu jinému.
// 1. Vlastník (OWNER_ID, server/owner.js) napíše do chatu /vezeni <jméno> = hráč jde do vězení, /propustit <jméno> = je volný,
//    /vezeni bez jména = kdo je ve vězení. Příkaz se nikomu nerozesílá. Od kohokoli jiného je to obyčejná zpráva v chatu.
// 2. Kdo zabije vlastníka (souboj hráčů, shared/net/room.js arenaDeath → room.onKill), jde do vězení sám.
// 3. Vězení je bludiště (shared/world/prison.js) se čtyřmi branami. Při zavření dostane vězeň náhodně jednu bránu
//    a jeden úkol (server/prison-tasks.js): zabít pavouky, najít runy, nebo u brány vyřešit příklady / hádanky.
//    Hotový úkol + pravé tlačítko na svou bránu = volný, zpátky na spawn. Smrt: zpátky na start bludiště, úkol zůstává.
// Ve vězení se nestaví ani nekope (guardPrisonerOps) a vězeň, který se dostane ven (let, podvod) nebo vyletí nad zdi
// bludiště (křídla, raketový batoh, lektvar létání), se hned vrátí na start bludiště.
// Kdo je ve vězení a jak daleko je s úkolem, se ukládá se světem (world.json → prison: { prisoners: { id profilu:
// { name, exit, kind, need, done, runes } } }), takže to platí i po restartu a novém přihlášení. Otázka u brány se neukládá.
//   hráč → server: ['vez', 'gate' | 'rune', x, y, z] pravé tlačítko na bránu / runu · ['vez', 'ans', text] odpověď
//   server → hráč: ['vezeni', { on, at: [x, y, z], go?, exit: [x, z], ex, kind, need, done, text }] (go = přenést hned)
//                  ['vezq', otázka | null] otevře (zavře) okno s otázkou u brány
import { PRISON, PRISON_EXITS, PRISON_SPOT, SPAWN_SPOT, exitAt, inPrison, prisonRunes, runeAt } from '../shared/world/prison.js';
import { isOwner } from './owner.js';
import { TASK_KINDS, TASK_NEED, newTask, rightAnswer, taskQuestion, taskText } from './prison-tasks.js';

const NAME = '⛓ Vězení';
const RESEND_MS = 2000; // vězeň mimo vězení (nebo volný hráč ve vězení) se přenese nejvýš jednou za 2 s
const REACH = 6; // m: na bránu a runu musí hráč dosáhnout
const WRONG_WAIT_MS = 3000; // po špatné odpovědi chvíli nová otázka nepřijde (žádné hádání naslepo)
/** Jméno nebo příkaz bez diakritiky a velkých písmen (porovnávání). */
export const plainName = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs').trim();
const ABOVE_WALLS = PRISON.y + PRISON.wall; // vězeň s nohama výš (3 bloky nad podlahou) letí nad bludištěm
const KIND_SHORT = { monsters: 'pavouci', runes: 'runy', math: 'příklady', logic: 'hádanky' };

/** Uložený vězeň → platný stav (starý formát s oky pavouka dostane nový úkol). */
function cleanPrisoner(p, rnd) {
  const name = String(p.name || '').slice(0, 16);
  const exit = Number.isInteger(p.exit) && p.exit >= 0 && p.exit < PRISON_EXITS.length ? p.exit : Math.floor(rnd() * PRISON_EXITS.length);
  const t = TASK_KINDS.includes(p.kind) ? { kind: p.kind, need: TASK_NEED[p.kind] } : newTask(rnd);
  const runes = t.kind === 'runes' && Array.isArray(p.runes) ? [...new Set(p.runes.filter((r) => Number.isInteger(r) && r >= 0 && r < prisonRunes().length))] : [];
  const done = t.kind === 'runes' ? runes.length : Number.isInteger(p.done) && p.done > 0 ? p.done : 0;
  return { name, exit, kind: t.kind, need: t.need, done: Math.min(done, t.need), runes };
}

/**
 * @param {object} o
 * @param {string} o.ownerId id profilu vlastníka ('' = nikdo: příkazy nefungují, zabití nikoho nezavře)
 * @param {string} [o.ownerName] jeho přezdívka (do textů pro hráče)
 * @param {unknown} [o.saved] uložený stav (world.json → prison)
 * @param {(cid: string, msg: unknown[]) => void} o.send zpráva jednomu hráči
 * @param {() => Iterable<[string, { profile: string|null, name: string }]>} o.conns hráči ve světě [cid, { profile, name }]
 * @param {(name: string, done: (p: { id: string, name: string } | null) => void) => void} o.lookup profil podle jména (i hráče, který tu teď není)
 * @param {(text: string) => void} [o.log]
 * @param {() => number} [o.now]
 * @param {() => number} [o.rnd] náhoda (brána, úkol, otázky; testy)
 * @param {(kind: string, rnd: () => number) => { q: string, a: string }} [o.question] otázka u brány (testy)
 */
export function createPrison({ ownerId, ownerName = '', saved, send, conns, lookup, log = () => {}, now = Date.now, rnd = Math.random, question = taskQuestion }) {
  /** @type {Map<string, { name: string, exit: number, kind: string, need: number, done: number, runes: number[] }>} id profilu -> vězeň */
  const prisoners = new Map();
  const list = /** @type {any} */ (saved)?.prisoners;
  if (list && typeof list === 'object') for (const [id, p] of Object.entries(list)) {
    if (!p || typeof p !== 'object' || isOwner(ownerId, id)) continue; // vlastník ve vězení nikdy není
    prisoners.set(id, cleanPrisoner(p, rnd));
  }
  const seen = new Map(); // cid -> kdy jsme mu naposledy poslali, kde má být (0 = ještě nikdy od vstupu)
  const where = new Map(); // cid -> poslední poloha { x, y, z }
  const asks = new Map(); // cid -> { a } otevřená otázka u brány (správná odpověď zůstává jen tady)
  const waits = new Map(); // cid -> do kdy po špatné odpovědi nepřijde nová otázka
  const who = ownerName || 'Vlastník serveru';
  const reply = (cid, t) => send(cid, ['chat', NAME, t]);
  const toast = (cid, t) => send(cid, ['toast', t]);
  const online = (profile) => [...conns()].filter(([, c]) => c.profile && c.profile === profile).map(([cid]) => cid);
  const exitName = (p) => `${PRISON_EXITS[p.exit].name} brána`;
  const state = (p, go) => ['vezeni', {
    on: true, at: PRISON_SPOT, exit: PRISON_EXITS[p.exit].at, ex: PRISON_EXITS[p.exit].name,
    kind: p.kind, need: p.need, done: p.done, text: taskText(p.kind, p.need), ...(go ? { go: 1 } : {}),
  }];
  const free = ['vezeni', { on: false, at: SPAWN_SPOT, go: 1 }];
  const toOwner = (t) => { for (const [cid, c] of conns()) if (isOwner(ownerId, c.profile)) reply(cid, t); };
  const short = (p) => `${p.name} (${KIND_SHORT[p.kind]} ${p.done}/${p.need}, ${exitName(p)})`;
  const update = (profile, p) => { for (const cid of online(profile)) send(cid, state(p, false)); };
  const tellTask = (cid, p) => reply(cid, `Jsi v bludišti. Ven tě pustí jen ${exitName(p)} (na kompasu ⛓). Úkol: ${taskText(p.kind, p.need)}.`);

  function jail(profile, name, why) {
    if (prisoners.has(profile)) return false;
    const p = { name: String(name).slice(0, 16), exit: Math.floor(rnd() * PRISON_EXITS.length), ...newTask(rnd), done: 0, runes: [] };
    prisoners.set(profile, p);
    log(`vězení: ${p.name} ${why === 'kill' ? 'zabil vlastníka serveru' : 'poslán vlastníkem'} (${p.kind}, ${PRISON_EXITS[p.exit].id})`);
    for (const cid of online(profile)) {
      send(cid, state(p, true));
      seen.set(cid, now());
      toast(cid, why === 'kill' ? 'Zabil(a) jsi vlastníka serveru. Jdeš do vězení!' : `${who} tě poslal(a) do vězení!`);
      tellTask(cid, p);
    }
    return true;
  }
  function release(profile, why) {
    const p = prisoners.get(profile);
    if (!p) return false;
    prisoners.delete(profile);
    log(`vězení: ${p.name} je volný (${why === 'solved' ? 'splnil úkol' : 'propustil ho vlastník'})`);
    for (const cid of online(profile)) {
      asks.delete(cid);
      send(cid, ['vezq', null]);
      send(cid, free);
      seen.set(cid, now());
      toast(cid, why === 'solved' ? 'Brána se otevřela. Jsi volný(á)!' : `${who} tě propustil(a) z vězení.`);
    }
    if (why === 'solved') toOwner(`${p.name} splnil(a) úkol a utekl(a) z vězení.`);
    return true;
  }
  // Hráč podle jména: nejdřív ve světě, pak v profilech serveru (i když teď nehraje).
  function find(name, done) {
    const key = plainName(name);
    for (const [, c] of conns()) if (c.profile && plainName(c.name) === key) return done({ id: c.profile, name: c.name });
    lookup(name, done);
  }

  function command(cid, text) {
    const [cmd, ...rest] = text.slice(1).split(/\s+/);
    const c = plainName(cmd), arg = rest.join(' ').trim();
    if (c !== 'vezeni' && c !== 'propustit') return false;
    if (c === 'vezeni' && !arg) {
      reply(cid, prisoners.size ? 'Ve vězení: ' + [...prisoners.values()].map(short).join(', ') : 'Ve vězení nikdo není.');
      return true;
    }
    if (c === 'propustit') {
      const key = plainName(arg);
      const hit = [...prisoners].find(([, p]) => plainName(p.name) === key);
      if (!arg || !hit) { reply(cid, `${arg || 'Ten hráč'} ve vězení není.`); return true; }
      release(hit[0], 'owner');
      reply(cid, `${hit[1].name} je volný(á).`);
      return true;
    }
    find(arg, (p) => {
      if (!p) { reply(cid, `Hráče „${arg}“ neznám.`); return; }
      if (isOwner(ownerId, p.id)) { reply(cid, 'Sebe do vězení poslat nemůžeš.'); return; }
      const was = prisoners.get(p.id);
      if (was) { reply(cid, `${short(was)} už ve vězení je.`); return; }
      jail(p.id, p.name, 'owner');
      reply(cid, `${short(prisoners.get(p.id))} je v bludišti.`);
    });
    return true;
  }

  // Dosáhne hráč na blok (x, y, z)? (poloha, kterou hlásil serveru)
  const reach = (cid, x, y, z) => {
    const q = where.get(cid);
    return !!q && Math.hypot(q.x - (x + 0.5), q.y + 1.5 - (y + 0.5), q.z - (z + 0.5)) <= REACH;
  };
  const finished = (cid, p) => toast(cid, `Hotovo! Teď ke své bráně: ${exitName(p)} (kompas ⛓).`);

  function ask(cid, p) {
    if (now() < (waits.get(cid) ?? 0)) { toast(cid, 'Chvilku počkej, brána přemýšlí…'); return; }
    const q = question(p.kind, rnd);
    asks.set(cid, { a: q.a });
    // Pořadí na vlastním řádku a slovy: „1/3 · 5 × 6 + 3“ děti četly jako ⅓ krát… (· je ve škole násobení)
    send(cid, ['vezq', `${p.kind === 'math' ? 'Příklad' : 'Hádanka'} ${p.done + 1} ze ${p.need}\n${q.q}`]);
  }
  // Pravé tlačítko na bránu.
  function gate(cid, profile, p, x, y, z) {
    const i = exitAt(x, y, z);
    if (i < 0 || !reach(cid, x, y, z)) return;
    if (i !== p.exit) { toast(cid, `Tahle brána tě nepustí. Tvoje je ${exitName(p)} (kompas ⛓).`); return; }
    if (p.kind === 'math' || p.kind === 'logic') { ask(cid, p); return; }
    if (p.done >= p.need) { release(profile, 'solved'); return; }
    toast(cid, `Brána je zavřená. Nejdřív: ${taskText(p.kind, p.need)} (${p.done}/${p.need}).`);
  }
  // Odpověď z okna u brány.
  function answer(cid, profile, p, text) {
    const q = asks.get(cid);
    if (!q) return;
    asks.delete(cid);
    if (!rightAnswer(q.a, text)) {
      waits.set(cid, now() + WRONG_WAIT_MS);
      send(cid, ['vezq', null]);
      toast(cid, `Špatně, správně bylo ${q.a}. Zkus to znovu u brány.`);
      return;
    }
    p.done++;
    if (p.done >= p.need) { release(profile, 'solved'); return; }
    update(profile, p);
    toast(cid, `Správně! ${p.done}/${p.need}`);
    ask(cid, p);
  }
  // Pravé tlačítko na runu.
  function rune(cid, profile, p, x, y, z) {
    const r = runeAt(x, y, z);
    if (r < 0 || !reach(cid, x, y, z)) return;
    if (p.kind !== 'runes') { toast(cid, 'Runa tiše září. Tvůj úkol je jiný.'); return; }
    if (p.done >= p.need) { finished(cid, p); return; }
    if (p.runes.includes(r)) { toast(cid, `Tuhle runu už máš (${p.done}/${p.need}). Najdi jinou.`); return; }
    p.runes.push(r);
    p.done = p.runes.length;
    update(profile, p);
    if (p.done >= p.need) finished(cid, p); else toast(cid, `Runa se rozzářila! ${p.done}/${p.need}`);
  }

  // Poloha hráče: vězeň patří do vězení, volný hráč (kromě vlastníka) ne.
  function pose(cid, profile, q) {
    if (!profile || !q || typeof q !== 'object' || ![q.x, q.y, q.z].every(Number.isFinite)) return;
    where.set(cid, { x: q.x, y: q.y, z: q.z });
    const p = prisoners.get(profile), last = seen.get(cid);
    if (p && last === undefined) { send(cid, state(p, true)); seen.set(cid, now()); tellTask(cid, p); return; } // první poloha po vstupu: do vězení
    if (q.alive === false || now() - (last ?? 0) < RESEND_MS) return;
    const inside = inPrison(q.x, q.y, q.z) && !(p && q.y > ABOVE_WALLS); // nad zdmi vězeň nesmí: přeletěl by bludiště
    if (p && !inside) { send(cid, state(p, true)); seen.set(cid, now()); }
    else if (!p && inside && !isOwner(ownerId, profile)) { send(cid, free); seen.set(cid, now()); } // propuštěn, když tu nebyl
  }

  return {
    /**
     * Zpráva od hráče. Vrací true, když ji vyřídilo vězení (místnost ji pak už nedostane).
     * @param {string} cid
     * @param {string|null} profile
     * @param {unknown[]} msg
     */
    handle(cid, profile, msg) {
      switch (msg[0]) {
        case 'chat': {
          const text = String(msg[1] ?? '').slice(0, 200).trim();
          if (!text.startsWith('/')) return false;
          if (isOwner(ownerId, profile)) return command(cid, text);
          if (profile && prisoners.has(profile)) { reply(cid, 'Ve vězení příkazy nefungují.'); return true; } // ani armáda, ani /svet
          return false;
        }
        case 'vez': {
          const p = profile ? prisoners.get(profile) : null;
          if (!p) return true;
          const [, what, x, y, z] = msg;
          if (what === 'ans') answer(cid, profile, p, String(x ?? '').slice(0, 60));
          else if ([x, y, z].every(Number.isInteger)) {
            if (what === 'gate') gate(cid, profile, p, x, y, z);
            else if (what === 'rune') rune(cid, profile, p, x, y, z);
          }
          return true;
        }
        case 'pose': pose(cid, profile, msg[1]); return false;
      }
      return false;
    },
    /** Hráč killer zabil hráče victim (cid z místnosti): kdo zabije vlastníka, jde do vězení. */
    onKill(killer, victim) {
      const c = new Map(conns());
      const k = c.get(killer), v = c.get(victim);
      if (!k?.profile || !v || !isOwner(ownerId, v.profile) || isOwner(ownerId, k.profile)) return false;
      return jail(k.profile, k.name, 'kill');
    },
    /** Hráč (cid) zabil tvora m: pavouk v bludišti se počítá vězni s úkolem 'monsters'. */
    onMobKill(cid, m) {
      const c = new Map(conns()).get(cid), p = c?.profile ? prisoners.get(c.profile) : null;
      if (!p || p.kind !== 'monsters' || m?.type !== 'spider' || !m.pos || !inPrison(m.pos.x, m.pos.y, m.pos.z) || p.done >= p.need) return false;
      p.done++;
      update(c.profile, p);
      if (p.done >= p.need) finished(cid, p); else toast(cid, `Pavouk padl! ${p.done}/${p.need}`);
      return true;
    },
    /** Je profil ve vězení? */
    isPrisoner: (profile) => !!profile && prisoners.has(profile),
    /** Hráč odešel ze světa. */
    gone(cid) { seen.delete(cid); where.delete(cid); asks.delete(cid); waits.delete(cid); },
    /** Vězni [[id profilu, { name, exit, kind, need, done, runes }]…] (testy, přehled). */
    list: () => [...prisoners].map(([id, p]) => [id, { ...p, runes: [...p.runes] }]),
    /** Stav do world.json. */
    save: () => ({ prisoners: Object.fromEntries([...prisoners].map(([id, p]) => [id, { ...p, runes: [...p.runes] }])) }),
  };
}
