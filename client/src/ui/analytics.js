// Analytika (PostHog), VYPNUTÁ. Jen kostra: klíč je prázdný a přepínač ANALYTICS_OPT_IN je false.
// Zapnout ji smí jen Richard po právní a soukromé kontrole (viz docs/ANALYTICS.md), ne žádné nastavení prostředí.
// Modul nemá vedlejší účinky při načtení: jen konstanty a funkce (není v řetězci pořadí spouštění).
// Nic se neukládá (žádné cookies, localStorage, IndexedDB, fronta), žádné náhodné ani hráčské ID, žádné časovače.
// Posílají se jen pevně vyjmenované události s pevně vyjmenovanými hodnotami (žádný volný text, žádná čísla).

/** Klíč projektu PostHog. Musí zůstat prázdný, dokud Richard aktivaci výslovně neschválí. */
export const POSTHOG_PROJECT_KEY = '';
/** Samostatný vypínač (souhlas/aktivace). Musí zůstat false. Žádná proměnná prostředí ho nepřepíše. */
export const ANALYTICS_OPT_IN = false;
/** EU cloud PostHogu. */
export const POSTHOG_HOST = 'https://eu.i.posthog.com';
/** Jméno aplikace v událostech: repozitář a hra se jmenují "rise" (staré jméno složky/balíčku "louka" se nepoužívá). */
export const APP = 'rise';
/** Jedno stálé ID pro všechny (PostHog ho vyžaduje). Není odvozené od hráče, zařízení ani sezení. */
export const DISTINCT_ID = 'rise-aggregate';
/** Jediná povolená adresa: https://richard-vesely.github.io/rise… (server kroužku má neznámou adresu = vypnuto). */
const ORIGIN = 'https://richard-vesely.github.io';
const MAX_EVENTS = 100; // víc událostí za jedno načtení stránky se nepošle (jen počítadlo v paměti)

/** Pevné skupiny pro počty: syrové číslo se nikdy neposílá. */
export const COUNT_BUCKETS = Object.freeze(['1', '2-9', '10-63', '64+']);
const freeze = (o) => Object.freeze(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.freeze([...v])])));

/**
 * Seznam povolených událostí: jméno → { vlastnost: [povolené hodnoty] }. Každá vlastnost je povinná.
 * Kde se volají: client/src/ui/inventory-ui.js (viz docs/ANALYTICS.md).
 */
export const EVENTS = Object.freeze({
  inventory_opened: freeze({ mode: ['inv', 'bench', 'adv', 'chest', 'fire', 'furnace', 'kitchen', 'power', 'car', 'garage'] }),
  item_crafted: freeze({ kind: ['craft', 'repair'], amount: COUNT_BUCKETS }),
  recipe_book_used: freeze({ result: ['filled', 'missing_items', 'needs_bench', 'needs_workshop'] }),
  creative_toggled: freeze({ to: ['on', 'off'] }),
});

/**
 * Počet → pevná skupina ('1', '2-9', '10-63', '64+'); jiné hodnoty než celé číslo ≥ 1 → null.
 * @param {unknown} n
 * @returns {string | null}
 */
export function countBucket(n) {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null;
  return n === 1 ? '1' : n < 10 ? '2-9' : n < 64 ? '10-63' : '64+';
}

/**
 * Ověří vlastnosti podle seznamu: jen obyčejný objekt, přesně povolené klíče, jen povolené řetězce.
 * @returns {Record<string, string> | null} bezpečná kopie, nebo null
 */
function cleanProps(schema, props) {
  if (props === null || typeof props !== 'object') return null;
  const proto = Object.getPrototypeOf(props);
  if (proto !== Object.prototype && proto !== null) return null;
  const keys = Reflect.ownKeys(props);
  const want = Object.keys(schema);
  if (keys.length !== want.length) return null;
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of want) {
    const d = Object.getOwnPropertyDescriptor(props, k);
    if (!d || !('value' in d)) return null; // žádné gettery
    if (typeof d.value !== 'string' || !schema[k].includes(d.value)) return null;
    out[k] = d.value;
  }
  return out;
}

/**
 * Smí se v tomto prostředí posílat? Vše musí platit, jinak vypnuto.
 * @param {{ prodBuild?: unknown, origin?: unknown, pathname?: unknown, webdriver?: unknown } | null | undefined} rt
 */
function allowedRuntime(rt) {
  if (!rt || rt.prodBuild !== true || rt.webdriver !== false) return false;
  if (rt.origin !== ORIGIN || typeof rt.pathname !== 'string') return false;
  return rt.pathname === '/rise' || rt.pathname.startsWith('/rise/');
}

/**
 * Skutečné prostředí prohlížeče. Volá se až po kontrole klíče a vypínače, takže vypnutá analytika nic nečte.
 * Produkční sestavení = Vite build v režimu production (vývoj, testy, Node.js = vypnuto).
 */
function browserRuntime() {
  const env = typeof import.meta.env === 'object' && import.meta.env ? import.meta.env : null;
  const loc = typeof location === 'object' && location ? location : null;
  const nav = typeof navigator === 'object' && navigator ? navigator : null;
  if (!env || !loc || !nav) return null;
  return { prodBuild: env.PROD === true && env.MODE === 'production', origin: loc.origin, pathname: loc.pathname, webdriver: nav.webdriver === true ? true : nav.webdriver === false ? false : undefined };
}

/** Výchozí přenos: fetch bez cookies a bez refereru. */
function fetchTransport(url, init) { return fetch(url, init); }

/**
 * Vytvoří analytiku. Hra používá jen výchozí `track` níže (prázdný klíč + false = nikdy nic nepošle).
 * Testy sem dávají vlastní (podvržený) přenos a prostředí; skutečný požadavek na PostHog se v testech neposílá.
 * @param {{ key?: unknown, optIn?: unknown, runtime?: () => any | object | null, transport?: unknown }} [cfg]
 */
export function createAnalytics(cfg) {
  const { key = '', optIn = false, runtime = null, transport = null } = cfg || {};
  let sent = 0;
  /**
   * Pošle jednu povolenou událost. Nikdy nevyhodí chybu do hry.
   * @param {string} event jméno z EVENTS
   * @param {Record<string, string>} [props] přesně vlastnosti z EVENTS[event]
   * @returns {boolean} true = předáno přenosu
   */
  function trackEvent(event, props = {}) {
    try {
      if (typeof key !== 'string' || !key.trim() || optIn !== true) return false; // vypnuto: nic dalšího se nečte
      if (typeof transport !== 'function' || sent >= MAX_EVENTS) return false;
      if (typeof event !== 'string' || !Object.hasOwn(EVENTS, event)) return false;
      const clean = cleanProps(EVENTS[event], props);
      if (!clean) return false;
      const rt = typeof runtime === 'function' ? runtime() : runtime;
      if (!allowedRuntime(rt)) return false;
      const body = JSON.stringify({
        api_key: key,
        event,
        distinct_id: DISTINCT_ID,
        properties: { app: APP, ...clean, $ip: null, $process_person_profile: false, $geoip_disable: true },
      });
      sent++;
      const p = transport(`${POSTHOG_HOST}/i/v0/e/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        keepalive: true,
      });
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
  return { track: trackEvent };
}

const shipped = createAnalytics({ key: POSTHOG_PROJECT_KEY, optIn: ANALYTICS_OPT_IN, runtime: browserRuntime, transport: fetchTransport });

/**
 * Herní volání: `track('inventory_opened', { mode: 'inv' })`. Dokud je klíč prázdný a ANALYTICS_OPT_IN false, nedělá nic.
 * @param {string} event
 * @param {Record<string, string>} [props]
 */
export const track = shipped.track;
