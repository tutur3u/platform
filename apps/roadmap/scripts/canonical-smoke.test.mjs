/** D79: the canonical post-deploy smoke catches zone-only failures. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PUBLIC_DOCUMENTS } from '../src/cache-policy.ts';
import {
  browserHeaders,
  CANONICAL_PAGES,
  canonicalSmoke,
  resourceHints,
  workersDevSmoke,
} from './canonical-smoke.mjs';
import { PUBLIC_DOCUMENT_PATHS } from './pre-seal-doctor.mjs';

const ORIGIN = 'https://tuturuuu.com';
const HISTORY = '/roadmap/assets/history-Abcd1234.json';

/**
 * A stand-in for the tuturuuu.com zone: pages and assets answer 200, and,
 * like Cloudflare Speed Brain, any `Sec-Purpose: prefetch` request gets 503.
 */
function zone({
  prefetchHistory = false,
  speculationRules = false,
  history = 'ok',
  scriptReferencesHistory = true,
} = {}) {
  const page = `<!doctype html><html><head>
<link rel="stylesheet" href="/roadmap/assets/styles-Abcd1234.css">
<link rel="preload" as="font" type="font/woff2" crossorigin="anonymous" href="/roadmap/assets/be-vietnam-pro-500-latin-Abcd1234.woff2">
${prefetchHistory ? '<link rel="prefetch" href="/roadmap/assets/history-Abcd1234.json" as="fetch">' : ''}
<script type="module" src="/roadmap/assets/index-Abcd1234.js"></script>
${speculationRules ? '<script type="speculationrules">{"prefetch":[{"source":"document"}]}</script>' : ''}
</head><body><h1>Roadmap</h1></body></html>`;
  const types = {
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.woff2': 'font/woff2',
    '.json': 'application/json',
  };
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const headers = new Headers(init.headers ?? {});
    if (headers.get('sec-purpose') === 'prefetch')
      return new Response('', { status: 503 });
    if (CANONICAL_PAGES.includes(url.pathname))
      return new Response(page, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    if (url.pathname === HISTORY) {
      if (history === 'missing')
        return new Response('missing', { status: 404 });
      if (history === 'html')
        return new Response('<html>fallback</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      if (history === 'empty')
        return new Response('', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
    }
    const extension = url.pathname.slice(url.pathname.lastIndexOf('.'));
    if (url.pathname.startsWith('/roadmap/assets/') && types[extension]) {
      const body =
        extension === '.json'
          ? '{"a":1}'
          : extension === '.js' && scriptReferencesHistory
            ? `var h=\`${HISTORY}\`;`
            : 'x';
      return new Response(body, {
        status: 200,
        headers: { 'content-type': types[extension] },
      });
    }
    return new Response('missing', { status: 404 });
  };
}

test('the canonical smoke passes when pages and assets load without prefetch', async () => {
  const result = await canonicalSmoke({
    origin: ORIGIN,
    fetchImpl: zone({ prefetchHistory: false }),
  });
  assert.deepEqual(result.failures, []);
  assert.ok(result.checked.some((line) => line.startsWith('200 preload')));
});

test('D79 (#8163): a prefetched asset that the zone 503s fails the canonical smoke', async () => {
  const result = await canonicalSmoke({
    origin: ORIGIN,
    fetchImpl: zone({ prefetchHistory: true }),
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) =>
      failure.includes(
        'prefetch https://tuturuuu.com/roadmap/assets/history-Abcd1234.json replayed with browser headers: status 503'
      )
    ),
    result.failures.join('\n')
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.startsWith('/roadmap/vi has rel="prefetch"')
    )
  );
});

test('resource hints are replayed with the headers a browser sends', () => {
  const hints = resourceHints(
    '<link rel="prefetch" href="/a.json" as="fetch"><link href="/f.woff2" as="font" rel="preload"><link rel="stylesheet" href="/s.css"><link rel="modulepreload" href="/m.js">'
  );
  assert.deepEqual(
    hints.map((hint) => `${hint.rel} ${hint.href}`),
    ['prefetch /a.json', 'preload /f.woff2', 'modulepreload /m.js']
  );
  assert.equal(browserHeaders(hints[0], ORIGIN)['sec-purpose'], 'prefetch');
  assert.equal(browserHeaders(hints[1], ORIGIN)['sec-fetch-dest'], 'font');
  assert.equal(browserHeaders(hints[1], ORIGIN).origin, ORIGIN);
});

test('the smoke, the doctor and the cache policy cover the same public pages', () => {
  assert.deepEqual(
    [...CANONICAL_PAGES].sort(),
    [...PUBLIC_DOCUMENT_PATHS].sort()
  );
  assert.deepEqual([...CANONICAL_PAGES].sort(), [...PUBLIC_DOCUMENTS].sort());
});

test('the smoke requests the history asset the page scripts load, and requires non-empty JSON', async () => {
  const pass = await canonicalSmoke({ origin: ORIGIN, fetchImpl: zone() });
  assert.deepEqual(pass.failures, []);
  assert.ok(
    pass.checked.includes(`200 history ${HISTORY}`),
    pass.checked.join('\n')
  );
  // Broken variants: missing, served as HTML, empty, or never referenced.
  for (const history of ['missing', 'html', 'empty']) {
    const { ok, failures } = await canonicalSmoke({
      origin: ORIGIN,
      fetchImpl: zone({ history }),
    });
    assert.equal(ok, false, history);
    assert.ok(
      failures.some((failure) =>
        failure.startsWith(`history ${HISTORY} status`)
      ),
      `${history}: ${failures.join('\n')}`
    );
  }
  const unreferenced = await canonicalSmoke({
    origin: ORIGIN,
    fetchImpl: zone({ scriptReferencesHistory: false }),
  });
  assert.ok(
    unreferenced.failures.includes(
      'no page script references a hashed history asset'
    ),
    unreferenced.failures.join('\n')
  );
});

test('D79: speculation rules markup on a canonical page fails the smoke', async () => {
  const { ok, failures } = await canonicalSmoke({
    origin: ORIGIN,
    fetchImpl: zone({ speculationRules: true }),
  });
  assert.equal(ok, false);
  for (const page of CANONICAL_PAGES)
    assert.ok(
      failures.some((failure) =>
        failure.startsWith(`${page} has <script type="speculationrules">`)
      ),
      `${page}: ${failures.join('\n')}`
    );
});

/**
 * The deferred-hydration page as the Worker serves it: the entry is an inert
 * `type="text/plain"` script, route chunks are inert `roadmap-modulepreload`
 * hints, and the boot script is external. `historyIn` says which file
 * carries the hashed history URL.
 */
function deferredZone(historyIn) {
  const page = `<!doctype html><html><head>
<link rel="roadmap-modulepreload" href="/roadmap/assets/roadmap-Abcd1234.js" fetchPriority="low"/>
<link rel="alternate" type="application/json" href="${HISTORY}" title="Roadmap history"/>
<script src="/roadmap/assets/roadmap-boot-Abcd1234.js"></script>
</head><body><h1>Roadmap</h1>
<script type="text/plain" data-roadmap-entry="" src="/roadmap/assets/index-Abcd1234.js"></script>
</body></html>`;
  return async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (CANONICAL_PAGES.includes(url.pathname))
      return new Response(page, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    if (url.pathname === HISTORY)
      return new Response('{"a":1}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    if (/^\/roadmap\/assets\/[\w-]+\.js$/.test(url.pathname))
      return new Response(
        url.pathname.includes(historyIn) ? `var h="${HISTORY}";` : 'x',
        { status: 200, headers: { 'content-type': 'text/javascript' } }
      );
    return new Response('missing', { status: 404 });
  };
}

test('D79: the smoke finds the history asset in the entry the page names, with hydration deferred', async () => {
  const passing = await canonicalSmoke({
    origin: ORIGIN,
    fetchImpl: deferredZone('/index-'),
  });
  assert.deepEqual(passing.failures, []);
  assert.ok(passing.checked.includes(`200 history ${HISTORY}`));
  // Broken variant (#8190 at 7d39dbbd): the URL only in a route chunk the
  // page names through an inert hint, which the smoke never fetches.
  const broken = await canonicalSmoke({
    origin: ORIGIN,
    fetchImpl: deferredZone('/roadmap-Abcd1234'),
  });
  assert.ok(
    broken.failures.includes(
      'no page script references a hashed history asset'
    ),
    broken.failures.join('\n')
  );
});

const WORKERS_DEV = 'https://tuturuuu-roadmap.tuturuuu-e89.workers.dev/';

for (const [status, body, expected] of [
  [404, 'error code: 1042', true],
  [301, 'error code: 1042', false],
  [200, 'error code: 1042', false],
  [404, 'Not found', false],
  [404, 'error code: 10420', false],
]) {
  test(`workers.dev probe: ${status} ${body} passes=${expected}`, async () => {
    let calls = 0;
    const result = await workersDevSmoke({
      url: WORKERS_DEV,
      fetchImpl: async (url, init) => {
        calls += 1;
        assert.equal(url, WORKERS_DEV);
        assert.equal(init.redirect, 'manual');
        return new Response(body, { status });
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.ok, expected);
    assert.equal(result.failures.length, expected ? 0 : 1);
  });
}

test('canonical smoke includes the opt-in workers.dev rejection', async () => {
  const canonicalFetch = zone();
  const result = await canonicalSmoke({
    workersDevUrl: WORKERS_DEV,
    fetchImpl: async (url, init) =>
      url === WORKERS_DEV
        ? new Response('', { status: 301, headers: { location: '/roadmap' } })
        : canonicalFetch(url, init),
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join(' '), /workers.dev/);
});
