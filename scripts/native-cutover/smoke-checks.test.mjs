import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runSmoke, smokePlan } from './smoke-checks.mjs';

const origin = 'https://tasks.tuturuuu.com';
const base = { origin, app: 'tasks', expectRuntime: 'native' };
const framing = {
  'content-security-policy': "frame-ancestors 'none'",
  'x-frame-options': 'DENY',
};
const html =
  '<!DOCTYPE html><html><head><link rel="stylesheet" href="/assets/index.css"/></head></html>';

/** A healthy native Worker; `override` replaces one path's response. */
function nativeFetch(override = {}) {
  return async (url, init = {}) => {
    const { pathname, search } = new URL(url);
    const path = `${pathname}${search}`;
    const headers = { ...framing, 'x-tuturuuu-runtime': 'native' };
    const login = (next) =>
      `https://tuturuuu.com/login?returnUrl=${encodeURIComponent(`${origin}/verify-token?nextUrl=${encodeURIComponent(next)}`)}`;
    if (override[path]) return override[path](headers);
    if (path === '/robots.txt') return new Response('ok', { headers });
    if (path === '/')
      return new Response(null, {
        status: 307,
        headers: { ...headers, location: login('/') },
      });
    if (path === '/vi/personal/boards')
      return new Response(null, {
        status: 307,
        headers: { ...headers, location: login('/vi/personal/boards') },
      });
    if (path.startsWith('/api/v1/'))
      return new Response('{}', { status: 401, headers });
    if (path === '/api/build-info')
      return new Response(JSON.stringify({ appName: 'tasks' }), { headers });
    if (path.startsWith('/_serverFn'))
      return new Response(null, {
        status: init.method === 'POST' ? 415 : 405,
        headers,
      });
    if (path === '/assets/index.css') return new Response('css', { headers });
    if (path.startsWith('/shared/task/'))
      return new Response(html, { headers });
    return new Response('missing', { status: 404, headers });
  };
}

test('a healthy native Worker passes every check', async () => {
  const report = await runSmoke(base, nativeFetch());
  assert.equal(report.ok, true, JSON.stringify(report.results, null, 1));
  assert.equal(report.results.length, smokePlan(base).length);
});

test('legacy responses fail a native expectation', async () => {
  const report = await runSmoke(base, async (url, init) => {
    const response = await nativeFetch()(url, init);
    const headers = new Headers(response.headers);
    headers.delete('x-tuturuuu-runtime');
    return new Response(response.body, { status: response.status, headers });
  });
  assert.equal(report.ok, false);
  assert.match(report.results[0].failures.join(), /expected native/u);
});

test('a login return outside the app host fails', async () => {
  const report = await runSmoke(
    base,
    nativeFetch({
      '/': (headers) =>
        new Response(null, {
          status: 307,
          headers: {
            ...headers,
            location: `https://tuturuuu.com/login?returnUrl=${encodeURIComponent('https://tuturuuu.com/verify-token')}`,
          },
        }),
    })
  );
  assert.equal(report.ok, false);
  assert.match(
    report.results
      .find((r) => r.name.startsWith('anonymous root'))
      .failures.join(),
    /returnUrl/u
  );
});

test('a server error and missing framing headers fail', async () => {
  const report = await runSmoke(
    base,
    nativeFetch({
      '/robots.txt': () => new Response('boom', { status: 500 }),
    })
  );
  const robots = report.results.find((r) => r.name === 'robots');
  assert.equal(robots.ok, false);
  assert.match(robots.failures.join(), /server error 500/u);
  assert.match(robots.failures.join(), /X-Frame-Options/u);
});

test('legacy mode expects the guarded build-info and skips the server-function probe', () => {
  const plan = smokePlan({ ...base, expectRuntime: 'legacy' });
  assert.deepEqual(
    plan.find((c) => c.name === 'build-info').expect.status,
    [401]
  );
  assert.equal(
    plan.some((c) => c.path.startsWith('/_serverFn')),
    false
  );
});
