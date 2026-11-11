// Správa hráčů z příkazové řádky (pro lektora):
//   node server/admin.js players              seznam hráčů (jméno, založen, naposledy, poslední svět, hraje teď, id profilu pro OWNER_ID)
//   node server/admin.js reset-pin <jméno>    smaže PIN hráče; při dalším přihlášení si nastaví nový
// Běží-li server, příkaz jde do něj (místní správcovská adresa jen na 127.0.0.1, klíč v DATA_DIR/admin.json).
// Neběží-li, upraví přímo DATA_DIR/players.json. DATA_DIR se bere z prostředí (výchozí server/data), jako u serveru.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProfiles, profilesFile } from './profiles.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.DATA_DIR || path.join(here, 'data'));
const [cmd, ...rest] = process.argv.slice(2);
const name = rest.join(' ').trim();
const date = (s) => (s ? new Date(s).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', dateStyle: 'short', timeStyle: 'short' }) : '–');

// Dotaz na běžící server; null = server neběží (není admin.json nebo nikdo neposlouchá).
function ask(pathname, body) {
  let info;
  try { info = JSON.parse(fs.readFileSync(path.join(dataDir, 'admin.json'), 'utf8')); } catch { return Promise.resolve(null); }
  return new Promise((ok, fail) => {
    const req = http.request({ host: '127.0.0.1', port: info.port, path: pathname, method: 'POST', headers: { 'x-admin-key': info.key, 'content-type': 'application/json' }, timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => { try { ok(JSON.parse(data)); } catch { fail(new Error(`Server odpověděl nesmyslem (HTTP ${res.statusCode}).`)); } });
    });
    req.on('error', (e) => (e.code === 'ECONNREFUSED' ? ok(null) : fail(e))); // starý admin.json po spadlém serveru
    req.on('timeout', () => req.destroy(new Error('Server neodpovídá.')));
    req.end(JSON.stringify(body || {}));
  });
}

function print(list) {
  if (!list.length) { console.log('Zatím žádní hráči.'); return; }
  const rows = list.map((p) => [p.name, date(p.created), date(p.lastSeen), p.lastWorld || '–', p.online || '', p.pin ? '' : 'bez PINu', p.id]);
  const head = ['Jméno', 'Založen', 'Naposledy', 'Poslední svět', 'Hraje teď', '', 'Id'];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  for (const r of [head, ...rows]) console.log(r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd());
  console.log(`\n${list.length} ${list.length === 1 ? 'hráč' : list.length < 5 ? 'hráči' : 'hráčů'}`);
}

async function main() {
  if (cmd === 'players') {
    const live = await ask('/players');
    if (live) { print(live.players); return 0; }
    const file = profilesFile(dataDir);
    if (!fs.existsSync(file)) { console.log(`Zatím žádní hráči (${file} neexistuje).`); return 0; }
    print(createProfiles(file).list().map((p) => ({ ...p, pin: !!p.pinHash })));
    return 0;
  }
  if (cmd === 'reset-pin' && name) {
    const live = await ask('/reset-pin', { name });
    const r = live ?? (() => { const p = createProfiles(profilesFile(dataDir)).resetPin(name); return p ? { ok: true, name: p.name } : { ok: false }; })();
    if (!r.ok) { console.error(`Hráč "${name}" neexistuje.`); return 1; }
    console.log(`PIN hráče ${r.name} je smazaný${live ? '' : ' (server neběží, upraven players.json)'}. Při dalším přihlášení si nastaví nový.`);
    return 0;
  }
  console.log('Použití:\n  node server/admin.js players\n  node server/admin.js reset-pin <jméno>');
  return cmd ? 1 : 0;
}
main().then((code) => process.exit(code), (e) => { console.error('Chyba: ' + e.message); process.exit(1); });
