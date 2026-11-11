/** D79: the canonical post-deploy smoke catches zone-only failures. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PUBLIC_DOCUMENTS } from '../src/cache-policy.ts';
import {
  browserHeaders,
  CANONICAL_PAGES,
  canonicalSmoke,
  resourceHints,
} from './canonical-smoke.mjs';
import { PUBLIC_DOCUMENT_PATHS } from './pre-seal-doctor.mjs';

const ORIGIN = 'https://tuturuuu.com';

/**
 * A stand-in for the tuturuuu.com zone: pages and assets answer 200, and,
 * like Cloudflare Speed Brain, any `Sec-Purpose: prefetch` request gets 503.
 */
function zone({ prefetchHistory }) {
  const page = `<!doctype html><html><head>
<link rel="stylesheet" href="/roadmap/assets/styles-Abcd1234.css">
<link rel="preload" as="font" type="font/woff2" crossorigin="anonymous" href="/roadmap/assets/be-vietnam-pro-500-latin-Abcd1234.woff2">
${prefetchHistory ? '<link rel="prefetch" href="/roadmap/assets/history-Abcd1234.json" as="fetch">' : ''}
<script type="module" src="/roadmap/assets/index-Abcd1234.js"></script>
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
    const extension = url.pathname.slice(url.pathname.lastIndexOf('.'));
    if (url.pathname.startsWith('/roadmap/assets/') && types[extension])
      return new Response(extension === '.json' ? '{"a":1}' : 'x', {
        status: 200,
        headers: { 'content-type': types[extension] },
      });
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
