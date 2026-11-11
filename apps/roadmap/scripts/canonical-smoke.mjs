/**
 * Post-deploy smoke for the live roadmap on its canonical host.
 *
 * The pre-seal doctor runs the built Worker on loopback, and previews run on
 * workers.dev: neither sees what the tuturuuu.com zone does in front of the
 * Worker. On 11 Nov 2026 the zone's Speed Brain answered the browser's
 * `Sec-Purpose: prefetch` request for the history asset with 503 while every
 * plain fetch passed. This smoke therefore:
 *   1. loads every public page and requires 200 HTML without a prefetch,
 *      prerender or speculation rules;
 *   2. fetches every asset those pages reference (shared asset smoke);
 *   3. replays each <link rel="preload|modulepreload|prefetch"> with the
 *      headers a browser sends for it, and requires 200.
 *
 * Usage: node apps/roadmap/scripts/canonical-smoke.mjs [https://tuturuuu.com]
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

export async function canonicalSmoke({
  origin = 'https://tuturuuu.com',
  fetchImpl = globalThis.fetch,
} = {}) {
  const failures = [];
  const checked = [];
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
  const result = await canonicalSmoke({ origin });
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
