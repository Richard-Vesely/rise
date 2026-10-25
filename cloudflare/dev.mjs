// Spustí Říši na Cloudflare na vlastním počítači (wrangler dev: router + Worker každého světa naráz).
//   npm run dev                      http://localhost:8788 (hru předtím sestav v kořeni: npm run build)
//   PORT=… WORLDS=… ROOM_PASSWORD=… npm run dev
// Data světů a profilů jsou v cloudflare/.gen/state (smaž složku = nové světy; jinou složku nastaví STATE_DIR).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { args } from './gen-config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || '8788';
const bin = path.join(here, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const extra = process.argv.slice(2);
const child = spawn(process.execPath, [bin, 'dev', ...args, '--port', port, '--ip', '127.0.0.1', '--persist-to', process.env.STATE_DIR || path.join('.gen', 'state'), '--show-interactive-dev-session=false', ...extra], { cwd: here, stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
