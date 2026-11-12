// Local dragon adventure: real portals, terrain shaders, combat, save/reload.
// node tests/playtest/dragon.mjs [dist-or-url]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, serveDir, openPage, waitGame, shot } from './lib.mjs';
import { TERRAIN_GLSL } from '../../client/src/render/glsl.js';
import { terrainH, volcanoDist } from '../../shared/world/terrain.js';

const target = process.argv[2] || 'dist';
const server = /^https?:/.test(target) ? null : await serveDir(target);
const browser = await launch();
try {
  const page = await openPage(browser, server?.url || target);
  await page.click('#mSolo'); await waitGame(page);
  await page.evaluate(() => { document.getElementById('intro').style.display = 'none'; game.setTime(0.4); });
  fs.mkdirSync('test-results', { recursive: true });
  const pts = [[0, 0], [14, 14], [100, -50], [40000, 0], [40100, 40], [-40000, 0], [-40000, -72], [-39990, -90], [-39850, 30], [-40250, 60]];
  // Execute the actual GLSL terrain in WebGL2, then compare with physics on the CPU.
  const heights = await page.evaluate(({ pts, source }) => {
    const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl2');
    const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, '#version 300 es\nprecision highp float; precision highp int;\nin vec2 point; out vec2 sampleData;\n' + source + '\nvoid main(){ sampleData=vec2(terrainH(point),volcanoDist(point)); gl_Position=vec4(0,0,0,1); }'));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float; out vec4 color; void main(){color=vec4(1);}'));
    gl.transformFeedbackVaryings(prog, ['sampleData'], gl.INTERLEAVED_ATTRIBS); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const input = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, input); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts.flat()), gl.STATIC_DRAW);
    const attr = gl.getAttribLocation(prog, 'point'); gl.enableVertexAttribArray(attr); gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
    const output = gl.createBuffer(); gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, output); gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, pts.length * 8, gl.DYNAMIC_READ);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, output); gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS); window.__skipDraw = false;
    gl.drawArrays(gl.POINTS, 0, pts.length); window.__skipDraw = true; gl.endTransformFeedback();
    const result = new Float32Array(pts.length * 2); gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, result);
    for (const h of result) if (!Number.isFinite(h)) throw new Error('Invalid terrain');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return [...result];
  }, { pts, source: TERRAIN_GLSL });
  pts.forEach(([x, z], i) => {
    assert.ok(Math.abs(heights[i * 2] - terrainH(x, z)) < 0.025, `GPU terrain matches physics at ${x}, ${z}`);
    assert.ok(Math.abs(heights[i * 2 + 1] - volcanoDist(x, z)) < 0.025, `GPU lava matches physics at ${x}, ${z}`);
  });
  console.log('PASS terrain: GPU and CPU agree in all three dimensions');

  const entrance = await page.evaluate(() => {
    game.setCreative(true); T.tp(16, 4, 0); T.aim(16, 3.05, 0);
    return game.pickTarget()?.name;
  });
  assert.equal(entrance, 'Portál do Země draka');
  await page.evaluate(() => { T.tp(16, 11, 0); T.aim(16, 3.5, 0); });
  await shot(page, 'test-results/dragon-portal.png');
  const arrival = await page.evaluate(() => {
    T.tp(16, 1.5, 0); game.keys.add('KeyW'); T.step(16); game.keys.delete('KeyW'); T.step(80);
    return { x: game.player.pos.x, z: game.player.pos.z, y: game.player.pos.y, clock: T.text('clock'), count: game.mobs.filter(m => m.type === 'dragon').length };
  });
  assert.equal(arrival.x, -40000); assert.ok(arrival.z < -2); assert.ok(arrival.y >= 0);
  assert.match(arrival.clock, /Země draka/); assert.equal(arrival.count, 1);
  console.log('PASS walking through the new portal, safe arrival, one dragon');
  const facing = await page.evaluate(() => {
    const m = game.mobs.find(m => m.type === 'dragon');
    let minDot = 1;
    for (const [dx, dz] of [[0, 5], [5, 0], [0, -5], [-5, 0]]) {
      T.tp(m.pos.x + dx, m.pos.z + dz, 0); T.step(1);
      const V = game.mobView(m), x = game.player.pos.x - m.pos.x, z = game.player.pos.z - m.pos.z;
      minDot = Math.min(minDot, (-Math.sin(V.group.rotation.y) * x - Math.cos(V.group.rotation.y) * z) / Math.hypot(x, z));
    }
    return minDot;
  });
  assert.ok(facing > 0.999, 'visible dragon faces player immediately after circling behind it');
  console.log('PASS dragon always faces the player, including in creative mode');
  await page.evaluate(() => { T.tp(-40000, -44, 0); T.aim(-40000, 3, -72); T.step(10); });
  await shot(page, 'test-results/dragon-cave.png');
  const fight = await page.evaluate(() => {
    const m = game.mobs.find(m => m.type === 'dragon');
    T.tp(m.pos.x, m.pos.z + 12, 0); T.aim(m.pos.x, 2, m.pos.z); game.setCreative(false); game.player.hp = 200;
    const z0 = m.pos.z; T.step(75); T.tp(m.pos.x, m.pos.z + 3, 0); T.step(24);
    const hp = game.player.hp; game.setCreative(true);
    return { hp, moved: m.pos.z > z0, kind: game.mobView(m).kind, bar: T.text('dragonHealth') };
  });
  assert.ok(fight.moved); assert.ok(fight.hp < 200, JSON.stringify(fight)); assert.equal(fight.kind, 'dragon'); assert.match(fight.bar, /Drak Země draka/);
  console.log('PASS dragon model, pursuit, bite and health bar');
  await page.evaluate(() => { T.tp(-39993, -65, 0); T.step(80); const m = game.mobs.find(m => m.type === 'dragon'); T.aim(m.pos.x, 2.5, m.pos.z); });
  await shot(page, 'test-results/dragon-close.png');
  const sword = await page.evaluate(() => {
    const m = game.mobs.find(m => m.type === 'dragon');
    T.give('iron_sword', 1); T.hold('iron_sword'); game.setCreative(false); game.player.hp = 100;
    T.tp(m.pos.x, m.pos.z + 4.2, 0); T.aim(m.pos.x, 2, m.pos.z);
    const hp = m.hp; game.input.lmb = true; T.step(30); game.input.lmb = false;
    game.setCreative(true); return { hp, after: m.hp };
  });
  assert.ok(sword.after < sword.hp, 'normal sword input damages the dragon');
  console.log('PASS dragon can be fought with an ordinary sword');
  for (let attempt = 0; attempt < 2; attempt++) {
    const kill = await page.evaluate((attempt) => {
      const m = game.mobs.find(m => m.type === 'dragon');
      game.setCreative(false); T.tp(-40000, attempt === 0 ? -3 : -72, 0.45); game.player.hp = 1;
      m.pos.set(game.player.pos.x, game.player.pos.y + 5, game.player.pos.z);
      m.vel.set(0, 0, 0); m.hp = 120; m.cd = 0; m.windup = 0;
      T.step(20);
      return { alive: game.player.alive, dragonHP: m.hp };
    }, attempt);
    assert.deepEqual(kill, { alive: false, dragonHP: 500 }, 'bite from above kills and fully heals dragon every time');
    await page.waitForFunction(() => game.player.alive, null, { timeout: 10000 });
  }
  await page.evaluate(() => {
    game.setCreative(true);
    const m = game.mobs.find(m => m.type === 'dragon'); T.tp(m.pos.x + 3, m.pos.z, 0);
  });
  console.log('PASS attacks directly underneath and full healing after two player kills');
  const death = await page.evaluate(() => {
    T.clearInv();
    const m = game.mobs.find(m => m.type === 'dragon'); m.invT = 0; game.hitMob(m, m.hp); T.step(20);
    game.saveGame();
    const ids = ['sky_helmet', 'sky_chestplate', 'sky_leggings', 'sky_boots', 'markorite_sword', 'markorite_pick', 'markorite', 'gold_ingot', 'shard', 'markapple'];
    return { flag: game.worldState().ruinsOpened.includes('dragon-den-v1'), loot: Object.fromEntries(ids.map(id => [id, T.count(id)])) };
  });
  assert.equal(death.flag, true);
  assert.deepEqual(death.loot, { sky_helmet: 1, sky_chestplate: 1, sky_leggings: 1, sky_boots: 1,
    markorite_sword: 1, markorite_pick: 1, markorite: 16, gold_ingot: 16, shard: 12, markapple: 5 });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.click('#mSolo'); await waitGame(page);
  const restored = await page.evaluate(() => { T.step(90); return { dragon: game.mobs.some(m => m.type === 'dragon'), cleared: game.worldState().ruinsOpened.includes('dragon-den-v1'), cave: game.blocks.has('-40000,12,-72') }; });
  assert.deepEqual(restored, { dragon: false, cleared: true, cave: true });
  console.log('PASS dragon loot and permanent defeat after reload');
  const home = await page.evaluate(() => {
    game.setCreative(true); T.tp(-40000, -1.5, 0.45); game.player.yaw = Math.PI;
    game.keys.add('KeyW'); T.step(18); game.keys.delete('KeyW'); T.step(80);
    return { x: game.player.pos.x, z: game.player.pos.z };
  });
  assert.equal(home.x, 16); assert.ok(home.z > 2);
  const oldPortal = await page.evaluate(() => {
    T.give('shard', 3); game.usePortal(game.SHRINES[0]); T.step(100);
    game.player.pos.set(0, 0.45, 0); game.player.vel.set(0, 0, 0); T.step(2);
    return { x: game.player.pos.x, open: game.portalActive };
  });
  assert.equal(oldPortal.x, 40000); assert.equal(oldPortal.open, true);
  console.log('PASS return home and original Mark portal');
  assert.deepEqual(page.errors, []);
  console.log('PASS no browser or WebGL errors');
} finally { await browser.close(); await server?.close(); }
