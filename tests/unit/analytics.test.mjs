// Analytika (PostHog): vypnutá ve výchozím stavu, žádná identita, jen povolené události a hodnoty.
// Testy NIKDY neposílají nic na PostHog: transport je vždy podvržený (mock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = new URL('../../client/src/ui/analytics.js', import.meta.url);
const A = await import(SRC.href);
const { createAnalytics, track, countBucket, EVENTS, POSTHOG_PROJECT_KEY, POSTHOG_HOST, ANALYTICS_OPT_IN, DISTINCT_ID, APP } = A;

// Prostředí, ve kterém by analytika smět běžet (jen v testu, přes injektovaný runtime)
const PROD = { prodBuild: true, origin: 'https://richard-vesely.github.io', pathname: '/rise/', webdriver: false };
function mock() {
  const calls = [];
  return { calls, transport: (url, init) => { calls.push({ url, init }); return Promise.resolve({ ok: true }); } };
}
const on = (extra = {}) => { const m = mock(); return { m, a: createAnalytics({ key: 'phc_test_only', optIn: true, runtime: PROD, transport: m.transport, ...extra }) }; };

test('shipped defaults: empty key, opt-in false, EU host, app rise', () => {
  assert.equal(POSTHOG_PROJECT_KEY, '');
  assert.equal(ANALYTICS_OPT_IN, false);
  assert.equal(POSTHOG_HOST, 'https://eu.i.posthog.com');
  assert.equal(APP, 'rise');
  assert.equal(typeof DISTINCT_ID, 'string');
  assert.ok(!/louka/i.test(DISTINCT_ID));
  const src = readFileSync(SRC, 'utf8');
  assert.match(src, /export const POSTHOG_PROJECT_KEY = '';/);
  assert.match(src, /export const ANALYTICS_OPT_IN = false;/);
});

test('source uses no storage, cookies, identity, timers or env-driven activation', () => {
  const code = readFileSync(SRC, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const bad of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'crypto', 'Math.random', 'setTimeout', 'setInterval',
    'userAgent', 'screen', 'document.referrer', 'location.href', 'location.search', 'location.hash', 'identify', '$set', 'process.env', 'VITE_', 'addEventListener', 'sendBeacon']) {
    assert.ok(!code.includes(bad), `analytics.js nesmí obsahovat ${bad}`);
  }
});

test('default track() sends nothing and touches no globals (key empty, opt-in false)', async () => {
  const touched = [];
  const names = ['fetch', 'location', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'document', 'XMLHttpRequest'];
  const saved = names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)]);
  for (const n of names) Object.defineProperty(globalThis, n, { configurable: true, get() { touched.push(n); throw new Error('touched ' + n); } });
  try {
    assert.equal(track('inventory_opened', { mode: 'inv' }), false);
    assert.equal(track('nope'), false);
    // re-import is cached; a fresh query string forces a re-evaluation: import must have no side effects
    await import(SRC.href + '?fresh=1');
  } finally {
    for (const [n, d] of saved) { if (d) Object.defineProperty(globalThis, n, d); else delete globalThis[n]; }
  }
  assert.deepEqual(touched, []);
});

test('each gate alone keeps it off', () => {
  const cases = [
    { key: '' }, { key: '   ' }, { key: 42 }, { optIn: false }, { optIn: 'true' }, { optIn: 1 },
    { runtime: { ...PROD, prodBuild: false } }, { runtime: { ...PROD, prodBuild: 'true' } },
    { runtime: { ...PROD, webdriver: true } }, { runtime: { ...PROD, webdriver: undefined } },
    { runtime: null }, { runtime: {} }, { transport: null }, { transport: 'fetch' },
  ];
  for (const c of cases) {
    const { m, a } = on(c);
    assert.equal(a.track('inventory_opened', { mode: 'inv' }), false, JSON.stringify(c));
    assert.equal(m.calls.length, 0, JSON.stringify(c));
  }
});

test('only https://richard-vesely.github.io/rise is allowed', () => {
  const ok = [['https://richard-vesely.github.io', '/rise'], ['https://richard-vesely.github.io', '/rise/'], ['https://richard-vesely.github.io', '/rise/index.html']];
  const bad = [
    ['https://richard-vesely.github.io', '/risex'], ['https://richard-vesely.github.io', '/risex/'], ['https://richard-vesely.github.io', '/other/'],
    ['https://richard-vesely.github.io', '/'], ['https://richard-vesely.github.io', '/Rise/'], ['https://richard-vesely.github.io', '/louka/'],
    ['https://richard-vesely.github.io', '//rise/'], ['https://richard-vesely.github.io', '/x/rise/'], ['https://richard-vesely.github.io', ''],
    ['http://richard-vesely.github.io', '/rise/'], ['https://richard-vesely.github.io:8443', '/rise/'],
    ['https://richard-vesely.github.io.evil.com', '/rise/'], ['https://evil-richard-vesely.github.io', '/rise/'], ['https://x.richard-vesely.github.io', '/rise/'],
    ['https://other.github.io', '/rise/'], ['https://richard-vesely.github.io@evil.com', '/rise/'],
    ['http://localhost:5173', '/'], ['http://localhost:4173', '/rise/'], ['https://localhost', '/rise/'], ['http://127.0.0.1:8787', '/rise/'],
    ['http://[::1]:5173', '/'], ['http://192.168.1.20:8787', '/rise/'], ['http://10.0.0.5', '/rise/'], ['http://172.16.0.1', '/rise/'],
    ['https://foo-5173.app.github.dev', '/rise/'], ['https://deploy-preview-1--rise.netlify.app', '/rise/'], ['https://rise.club.example', '/rise/'],
    ['https://hra.ardoremy.cz', '/'], ['file://', '/rise/index.html'], ['null', '/rise/'], [undefined, '/rise/'], ['https://richard-vesely.github.io', undefined],
  ];
  for (const [origin, pathname] of ok) {
    const { m, a } = on({ runtime: { ...PROD, origin, pathname } });
    assert.equal(a.track('inventory_opened', { mode: 'inv' }), true, origin + pathname);
    assert.equal(m.calls.length, 1);
  }
  for (const [origin, pathname] of bad) {
    const { m, a } = on({ runtime: { ...PROD, origin, pathname } });
    assert.equal(a.track('inventory_opened', { mode: 'inv' }), false, `${origin}${pathname}`);
    assert.equal(m.calls.length, 0);
  }
});

test('positive mock: exact payload, constant id, privacy flags, fetch options', async () => {
  const { m, a } = on();
  assert.equal(a.track('item_crafted', { kind: 'craft', amount: countBucket(5) }), true);
  assert.equal(m.calls.length, 1);
  const { url, init } = m.calls[0];
  assert.equal(url, 'https://eu.i.posthog.com/i/v0/e/');
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.equal(init.cache, 'no-store');
  assert.deepEqual(Object.keys(init.headers), ['Content-Type']);
  const body = JSON.parse(init.body);
  assert.deepEqual(Object.keys(body).sort(), ['api_key', 'distinct_id', 'event', 'properties']);
  assert.equal(body.api_key, 'phc_test_only');
  assert.equal(body.event, 'item_crafted');
  assert.equal(body.distinct_id, DISTINCT_ID);
  assert.deepEqual(body.properties, { app: 'rise', kind: 'craft', amount: '2-9', $ip: null, $process_person_profile: false, $geoip_disable: true });
  // the same constant id for every event and every instance
  a.track('inventory_opened', { mode: 'chest' });
  const { a: a2, m: m2 } = on();
  a2.track('inventory_opened', { mode: 'chest' });
  assert.equal(JSON.parse(m.calls[1].init.body).distinct_id, DISTINCT_ID);
  assert.equal(JSON.parse(m2.calls[0].init.body).distinct_id, DISTINCT_ID);
});

test('rejects unknown/dynamic event names', () => {
  const { m, a } = on();
  for (const ev of ['', 'Inventory_opened', 'inventory_opened ', '$pageview', '$autocapture', '$identify', '$set', '__proto__', 'constructor', 'toString', 'hasOwnProperty',
    'inventory_.*', 'event_' + Date.now(), null, undefined, 42, {}, ['inventory_opened'], Symbol('x')]) {
    assert.equal(a.track(ev, {}), false, String(typeof ev === 'symbol' ? 'symbol' : ev));
  }
  assert.equal(m.calls.length, 0);
});

test('rejects arbitrary keys, free text, numbers, objects and secrets', () => {
  const { m, a } = on();
  const bad = [
    undefined, null, 'inv', 42, ['inv'],
    {}, // missing required key
    { mode: 'inv', extra: 'inv' }, { mode: 'inv', $ip: '1.2.3.4' }, { mode: 'inv', distinct_id: 'x' }, { mode: 'inv', $set: { name: 'Pepa' } },
    { mode: 'Inv' }, { mode: 'inv ' }, { mode: 'inv|chest' }, { mode: '.*' }, { mode: '^inv$' }, { mode: 'Pepa' }, { mode: '1234' }, { mode: 'LOUKA-ABCD' },
    { mode: 'phc_secret' }, { mode: 'ws://192.168.1.2:8787' }, { mode: 5 }, { mode: NaN }, { mode: Infinity }, { mode: true }, { mode: null },
    { mode: { toString: () => 'inv' } }, { mode: ['inv'] }, { mode: new String('inv') },
    Object.create({ mode: 'inv' }), // inherited key
    new (class P { constructor() { this.mode = 'inv'; } })(),
    JSON.parse('{"__proto__": {"mode": "inv"}}'),
  ];
  for (const p of bad) assert.equal(a.track('inventory_opened', p), false, String(JSON.stringify(p)));
  const getterHit = []; const g = {}; Object.defineProperty(g, 'mode', { enumerable: true, get() { getterHit.push(1); return 'inv'; } });
  assert.equal(a.track('inventory_opened', g), false);
  assert.equal(a.track('item_crafted', { kind: 'craft', amount: 5 }), false);
  assert.equal(a.track('item_crafted', { kind: 'craft', amount: '5' }), false);
  assert.equal(a.track('item_crafted', { kind: 'craft', amount: '2-9', item: 'iron' }), false);
  assert.equal(m.calls.length, 0);
});

test('countBucket maps only finite non-negative integers to fixed buckets', () => {
  assert.equal(countBucket(1), '1');
  assert.equal(countBucket(2), '2-9');
  assert.equal(countBucket(9), '2-9');
  assert.equal(countBucket(10), '10-63');
  assert.equal(countBucket(63), '10-63');
  assert.equal(countBucket(64), '64+');
  assert.equal(countBucket(1e9), '64+');
  for (const x of [0, -1, 1.5, NaN, Infinity, -Infinity, '5', null, undefined, {}]) assert.equal(countBucket(x), null, String(x));
});

test('schema is frozen and contains only enum string lists', () => {
  assert.ok(Object.isFrozen(EVENTS));
  for (const [ev, props] of Object.entries(EVENTS)) {
    assert.match(ev, /^[a-z]+(_[a-z]+)*$/);
    assert.ok(Object.isFrozen(props));
    for (const [k, vals] of Object.entries(props)) {
      assert.ok(Object.isFrozen(vals) && Array.isArray(vals) && vals.length > 0, ev + '.' + k);
      for (const v of vals) assert.equal(typeof v, 'string');
    }
  }
  assert.throws(() => { 'use strict'; EVENTS.evil = {}; });
});

test('transport errors, throwing transport and rejected promise never throw into the UI', async () => {
  const rejections = [];
  const onRej = (e) => rejections.push(e);
  process.on('unhandledRejection', onRej);
  try {
    const t1 = createAnalytics({ key: 'k', optIn: true, runtime: PROD, transport: () => { throw new Error('boom'); } });
    assert.doesNotThrow(() => t1.track('inventory_opened', { mode: 'inv' }));
    const t2 = createAnalytics({ key: 'k', optIn: true, runtime: PROD, transport: () => Promise.reject(new Error('network')) });
    assert.doesNotThrow(() => t2.track('inventory_opened', { mode: 'inv' }));
    const t3 = createAnalytics({ key: 'k', optIn: true, runtime: PROD, transport: () => undefined });
    assert.doesNotThrow(() => t3.track('inventory_opened', { mode: 'inv' }));
    const evil = new Proxy({}, { get() { throw new Error('trap'); }, ownKeys() { throw new Error('trap'); } });
    assert.equal(t1.track('inventory_opened', evil), false);
    assert.doesNotThrow(() => createAnalytics(undefined).track('inventory_opened', { mode: 'inv' }));
    await new Promise((r) => setImmediate(r));
  } finally { process.off('unhandledRejection', onRej); }
  assert.deepEqual(rejections, []);
});

test('per-page cap: bounded number of events, no queue', () => {
  const { m, a } = on();
  for (let i = 0; i < 1000; i++) a.track('inventory_opened', { mode: 'inv' });
  assert.ok(m.calls.length > 0 && m.calls.length <= 200, String(m.calls.length));
});

test('call sites: only static events with enum props, at existing UI actions', () => {
  const ui = readFileSync(new URL('../../client/src/ui/inventory-ui.js', import.meta.url), 'utf8');
  const calls = [...ui.matchAll(/track\('([a-z_]+)'/g)].map((x) => x[1]);
  assert.deepEqual([...new Set(calls)].sort(), Object.keys(EVENTS).sort());
  assert.match(ui, /import \{ countBucket, track \} from '\.\/analytics\.js';/);
  // no call site passes item ids, names or raw counts
  for (const line of ui.split('\n').filter((l) => l.includes('track('))) {
    assert.ok(!/r\.out|ITEMS|name|made \*|\bn\b:/.test(line), line);
  }
  // the module chain and other files do not import analytics
  for (const f of ['client/src/main.js', 'client/src/game/loop.js', 'client/src/game/debug.js']) {
    assert.ok(!readFileSync(new URL('../../' + f, import.meta.url), 'utf8').includes('analytics'), f);
  }
});

test('browser tests block *.posthog.com', () => {
  const lib = readFileSync(new URL('../playtest/lib.mjs', import.meta.url), 'utf8');
  assert.match(lib, /posthog\.com/);
});
