// Stránka /admin/dary pro správce (za heslem stránky /admin, server/admin-http.js): kolik kdo daroval do pokladničky
// u sochy, všechny dary (nejnovější první), dárky od správce a formulář „Dát hráči předmět“ (odměna, bonus).
// Dárek se doručí do batohu hned, když hráč hraje, jinak při jeho dalším přihlášení (server/donations.js).
import { ITEMS } from '../shared/data/index.js';
import { GIFT_MAX } from './donations.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const date = (s) => (s ? new Date(s).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
const itemName = (id) => (Object.hasOwn(ITEMS, id) ? ITEMS[id].name : id);

/**
 * Obsluha /admin/dary (GET) a /admin/give (POST). Heslo a původ formuláře už zkontrolovala server/admin-http.js.
 * @param {{ donations: ReturnType<import('./donations.js').createDonations>, profiles: any, online: () => Map<string, string>,
 *   give: (to: string, id: string, n: number) => object|null, worldName: (id: string) => string, log: (msg: string) => void }} o
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, url: URL, head: object) => void}
 */
export function donationsAdmin({ donations, profiles, online, give, worldName, log }) {
  const nameOf = (id) => profiles.get(id)?.name;
  return (req, res, url, head) => {
    if (req.method === 'POST' && url.pathname === '/admin/give') {
      let body = '';
      req.on('data', (d) => { body += d; if (body.length > 1000) req.destroy(); });
      req.on('end', () => {
        const q = new URLSearchParams(body);
        const to = q.get('to') || '', id = (q.get('id') || '').trim(), n = Number(q.get('n'));
        const p = profiles.get(to);
        const g = p && give(to, id, n);
        if (g) log(`Správa: dárek pro ${p.name}: ${n}× ${id}${online().has(to) ? ' (hned do batohu)' : ' (při dalším přihlášení)'}.`);
        res.writeHead(303, { location: '/admin/dary?' + new URLSearchParams(g ? { gave: `${n}× ${itemName(id)} pro ${p.name}` } : { err: !p ? 'Hráč nenalezen.' : `Neznámý předmět nebo počet (1–${GIFT_MAX}).` }) });
        res.end();
      });
      return;
    }
    if (req.method !== 'GET' || url.pathname !== '/admin/dary') { res.writeHead(404, head); res.end('Nenalezeno'); return; }
    res.writeHead(200, head);
    res.end(renderPage({ donations, nameOf, players: profiles.list(), on: online(), worldName, q: url.searchParams }));
  };
}

function renderPage({ donations, nameOf, players, on, worldName, q }) {
  const totals = donations.totals(nameOf), list = donations.list(), gifts = donations.gifts();
  const sum = totals.reduce((a, s) => a + s.n, 0);
  const note = q.get('gave') ? `<p class="ok">Dárek odeslán: <b>${esc(q.get('gave'))}</b>.</p>` : q.get('err') ? `<p class="err">${esc(q.get('err'))}</p>` : '';
  const opts = players.slice().sort((a, b) => a.name.localeCompare(b.name, 'cs'))
    .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${on.has(p.id) ? ' (hraje)' : ''}</option>`).join('');
  const items = Object.keys(ITEMS).map((id) => `<option value="${esc(id)}">${esc(ITEMS[id].name)}</option>`).join('');
  const table = (heads, rows, empty) => (rows.length ? `<table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : `<p class="sub">${empty}</p>`);
  const td = (l, v) => `<td data-l="${l}">${v}</td>`;
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Říše – dary</title><style>
:root { color-scheme: light dark; --bg: #f6f4ef; --fg: #1d1d22; --mute: #6b6b75; --line: #dddad2; --card: #fff; --acc: #2f7d3b; --err: #a33; }
@media (prefers-color-scheme: dark) { :root { --bg: #17171b; --fg: #ececf0; --mute: #9a9aa5; --line: #2c2c33; --card: #1f1f25; --acc: #6cc47a; --err: #f08080; } }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 22px 0 8px; } .sub { color: var(--mute); margin: 0 0 14px; } a { color: var(--acc); }
table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: middle; }
th { font-size: 13px; color: var(--mute); font-weight: 600; } small { color: var(--mute); }
.ok { color: var(--acc); } .err { color: var(--err); }
form.give { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; background: var(--card); border: 1px solid var(--line); padding: 12px; }
label { display: flex; flex-direction: column; font-size: 13px; color: var(--mute); gap: 3px; }
input, select, button { font: inherit; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); }
button { cursor: pointer; }
@media (max-width: 640px) {
  thead { display: none; } table, tbody, tr, td { display: block; width: auto; } tr { padding: 8px 0; border-bottom: 1px solid var(--line); }
  td { border: 0; padding: 3px 12px; } td[data-l]::before { content: attr(data-l) ': '; color: var(--mute); font-size: 13px; }
  form.give label, form.give button { width: 100%; }
}
</style></head><body>
<h1>Říše – dary</h1><p class="sub"><a href="/admin">← Hráči</a> · ${list.length} darů, celkem ${sum} kusů od ${totals.length} hráčů</p>${note}
<h2>Dát hráči předmět</h2>
<form class="give" method="post" action="/admin/give">
  <label>Hráč<select name="to" required>${opts}</select></label>
  <label>Předmět (id)<input name="id" list="items" required placeholder="např. iron" autocomplete="off"></label>
  <label>Kusů<input name="n" type="number" min="1" max="${GIFT_MAX}" value="1" required></label>
  <button>Dát</button>
  <datalist id="items">${items}</datalist>
</form>
<p class="sub">Kdo právě hraje, dostane dárek hned do batohu; ostatní při dalším přihlášení.</p>
<h2>Kdo kolik daroval</h2>
${table(['Hráč', 'Kusů', 'Darů', 'Naposledy'], totals.map((s) => `<tr>${td('Hráč', `<b>${esc(s.name)}</b>`)}${td('Kusů', s.n)}${td('Darů', s.count)}${td('Naposledy', esc(date(s.last)))}</tr>`), 'Zatím nikdo nic nedaroval.')}
<h2>Všechny dary</h2>
${table(['Kdy', 'Kdo', 'Předmět', 'Kusů', 'Svět'], list.map((e) => `<tr>${td('Kdy', esc(date(e.t)))}${td('Kdo', esc(nameOf(e.by) || e.name))}${td('Předmět', `${esc(itemName(e.id))} <small>${esc(e.id)}</small>`)}${td('Kusů', e.n)}${td('Svět', esc(worldName(e.world)))}</tr>`), 'Žádné dary.')}
<h2>Dárky od správce</h2>
${table(['Kdy', 'Komu', 'Předmět', 'Kusů', 'Doručeno'], gifts.map((g) => `<tr>${td('Kdy', esc(date(g.t)))}${td('Komu', esc(nameOf(g.to) || g.name))}${td('Předmět', `${esc(itemName(g.id))} <small>${esc(g.id)}</small>`)}${td('Kusů', g.n)}${td('Doručeno', g.delivered ? esc(date(g.delivered)) : 'čeká na přihlášení')}</tr>`), 'Zatím žádné.')}
</body></html>`;
}
