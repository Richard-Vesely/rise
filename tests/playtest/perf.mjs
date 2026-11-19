// Měření plynulosti: hra pro jednoho v opravdovém prohlížeči, ~20 s letu vpřed (les se přestavuje, obloha se mění)
// a ~10 s stavění ve velkém světě. Vypíše časy snímků p50 / p95 / max a počet záseků (snímek nad 50 ms).
// Usage: node tests/playtest/perf.mjs [dir-or-url] [quality]   (default dist, medium)
//   PERF_GPU=1  kreslí grafickou kartou počítače (bez toho softwarové WebGL: čísla jsou jen orientační)
// Čísla z headless prohlížeče jsou jen orientační: porovnávej před / po na stejném stroji.
import path from 'node:path';
import { chromium } from 'playwright';
import { ARGS, serveDir } from './lib.mjs';

const target = process.argv[2] || 'dist';
const quality = process.argv[3] || 'medium';
const GPU_ARGS = ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'];
const args = [...(process.env.PERF_GPU ? GPU_ARGS : ARGS), '--disable-gpu-vsync', '--disable-frame-rate-limit'];

let server = null, url = target;
if (!/^https?:/.test(target)) { server = await serveDir(path.resolve(target)); url = server.url; }
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route(/posthog\.com/i, (r) => r.abort());
await ctx.addInitScript((q) => {
  if (!sessionStorage.getItem('perf')) { localStorage.clear(); sessionStorage.setItem('perf', '1'); }
  localStorage.setItem('rise-nastaveni', JSON.stringify({ quality: q }));
  localStorage.setItem('rise-jmeno', 'Mereni');
}, quality);
const page = await ctx.newPage();
// PERF_CPU=4: procesor zpomalený 4× (jako slabý školní notebook)
if (Number(process.env.PERF_CPU) > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PERF_CPU) });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('#mSolo');
await page.waitForFunction(() => window.gameStarted === true, null, { timeout: 180000, polling: 200 });
const info = await page.evaluate(() => {
  const g = window.game;
  g.testMode = true;
  const gl = g.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?' };
});
console.log(`GPU: ${info.gpu} · kvalita: ${quality} · CPU zpomalení: ${process.env.PERF_CPU || 1}×`);

/** Měří časy snímků (requestAnimationFrame) po dobu sec sekund; during() běží v prohlížeči každý snímek. */
async function measure(name, sec, setup, during) {
  const r = await page.evaluate(async ({ sec, setup, during }) => {
    const g = window.game;
    // eslint-disable-next-line no-new-func
    new Function('g', setup)(g);
    const each = new Function('g', 't', during);
    await new Promise((ok) => setTimeout(ok, 1500)); // rozjezd
    const dts = [];
    let last = performance.now(), t0 = last;
    await new Promise((ok) => {
      const f = (now) => {
        dts.push(now - last); last = now;
        each(g, (now - t0) / 1000);
        if (now - t0 < sec * 1000) requestAnimationFrame(f); else ok();
      };
      requestAnimationFrame(f);
    });
    return dts;
  }, { sec, setup, during });
  const s = [...r].sort((a, b) => a - b), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const out = { frames: r.length, fps: +(r.length / sec).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: +s[s.length - 1].toFixed(1), hitches50: r.filter((d) => d > 50).length };
  console.log(name.padEnd(10), JSON.stringify(out));
  return out;
}

const results = {};
results.fly = await measure('let', 20,
  `g.setCreative(true); g.player.flying = true; g.teleport(0, 40); g.player.pos.y = g.groundHeight(0, 40) + 12; g.player.yaw = 0.3; g.player.pitch = -0.15; g.keys.add('KeyW'); g.keys.add('ControlLeft');`,
  `g.player.pitch = -0.15; if (g.player.pos.y < g.groundHeight(g.player.pos.x, g.player.pos.z) + 8) g.player.pos.y += 1;`);
await page.evaluate(() => { const g = window.game; g.keys.clear(); g.player.vel.set(0, 0, 0); });
// velký svět: 12 000 postavených bloků kolem hráče, pak každých 0,25 s jeden nový blok a přestavba (jako stavění)
results.build = await measure('stavba', 10,
  `const p = g.player.pos, x0 = Math.floor(p.x) + 20, z0 = Math.floor(p.z); let n = 0;
   for (let i = 0; i < 12000; i++) { const x = x0 + (i % 40), y = 60 + Math.floor(i / 1600), z = z0 + Math.floor(i / 40) % 40; g.blocks.set(x + ',' + y + ',' + z, i % 3 ? 'planks' : 'cobble'); }
   g.rebuildBlocks(); g.__k = 0; g.__t = 0; g.__rb = [];`,
  `if (t - g.__t > 0.25) { g.__t = t; const p = g.player.pos; g.blocks.set((Math.floor(p.x) - 5 - (g.__k % 10)) + ',' + 70 + ',' + (Math.floor(p.z) + Math.floor(g.__k++ / 10)), 'planks'); const t0 = performance.now(); g.rebuildBlocks(); g.__rb.push(performance.now() - t0); }`);
results.build.rebuildMs = await page.evaluate(() => { const a = window.game.__rb; return +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2); });
console.log('přestavba bloků (průměr ms):', results.build.rebuildMs);
console.log(JSON.stringify(results));
await browser.close();
await server?.close();
