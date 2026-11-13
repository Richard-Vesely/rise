// Správa hráčů pro lektora:
// - stránka GET /admin na herním serveru (heslo ADMIN_PASSWORD přes HTTP Basic; bez ADMIN_PASSWORD je vypnutá):
//   seznam hráčů a tlačítko „Resetovat PIN“ u každého. Funguje i na mobilu.
// - stránka GET /admin/dary: dary do pokladničky u sochy a formulář „Dát hráči předmět“ (server/donations-admin.js).
// - místní správcovská adresa jen na 127.0.0.1 pro `node server/admin.js` (port a náhodný klíč v DATA_DIR/admin.json).
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { donationsAdmin } from './donations-admin.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const date = (s) => (s ? new Date(s).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
const sameText = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

/**
 * Seznam hráčů pro správu (bez otisků PINů a tokenů).
 * @param {ReturnType<import('./profiles.js').createProfiles>} profiles
 * @param {() => Map<string, string>} online id profilu -> jméno světa, kde právě hraje
 */
export function playerList(profiles, online) {
  const on = online();
  return profiles.list()
    .map((p) => ({ id: p.id, name: p.name, created: p.created, lastSeen: p.lastSeen, lastWorld: p.lastWorld, online: on.get(p.id) || null, pin: !!p.pinHash }))
    .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || String(b.lastSeen).localeCompare(String(a.lastSeen)));
}

/**
 * Obsluha /admin (HTTP Basic, uživatel libovolný, heslo ADMIN_PASSWORD).
 * @param {{ password: string, profiles: any, online: () => Map<string, string>, worldName: (id: string) => string, log: (msg: string) => void,
 *   donations?: any, give?: (to: string, id: string, n: number) => object|null }} o donations + give = stránka /admin/dary
 * @returns {(req: http.IncomingMessage, res: http.ServerResponse) => void}
 */
export function adminPage({ password, profiles, online, worldName, log, donations = null, give = () => null }) {
  const fails = new Map(); // adresa -> { n, until }: 10 špatných hesel = minuta čekání
  const dary = donations ? donationsAdmin({ donations, profiles, online, give, worldName, log }) : null;
  return (req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    if (!password) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Správa je vypnutá (na serveru není nastavené ADMIN_PASSWORD).'); return; }
    const ip = req.socket.remoteAddress || '', f = fails.get(ip);
    if (f && f.until > Date.now()) { res.writeHead(429, { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '60' }); res.end('Moc špatných pokusů. Zkus to za minutu.'); return; }
    const auth = /^Basic (.+)$/i.exec(req.headers.authorization || '');
    const given = auth ? Buffer.from(auth[1], 'base64').toString('utf8').replace(/^[^:]*:/, '') : null;
    if (given == null || !sameText(given, password)) {
      if (given != null) { const n = (f?.n || 0) + 1; fails.set(ip, n >= 10 ? { n: 0, until: Date.now() + 60_000 } : { n, until: 0 }); log(`Správa: špatné heslo (${ip}).`); }
      res.writeHead(401, { 'www-authenticate': 'Basic realm="Rise - sprava", charset="UTF-8"', 'content-type': 'text/plain; charset=utf-8' });
      res.end('Je potřeba heslo správce.');
      return;
    }
    fails.delete(ip);
    const head = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin' };
    if (req.method === 'POST') {
      // formuláře jen z vlastní stránky (cizí stránka nesmí poslat formulář s uloženým heslem prohlížeče)
      const origin = req.headers.origin;
      let from = null;
      try { from = origin && new URL(origin).host; } catch {}
      if (origin && from !== req.headers.host) { res.writeHead(403); res.end(); return; }
    }
    if (dary && (url.pathname === '/admin/dary' || url.pathname === '/admin/give')) return dary(req, res, url, head);
    if (req.method === 'POST' && url.pathname === '/admin/reset-pin') {
      let body = '';
      req.on('data', (d) => { body += d; if (body.length > 1000) req.destroy(); });
      req.on('end', () => {
        const id = new URLSearchParams(body).get('id') || '';
        const p = profiles.get(id) && profiles.resetPin(id);
        if (p) log(`Správa: PIN hráče ${p.name} smazán (nastaví si nový při dalším přihlášení).`);
        res.writeHead(303, { location: '/admin?' + new URLSearchParams(p ? { reset: p.name } : { err: '1' }) });
        res.end();
      });
      return;
    }
    if (req.method !== 'GET' || url.pathname !== '/admin') { res.writeHead(404, head); res.end('Nenalezeno'); return; }
    res.writeHead(200, head);
    res.end(renderPage(playerList(profiles, online), worldName, url.searchParams));
  };
}

function renderPage(list, worldName, q) {
  const now = list.filter((p) => p.online).length;
  const note = q.get('reset') ? `<p class="ok">PIN hráče <b>${esc(q.get('reset'))}</b> je smazaný. Při dalším přihlášení si vymyslí nový.</p>` : q.get('err') ? '<p class="err">Hráč nenalezen.</p>' : '';
  const rows = list.map((p) => `<tr>
    <td data-l="Jméno"><b>${esc(p.name)}</b>${p.pin ? '' : ' <small>(bez PINu)</small>'}</td>
    <td data-l="Hraje teď">${p.online ? `<span class="on">● ${esc(p.online)}</span>` : '–'}</td>
    <td data-l="Naposledy">${esc(date(p.lastSeen))}</td>
    <td data-l="Poslední svět">${esc(p.lastWorld ? worldName(p.lastWorld) : '–')}</td>
    <td data-l="Založen">${esc(date(p.created))}</td>
    <td><form method="post" action="/admin/reset-pin" data-name="${esc(p.name)}" onsubmit="return confirm('Smazat PIN hráče ' + this.dataset.name + '? Při dalším přihlášení si nastaví nový.')"><input type="hidden" name="id" value="${esc(p.id)}"><button>Resetovat PIN</button></form></td>
  </tr>`).join('');
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Říše – hráči</title><style>
:root { color-scheme: light dark; --bg: #f6f4ef; --fg: #1d1d22; --mute: #6b6b75; --line: #dddad2; --card: #fff; --acc: #2f7d3b; --err: #a33; }
@media (prefers-color-scheme: dark) { :root { --bg: #17171b; --fg: #ececf0; --mute: #9a9aa5; --line: #2c2c33; --card: #1f1f25; --acc: #6cc47a; --err: #f08080; } }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
h1 { font-size: 22px; margin: 0 0 4px; } .sub { color: var(--mute); margin: 0 0 14px; }
table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: middle; }
th { font-size: 13px; color: var(--mute); font-weight: 600; } small { color: var(--mute); }
.on { color: var(--acc); font-weight: 600; } .ok { color: var(--acc); } .err { color: var(--err); } a { color: var(--acc); }
button { font: inherit; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); cursor: pointer; }
@media (max-width: 640px) {
  thead { display: none; } table, tbody, tr, td { display: block; width: auto; } tr { padding: 8px 0; border-bottom: 1px solid var(--line); }
  td { border: 0; padding: 3px 12px; } td[data-l]::before { content: attr(data-l) ': '; color: var(--mute); font-size: 13px; }
}
</style></head><body>
<h1>Říše – hráči</h1><p class="sub">${list.length} ${list.length === 1 ? 'hráč' : list.length >= 2 && list.length <= 4 ? 'hráči' : 'hráčů'} · teď hraje ${now} · <a href="/admin/dary">Dary a dárky →</a></p>${note}
${list.length ? `<table><thead><tr><th>Jméno</th><th>Hraje teď</th><th>Naposledy</th><th>Poslední svět</th><th>Založen</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p>Zatím se nikdo nepřihlásil.</p>'}
<p class="sub">Resetovat PIN: hráč si při dalším přihlášení vymyslí nový (jeho batoh zůstane). Ostatní zařízení se odhlásí.</p>
</body></html>`;
}

/**
 * Místní správcovská adresa pro `node server/admin.js` (jen 127.0.0.1, náhodný port a klíč v DATA_DIR/admin.json, práva 600).
 * @returns {Promise<() => Promise<void>>} zavření (smaže admin.json)
 */
export async function startAdminListener({ dataDir, profiles, online, log }) {
  const key = crypto.randomBytes(24).toString('hex'), file = path.join(dataDir, 'admin.json');
  const srv = http.createServer((req, res) => {
    const json = (code, data) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    if (req.method !== 'POST' || !sameText(req.headers['x-admin-key'] || '', key)) { json(403, { ok: false }); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1000) req.destroy(); });
    req.on('end', () => {
      let q = {};
      try { q = JSON.parse(body || '{}'); } catch {}
      if (req.url === '/players') { json(200, { ok: true, players: playerList(profiles, online) }); return; }
      if (req.url === '/reset-pin') {
        const p = profiles.resetPin(String(q.name || ''));
        if (p) log(`Správa (příkazová řádka): PIN hráče ${p.name} smazán.`);
        json(200, p ? { ok: true, name: p.name } : { ok: false });
        return;
      }
      json(404, { ok: false });
    });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ port: srv.address().port, key, pid: process.pid }), { mode: 0o600 });
  return async () => {
    try { if (JSON.parse(fs.readFileSync(file, 'utf8')).key === key) fs.unlinkSync(file); } catch {}
    await new Promise((ok) => srv.close(ok));
  };
}
