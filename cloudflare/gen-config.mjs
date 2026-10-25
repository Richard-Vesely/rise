// Vytvoří nastavení pro wrangler do cloudflare/.gen/: jeden router (rise) a jeden Worker na každý svět (rise-world-<id>).
// Proč Worker na svět: pravidla ve shared/ drží svět v proměnných modulů a Durable Objecty ve stejném Workeru
// můžou sdílet paměť. Každý svět tak má vlastní kód i paměť, stejně jako vlákno na Node serveru (server/world-worker.js).
//
//   node gen-config.mjs                 zapíše .gen/router.jsonc, .gen/world-<id>.jsonc (a .gen/.dev.vars s heslem pro wrangler dev)
//   node gen-config.mjs --args          vypíše jen argumenty pro `wrangler dev` (-c … -c …)
// Nastavení (proměnné prostředí, stejné jako u Node serveru, viz server/index.js):
//   WORLDS, MAX_PLAYERS, SAVE_SECONDS, SILENT_SECONDS; ROOM_PASSWORD a ADMIN_PASSWORD jen pro wrangler dev
//   (na Cloudflare se nastaví jako tajné hodnoty: wrangler secret put ROOM_PASSWORD -c .gen/world-<id>.jsonc).
//   NAME            jméno routeru (výchozí rise; testy používají jiné, aby se nepletly)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorlds } from '../server/worlds.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '.gen');
const env = process.env;
const name = env.NAME || 'rise';
const worlds = parseWorlds(env.WORLDS || 'svet:Hlavní svět,kreativ:Kreativní svět:creative');
const DATE = '2026-10-01';
const binding = (id) => 'WORLD_' + id.replace(/-/g, '_');
if (new Set(worlds.map((w) => binding(w.id))).size !== worlds.length) throw new Error('WORLDS: id světů se liší jen - a _');

const common = { compatibility_date: DATE, compatibility_flags: ['nodejs_compat'], observability: { enabled: true } };
const vars = {
  WORLDS: JSON.stringify(worlds),
  MAX_PLAYERS: String(env.MAX_PLAYERS || 8),
};
const files = {
  'router.jsonc': {
    name,
    main: '../router.js',
    ...common,
    assets: { directory: '../../dist', binding: 'ASSETS', run_worker_first: true },
    vars,
    durable_objects: {
      bindings: [
        { name: 'PROFILES', class_name: 'Profiles' },
        ...worlds.map((w) => ({ name: binding(w.id), class_name: 'World', script_name: `${name}-world-${w.id}` })),
      ],
    },
    migrations: [{ tag: 'v1', new_sqlite_classes: ['Profiles'] }],
  },
};
worlds.forEach((w, i) => {
  files[`world-${w.id}.jsonc`] = {
    name: `${name}-world-${w.id}`,
    main: '../world.js',
    ...common,
    vars: { ...vars, WORLD_DEF: JSON.stringify({ ...w, first: i === 0 }), SAVE_SECONDS: String(env.SAVE_SECONDS || 30), SILENT_SECONDS: String(env.SILENT_SECONDS || 30) },
    durable_objects: { bindings: [{ name: 'SELF', class_name: 'World' }, { name: 'PROFILES', class_name: 'Profiles', script_name: name }] },
    migrations: [{ tag: 'v1', new_sqlite_classes: ['World'] }],
  };
});

const args = Object.keys(files).flatMap((f) => ['-c', path.join('.gen', f)]);
if (process.argv.includes('--args')) {
  console.log(args.join(' '));
} else {
  fs.mkdirSync(out, { recursive: true });
  for (const [f, cfg] of Object.entries(files)) fs.writeFileSync(path.join(out, f), '// vytvořeno: node gen-config.mjs (neupravovat ručně)\n' + JSON.stringify(cfg, null, 2) + '\n');
  // jen pro wrangler dev na vlastním počítači; .gen/ je v .gitignore
  const secrets = { ROOM_PASSWORD: env.ROOM_PASSWORD || '', ADMIN_PASSWORD: env.ADMIN_PASSWORD || '' };
  fs.writeFileSync(path.join(out, '.dev.vars'), Object.entries(secrets).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n');
}
export { args, worlds };
