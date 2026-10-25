// Router Říše na Cloudflare: to, co na Node serveru dělá server/server.js kromě samotných světů.
//   /ws?world=<id>   WebSocket hráče: pošle ho rovnou do Durable Objectu světa (cloudflare/world.js)
//   /worlds          seznam světů s počtem hráčů (menu, bez hesla)
//   /health          stav pro kontrolu (a pro nasazení: nenasazovat, když někdo hraje)
//   /admin/…         stěhování z Node serveru: POST /admin/import/players, POST /admin/import/world/<id> (Bearer ADMIN_PASSWORD)
//   ostatní          hra (dist/) jako statické soubory; do index.html se vloží <meta name="louka-server">
// Profily hráčů (jméno + PIN, server/profiles.js) drží jeden Durable Object Profiles; světy volají jeho login.
import { DurableObject } from 'cloudflare:workers';
import { createProfiles } from '../server/profiles.js';
import { doId } from './store.js';

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const binding = (id) => 'WORLD_' + id.replace(/-/g, '_');

export class Profiles extends DurableObject {
  async profiles() {
    if (!this.p) {
      const data = (await this.ctx.storage.get('players')) ?? null;
      this.p ??= createProfiles(null, { data, store: (d) => { this.ctx.storage.put('players', d); }, log: console.log });
    }
    return this.p;
  }

  /** Přihlášení (server/profiles.js login); světu vrátí jen id a jméno, ne otisky PINu. */
  async login(h) {
    const r = (await this.profiles()).login(h);
    if (!r.ok) return r;
    return { ok: true, profile: { id: r.profile.id, name: r.profile.name }, token: r.token, created: !!r.created, newPin: !!r.newPin };
  }

  async seen(id) { if (id) (await this.profiles()).seen(id); }

  async count() { return (await this.profiles()).size; }

  /** Nahraje players.json z Node serveru. Jen když tu ještě žádný profil není. */
  async importPlayers(data) {
    if ((await this.profiles()).size) return { ok: false, error: 'Profily už tu jsou.' };
    if (!Array.isArray(data?.players)) return { ok: false, error: 'Tohle není players.json.' };
    await this.ctx.storage.put('players', data);
    this.p = null;
    return { ok: true, players: (await this.profiles()).size };
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const worlds = JSON.parse(env.WORLDS);
    const max = Number(env.MAX_PLAYERS || 8);
    const world = (id) => env[binding(id)].get(doId(env[binding(id)], 'world'));

    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Čekám WebSocket.', { status: 426 });
      // bez ?world (starý klient): první svět; když hráč chce jiný, svět mu pošle seznam (['worlds', …])
      const id = String(url.searchParams.get('world') || '').toLowerCase();
      const w = worlds.find((x) => x.id === id) || worlds[0];
      return world(w.id).fetch(req);
    }
    if (url.pathname === '/worlds' || url.pathname === '/health') {
      const counts = await Promise.all(worlds.map((w) => world(w.id).stats().catch(() => ({ players: 0 }))));
      const list = worlds.map((w, i) => ({ id: w.id, name: w.name, creative: w.creative, pvp: !!w.pvp, players: counts[i].players, max }));
      if (url.pathname === '/worlds') return json(list);
      return json({ ok: true, louka: 2, cloudflare: true, players: list.reduce((a, w) => a + w.players, 0), max: max * worlds.length, password: !!env.ROOM_PASSWORD, worlds: list });
    }
    if (url.pathname.startsWith('/admin')) return admin(req, url, env, worlds, world);

    // hra: statické soubory; index.html dostane značku, podle které menu ukáže světy tohoto serveru
    const res = await env.ASSETS.fetch(req);
    if (!(res.headers.get('content-type') || '').startsWith('text/html')) return res;
    const info = JSON.stringify({ password: !!env.ROOM_PASSWORD }).replace(/"/g, '&quot;');
    const html = (await res.text()).replace('<head>', `<head>\n  <meta name="louka-server" content="${info}">`);
    return new Response(html, { status: res.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
  },
};

// Stěhování z Node serveru (jednou). Stránka /admin se seznamem hráčů a resetem PINu tu zatím není.
async function admin(req, url, env, worlds, world) {
  const pass = env.ADMIN_PASSWORD || '';
  if (!pass) return new Response('Správa je vypnutá (ADMIN_PASSWORD není nastavené).', { status: 404 });
  if (req.headers.get('Authorization') !== `Bearer ${pass}`) return new Response('Špatné heslo.', { status: 401 });
  if (req.method !== 'POST') return new Response('Stránka /admin na Cloudflare zatím není.', { status: 501 });
  let data;
  try { data = await req.json(); } catch { return json({ ok: false, error: 'Čekám JSON.' }, 400); }
  if (url.pathname === '/admin/import/players') return json(await env.PROFILES.get(doId(env.PROFILES, 'profiles')).importPlayers(data));
  const m = url.pathname.match(/^\/admin\/import\/world\/([a-z0-9_-]+)$/);
  if (m && worlds.some((w) => w.id === m[1])) return json(await world(m[1]).importSave(data));
  return json({ ok: false, error: 'Neznámá adresa.' }, 404);
}
