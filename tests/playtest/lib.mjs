// Shared helpers for the browser play-tests (Playwright + Chromium with software WebGL).
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];

/** Slow machine (CPU shared with other work): PLAYTEST_SLOW=3 makes the long waits three times longer. */
export const SLOW = Math.max(1, Number(process.env.PLAYTEST_SLOW) || 1);

/** Starts Chromium (CHROME_PATH overrides Playwright's own browser). */
export const launch = () => chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ARGS });

/** Serves a folder on a random local port. */
export function serveDir(dir) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const root = path.resolve(dir);
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    // Chrome žádá ikonu i bez odkazu v HTML; hra vlastní favicon nemá.
    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
    fs.readFile(f, (err, buf) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${srv.address().port}/`, close: () => new Promise((r) => srv.close(r)) })));
}

/** PASS/FAIL list printed as it goes. */
export function checker(prefix = '') {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name: prefix + name, ok: !!ok, detail: String(detail) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${prefix}${name}${detail !== '' ? '  — ' + detail : ''}`);
    return !!ok;
  };
  return { check, results, failed: () => results.filter((r) => !r.ok) };
}

// Software WebGL is slow: while __skipDraw is true, draw calls are skipped (the game logic still runs).
export function skipDrawScript() {
  window.__skipDraw = true;
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) {
      const orig = C.prototype[fn];
      if (orig) C.prototype[fn] = function (...a) { if (window.__skipDraw) return; return orig.apply(this, a); };
    }
  }
}

// Pointer Lock is only pretended: a real lock in headless Chromium on Windows traps the real desktop cursor
// (ClipCursor to the viewport size) while the tests run. The game sees the same pointerLockElement + pointerlockchange.
function fakePointerLockScript() {
  let locked = null;
  const changed = () => setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')));
  Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get: () => locked });
  Element.prototype.requestPointerLock = function () { locked = this; changed(); return Promise.resolve(); };
  Document.prototype.exitPointerLock = function () { if (!locked) return; locked = null; changed(); };
}

/** Opens a new browser context + page, collects console errors. */
export async function openPage(browser, url, { label = '', viewport = { width: 1100, height: 680 }, clear = true, ignore = [] } = {}) {
  const ctx = await browser.newContext({ viewport });
  if (SLOW > 1) ctx.setDefaultTimeout(30000 * SLOW);
  await ctx.addInitScript(skipDrawScript);
  await ctx.addInitScript(fakePointerLockScript);
  // PLAYTEST_QUALITY=low (CI): méně trávy a stromů, ať je software WebGL na pomalém stroji rychlejší
  if (process.env.PLAYTEST_QUALITY) await ctx.addInitScript((q) => { try { const p = JSON.parse(localStorage.getItem('rise-nastaveni') || '{}'); if (!p.quality) localStorage.setItem('rise-nastaveni', JSON.stringify({ ...p, quality: q })); } catch {} }, process.env.PLAYTEST_QUALITY);
  const page = await ctx.newPage();
  page.errors = [];
  // Analytika musí být v testech vypnutá: každý pokus o spojení s posthog.com (i *.posthog.com) se zablokuje a test spadne
  await ctx.route(/^[a-z]+:\/\/([^/?#]*\.)?posthog\.com([/:?#]|$)/i, (r) => { page.errors.push(`${label}PostHog request blocked: ${r.request().url()}`); return r.abort(); });
  const skip = (t) => ignore.some((re) => re.test(t));
  page.on('console', (m) => { if (m.type() === 'error' && !skip(m.text())) page.errors.push(`${label}${m.text()}`); });
  page.on('pageerror', (e) => { if (!skip(String(e))) page.errors.push(`${label}${e}`); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (clear) {
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  return page;
}

/** Waits for the game module and installs the helper object `T` in the page. */
export async function waitGame(page, timeout = 120000) {
  timeout *= SLOW;
  await page.waitForFunction(() => window.gameStarted === true, null, { timeout, polling: 100 });
  await page.evaluate(() => {
    const g = window.game;
    g.testMode = true;
    window.T = {
      step(n = 1, dt = 0.05) { for (let i = 0; i < n; i++) g.tick(dt); },
      aim(x, y, z) {
        const p = g.player.pos, dx = x - p.x, dy = y - (p.y + 1.62), dz = z - p.z;
        g.player.yaw = Math.atan2(-dx, -dz);
        g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        this.step(2, 0.0001);
      },
      tp(x, z, y) { g.player.pos.set(x, y ?? 0.45, z); g.player.vel.set(0, 0, 0); this.step(2, 0.0001); g.player.pos.set(x, y ?? g.player.pos.y, z); g.player.vel.set(0, 0, 0); },
      give(id, n) { g.addItem(id, n, true); },
      hold(id) { const i = g.inv.slots.findIndex((s) => s && s.id === id); if (i < 0) return false; const t = g.inv.slots[0]; g.inv.slots[0] = g.inv.slots[i]; g.inv.slots[i] = t; g.inv.sel = 0; return true; },
      holdNothing() { const i = g.inv.slots.findIndex((s, k) => !s && k < 9); g.inv.sel = i < 0 ? 8 : i; },
      count: (id) => g.countItem(id),
      clearInv() { g.inv.slots.fill(null); g.inv.cursor = null; },
      mineUntil(fn, max = 600) { g.input.lmb = true; let n = 0; while (!fn() && n < max) { this.step(1); n++; } g.input.lmb = false; this.step(1, 0.0001); return n; },
      // Vytěžené bloky vyskočí jako předměty: dojdi (teleportem) ke každému do 8 m, počkej na sebrání a vrať se.
      collect(max = 160) {
        const p0 = g.player.pos.clone(), near = () => g.groundItems.find((x) => x.n > 0 && !x.burnt && Math.hypot(x.pos.x - p0.x, x.pos.z - p0.z) < 8);
        let n = 0;
        for (let it = near(); it && n < max; it = near(), n++) { if (it.age > it.delay) this.tp(it.pos.x, it.pos.z, it.pos.y + 0.05); this.step(1); }
        this.tp(p0.x, p0.z, p0.y);
        return n;
      },
      text: (id) => document.getElementById(id)?.textContent ?? '',
      key(code, down = true) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })); },
      press(code) { this.key(code, true); this.key(code, false); },
    };
  });
}

/** Screenshot with drawing switched on for a moment. Returns false (and warns) when the machine is too slow. */
export async function shot(page, file) {
  try {
    await page.evaluate(() => { window.__skipDraw = false; window.game.tick(0.0001); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: file, timeout: 90000 });
    return true;
  } catch (e) {
    console.log('WARN  screenshot not taken: ' + String(e.message).split('\n')[0]);
    return false;
  } finally {
    await page.evaluate(() => { window.__skipDraw = true; }).catch(() => {});
  }
}

export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
