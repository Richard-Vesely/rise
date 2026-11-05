# Analytics (PostHog): scaffolding only, OFF

**Status: not active. Nothing is collected and nothing is sent.** This is code scaffolding for possible future,
aggregate usage statistics (which UI features get used). It is **not** consent, **not** an approval to collect data,
and **not** an activation. Turning it on needs a separate, explicit decision by Richard after a privacy and legal review
(the players are children aged 10–14). Until that review, activation is prohibited.

Code: `client/src/ui/analytics.js` (no SDK, no dependency, no side effects at import, not in the module order chain).
Tests: `tests/unit/analytics.test.mjs` (mocked transport only; no real request to PostHog is ever made by tests).

## How it stays OFF

`track()` returns `false` and does nothing unless **every** gate below passes. The first two checks run before
the code reads any browser global (`location`, `navigator`, `fetch`), so while off the helper causes zero transport,
zero storage reads or writes, no timers and no fingerprinting.

| # | Gate | Shipped value / rule |
|---|---|---|
| 1 | `POSTHOG_PROJECT_KEY` | `''` (empty). A non-empty string is required. |
| 2 | `ANALYTICS_OPT_IN` | `false`. It must be exactly `true`. No env variable, URL or setting can change it. |
| 3 | Production build | `import.meta.env.PROD === true` and `MODE === 'production'` (Vite build). `npm run dev`, Node.js and tests: off. |
| 4 | Not automated | `navigator.webdriver === false` exactly (Playwright, Selenium, unknown runtimes: off). |
| 5 | Origin | exactly `https://richard-vesely.github.io` (no http, no port, no other subdomain, no suffix tricks). |
| 6 | Path | exactly `/rise` or starting with `/rise/` (not `/risex`, not other projects). |
| 7 | Event allowlist | the event name and every property value must be in `EVENTS` (see below). |
| 8 | Page cap | at most 100 events per page load (in-memory counter only). |

As a result, these stay off even with a key and opt-in set: localhost, `127.0.0.1`, private IPs, previews (Codespaces,
Netlify…), `file://`, the club Node server (its hostname is unknown, so it is not on the allowlist), the browser host
mode on any other address, dev builds and the play-tests. The browser play-tests also block every request to
`*.posthog.com` (`tests/playtest/lib.mjs`), and any such request is recorded as a test error.

## Event inventory

All call sites are in `client/src/ui/inventory-ui.js`. Each is one call per user action (no game loop, no autocapture,
no automatic pageview). Every property is required and must be one of the listed strings. Nothing else is accepted.

| Event | Properties (allowed values) | Call site |
|---|---|---|
| `inventory_opened` | `mode`: `inv` `bench` `adv` `chest` `fire` `furnace` `kitchen` `power` `car` `garage` | `openInventory()`, after the window is shown |
| `item_crafted` | `kind`: `craft` `repair`; `amount`: `1` `2-9` `10-63` `64+` (bucket of items made) | `takeResult()`, once per click when something was made |
| `recipe_book_used` | `result`: `filled` `missing_items` `needs_bench` `needs_workshop` | `fillRecipe()`, one per outcome branch |
| `creative_toggled` | `to`: `on` `off` (the state after the click) | the *mode* button click handler |

Every event also carries the fixed properties `app: "rise"`, `$ip: null`, `$process_person_profile: false` and
`$geoip_disable: true`.

Validation rejects (returns `false`, sends nothing): unknown or dynamic event names, extra or missing keys, any value
outside the enum (free text, regex-looking strings, names, raw numbers, booleans, `null`, objects, arrays),
non-plain objects, inherited keys and getters. Errors inside the helper (including a throwing or rejecting
transport) are swallowed and never reach the game UI.

## Request shape (only if all gates pass)

`POST https://eu.i.posthog.com/i/v0/e/` (EU cloud), with `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`,
`cache: 'no-store'` and `keepalive: true`. The body is `{ api_key, event, distinct_id: "rise-aggregate", properties }`.
There is one constant `distinct_id` for everybody. It is not derived from a player, device or session.

## What is never sent or stored

Not sent: player names or nicknames, chat, world content, item ids, inventory, documents, server addresses or world
ids, passwords, PINs, tokens, position, health, page URL, referrer, query or hash, user agent, and screen, GPU or
device data. Not used: cookies, `localStorage`, `sessionStorage`, IndexedDB, a persistent queue, random or persistent
IDs, `identify`, groups, person properties, session recording, autocapture or pageviews. The helper never reads
gameplay storage.

## Limitations (read before any activation)

- **The network still exposes the IP address and the user agent.** Any browser request to PostHog reveals the client
  IP address and the `User-Agent` header at the network level, whatever the payload says. `$ip: null` only asks
  PostHog not to use it.
- **A constant ID does not make the data legally anonymous.** Usage data from children can still be personal data
  (GDPR). This scaffolding is not a legal assessment.
- **Unverified vendor behaviour.** PostHog documents `$process_person_profile: false` (an event without a person
  profile). Whether `$ip: null` in event properties and `$geoip_disable: true` are honoured by the capture API was
  **not verified** from PostHog's documentation (only the Node SDK's `disableGeoip` option is documented). IP capture
  is also a project setting (EU projects can disable it). Until PostHog's contract and the project settings are
  reviewed, activation stays prohibited.
- No PostHog account, project or key was created or configured for this work.

## Why `app: "rise"`

The repository and the game are *Říše* (`rise`, see `AGENTS.md`). The old name `louka` (still in `package.json` and
the legacy files) is not used, so events are not mixed up with other projects.

## Testing

`npm test` runs `tests/unit/analytics.test.mjs`, which covers:

- the shipped defaults (empty key, `false` opt-in);
- the source contains no storage, timer, identity or env access;
- the default `track()` touches no globals, and importing the module has no side effects;
- each failing gate sends nothing, including the origin and path allowlist cases;
- the exact payload and fetch options, checked with a mocked transport;
- rejection of bad events and properties;
- count buckets, a frozen schema, failure safety and the per-page cap;
- the call sites match the inventory.

The tests never weaken the production guard: they use `createAnalytics()` with an injected runtime and transport.

## Activation boundary

Do not put a real key in the repository and do not set `ANALYTICS_OPT_IN` to `true` without Richard's explicit,
written decision after the review above. Adding an event means adding it to `EVENTS`, this table and the tests in
the same PR.
