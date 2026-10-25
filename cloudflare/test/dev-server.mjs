// Spustí `wrangler dev` (cloudflare/dev.mjs) pro testy a počká, až odpovídá /health.
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** @param {{ port: number, state: string, env?: Record<string, string> }} o */
export function startDev({ port, state, env = {} }) {
  const child = spawn(process.execPath, ['dev.mjs'], {
    cwd: here,
    env: { ...process.env, PORT: String(port), STATE_DIR: state, WRANGLER_SEND_METRICS: 'false', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('wrangler dev did not start: ' + out)), 90_000);
    const poll = setInterval(async () => {
      if (!/Ready on/.test(out)) return;
      try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) { clearInterval(poll); clearTimeout(t); ok({ child, url: `http://127.0.0.1:${port}/`, out: () => out }); } } catch {}
    }, 300);
    child.on('exit', (code) => { clearInterval(poll); clearTimeout(t); fail(new Error(`wrangler dev exited (${code}): ${out}`)); });
  });
}

/** Zastaví wrangler dev i s workerd (na Windows celý strom procesů). */
export async function stopDev(s) {
  if (s.child.exitCode !== null) return;
  const done = new Promise((ok) => s.child.on('exit', ok));
  if (process.platform === 'win32') { try { execFileSync('taskkill', ['/F', '/T', '/PID', String(s.child.pid)], { stdio: 'ignore' }); } catch {} } else s.child.kill('SIGINT');
  await done;
  await sleep(500);
}
