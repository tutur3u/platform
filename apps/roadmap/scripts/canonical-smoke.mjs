/**
 * Post-deploy smoke for the live roadmap on its canonical host.
 *
 * The pre-seal doctor runs the built Worker on loopback, which cannot see
 * what the tuturuuu.com zone does in front of the Worker. On 11 Nov 2026
 * the zone's Speed Brain answered the browser's
 * `Sec-Purpose: prefetch` request for the history asset with 503 while every
 * plain fetch passed. This smoke therefore:
 *   1. loads every public page and requires 200 HTML without a prefetch or
 *      prerender link, or a speculation rules script;
 *   2. fetches every asset those pages reference (shared asset smoke);
 *   3. replays each <link rel="preload|modulepreload|prefetch"> with the
 *      headers a browser sends for it, and requires 200.
 *
 *   4. requests the history JSON the timeline loads by script (found in the
 *      page scripts, or passed exactly) and requires non-empty JSON.
 *
 * Usage: node apps/roadmap/scripts/canonical-smoke.mjs [origin] [history-path]
 */
import { smokeAssets } from '../../../scripts/ci/asset-smoke.mjs';

/** Every public page and language. Kept in step with the pre-seal doctor. */
export const CANONICAL_PAGES = [
  '/roadmap',
  '/roadmap/vi',
  '/roadmap/workshops/edufest-2026',
  '/roadmap/vi/workshops/edufest-2026',
];

function attribute(attrs, name) {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i'
  ).exec(attrs);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

/** Resource hints a browser acts on by itself, with their rel and `as`. */
export function resourceHints(html) {
  const hints = [];
  for (const match of String(html).matchAll(/<link\b([^>]*)>/gi)) {
    const rels = (attribute(match[1], 'rel') ?? '').toLowerCase().split(/\s+/);
    const rel = ['preload', 'modulepreload', 'prefetch', 'prerender'].find(
      (name) => rels.includes(name)
    );
    const href = attribute(match[1], 'href');
    if (rel && href)
      hints.push({
        rel,
        href,
        as: (attribute(match[1], 'as') ?? '').toLowerCase(),
      });
  }
  return hints;
}

/** The request headers a browser sends when it follows a resource hint. */
export function browserHeaders(hint, origin) {
  if (hint.rel === 'prefetch' || hint.rel === 'prerender')
    return {
      'sec-purpose': 'prefetch',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'no-cors',
    };
  if (hint.rel === 'modulepreload')
    return { 'sec-fetch-dest': 'script', 'sec-fetch-mode': 'cors', origin };
  if (hint.as === 'font')
    return { 'sec-fetch-dest': 'font', 'sec-fetch-mode': 'cors', origin };
  return {
    'sec-fetch-dest': hint.as === 'fetch' ? 'empty' : hint.as || 'empty',
    'sec-fetch-mode': 'no-cors',
  };
}

/**
 * Speculative-load markup on a page: `<script type="speculationrules">`.
 * The zone 503s the prefetches it would trigger, like a prefetch link.
 */
export function speculationRuleScripts(html) {
  let count = 0;
  for (const match of String(html).matchAll(/<script\b([^>]*)>/gi))
    if (
      (attribute(match[1], 'type') ?? '').trim().toLowerCase() ===
      'speculationrules'
    )
      count += 1;
  return count;
}

/** The hashed history JSON the timeline fetches after mount. */
const HISTORY_ASSET = /\/roadmap\/assets\/history-[A-Za-z0-9_-]{8,}\.json/g;

/**
 * The history asset is loaded by script, not markup, so the HTML/CSS asset
 * smoke never requests it. Find it in the page scripts that loaded.
 */
async function discoverHistory(scripts, fetchImpl) {
  const found = new Set();
  for (const src of scripts) {
    const response = await fetchImpl(src);
    if (response.status !== 200) continue;
    for (const match of (await response.text()).matchAll(HISTORY_ASSET))
      found.add(match[0]);
  }
  return [...found];
}

async function checkHistory(path, origin, fetchImpl) {
  const response = await fetchImpl(new URL(path, origin).href, {
    headers: { accept: 'application/json' },
  });
  const type = response.headers.get('content-type') ?? '';
  const body = response.status === 200 ? await response.text() : '';
  let json = false;
  try {
    json = body.length > 0 && JSON.parse(body) !== null;
  } catch {
    json = false;
  }
  const ok =
    response.status === 200 && /^application\/json\b/i.test(type) && json;
  return {
    line: `${response.status} history ${path}`,
    failure: ok
      ? null
      : `history ${path} status ${response.status} content-type ${type || '(missing)'} bytes ${body.length}, expected 200 non-empty application/json`,
  };
}

/**
 * A disabled workers.dev origin returns Cloudflare error 1042.
 * Redirects expose a live origin and must never be followed.
 */
export async function workersDevSmoke({ url, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(url, { redirect: 'manual' });
  const body = await response.text();
  const ok = response.status === 404 && /\b1042\b/.test(body);
  return {
    ok,
    checked: [
      `${response.status} workers.dev ${url} (1042: ${/\b1042\b/.test(body)})`,
    ],
    failures: ok
      ? []
      : [
          `workers.dev ${url} status ${response.status}, expected 404 with Cloudflare error 1042; location ${response.headers.get('location') ?? '(none)'}`,
        ],
  };
}

export async function canonicalSmoke({
  origin = 'https://tuturuuu.com',
  fetchImpl = globalThis.fetch,
  /** The exact history path from the build artifact; discovered if omitted. */
  historyPath = null,
  workersDevUrl = null,
} = {}) {
  const failures = [];
  const checked = [];
  if (workersDevUrl) {
    const result = await workersDevSmoke({ url: workersDevUrl, fetchImpl });
    checked.push(...result.checked);
    failures.push(...result.failures);
  }
  const hints = new Map();
  for (const path of CANONICAL_PAGES) {
    const url = `${origin}${path}`;
    const response = await fetchImpl(url, { redirect: 'manual' });
    const html = response.status === 200 ? await response.text() : '';
    checked.push(`${response.status} ${path}`);
    if (response.status !== 200) {
      failures.push(`${path} status ${response.status}, expected 200`);
      continue;
    }
    if (speculationRuleScripts(html) > 0)
      failures.push(
        `${path} has <script type="speculationrules">: the zone answers Sec-Purpose: prefetch with 503`
      );
    for (const hint of resourceHints(html)) {
      if (hint.rel === 'prefetch' || hint.rel === 'prerender')
        failures.push(
          `${path} has rel="${hint.rel}" ${hint.href}: the zone answers Sec-Purpose: prefetch with 503`
        );
      const target = new URL(hint.href, url).href;
      if (new URL(target).origin === origin)
        hints.set(`${hint.rel} ${target}`, { ...hint, target });
    }
  }
  const assets = await smokeAssets({
    pages: CANONICAL_PAGES.map((path) => ({
      url: `${origin}${path}`,
      status: 200,
    })),
    canonicalOrigin: origin,
    fetchImpl,
  });
  failures.push(...assets.failures);
  for (const asset of assets.assets ?? [])
    checked.push(`${asset.status} ${asset.url}`);
  const scripts = (assets.assets ?? [])
    .filter((asset) => asset.kind === 'js' && asset.ok)
    .map((asset) => asset.url);
  const histories = historyPath
    ? [historyPath]
    : await discoverHistory(scripts, fetchImpl);
  if (histories.length === 0)
    failures.push('no page script references a hashed history asset');
  for (const path of histories) {
    const result = await checkHistory(path, origin, fetchImpl);
    checked.push(result.line);
    if (result.failure) failures.push(result.failure);
  }
  for (const hint of hints.values()) {
    const response = await fetchImpl(hint.target, {
      headers: browserHeaders(hint, origin),
    });
    checked.push(`${response.status} ${hint.rel} ${hint.target}`);
    if (response.status !== 200)
      failures.push(
        `${hint.rel} ${hint.target} replayed with browser headers: status ${response.status}, expected 200`
      );
  }
  return { ok: failures.length === 0, failures, checked };
}

async function main() {
  const origin = (process.argv[2] ?? 'https://tuturuuu.com').replace(/\/$/, '');
  // Optional: the exact history path from the sealed artifact.
  const historyPath = process.argv[3] ?? null;
  const result = await canonicalSmoke({
    origin,
    historyPath,
    workersDevUrl: process.env.ROADMAP_WORKERS_DEV_URL,
  });
  for (const line of result.checked) console.log(line);
  for (const failure of result.failures) console.error(`- ${failure}`);
  console.log(
    result.ok
      ? `canonical smoke passed on ${origin}`
      : `canonical smoke FAILED on ${origin}`
  );
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
