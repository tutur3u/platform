import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  matchesTasksPublicationSmoke,
  runSmoke,
  smokePlan,
} from './smoke-checks.mjs';

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

test('Tasks release permits only the inherited edge framing header with enforced CSP', async () => {
  const robots = (value, policy = "frame-ancestors 'none'") =>
    nativeFetch({
      '/robots.txt': (headers) =>
        new Response('ok', {
          headers: {
            ...headers,
            'content-security-policy': policy,
            'x-frame-options': value,
          },
        }),
    });
  const baseline = await runSmoke(base, robots('SAMEORIGIN'));
  const strict = await runSmoke(base, nativeFetch());
  assert.equal(baseline.ok, true);
  assert.equal(matchesTasksPublicationSmoke(baseline, baseline), true);
  assert.equal(matchesTasksPublicationSmoke(strict, baseline), true);
  assert.equal(matchesTasksPublicationSmoke(baseline, strict), false);
  const openFrame = await runSmoke(
    base,
    robots('SAMEORIGIN', 'frame-ancestors *')
  );
  assert.equal(matchesTasksPublicationSmoke(openFrame, baseline), false);
  const differentHeader = await runSmoke(base, robots('ALLOWALL'));
  assert.equal(matchesTasksPublicationSmoke(differentHeader, baseline), false);
});

// The zone managed transform `add_security_headers` forces SAMEORIGIN, so the
// smoke check accepts it only alongside CSP frame-ancestors 'none'.
test('X-Frame-Options passes only as DENY or SAMEORIGIN with CSP frame-ancestors none', async () => {
  const none = "frame-ancestors 'none'";
  const robotsReport = async (xfo, csp) => {
    const report = await runSmoke(
      base,
      nativeFetch({
        '/robots.txt': (headers) => {
          const next = { ...headers };
          if (xfo === undefined) delete next['x-frame-options'];
          else next['x-frame-options'] = xfo;
          if (csp === undefined) delete next['content-security-policy'];
          else next['content-security-policy'] = csp;
          return new Response('ok', { headers: next });
        },
      })
    );
    return report.results.find((r) => r.name === 'robots');
  };
  assert.equal((await robotsReport('DENY', none)).ok, true);
  assert.equal((await robotsReport('SAMEORIGIN', none)).ok, true);
  assert.equal((await robotsReport('SAMEORIGIN', undefined)).ok, false);
  assert.equal(
    (await robotsReport('SAMEORIGIN', "frame-ancestors 'self'")).ok,
    false
  );
  assert.equal(
    (await robotsReport('ALLOW-FROM https://a.test', none)).ok,
    false
  );
  assert.equal((await robotsReport('ALLOWALL', none)).ok, false);
  assert.equal((await robotsReport(undefined, none)).ok, false);
  assert.match(
    (
      await robotsReport('SAMEORIGIN', "frame-ancestors 'self'")
    ).failures.join(),
    /X-Frame-Options/u
  );
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

test('relative Location resolves against the origin', async () => {
  const report = await runSmoke(
    { ...base, centralLogin: `${origin}/login` },
    nativeFetch(
      Object.fromEntries(
        ['/', '/vi/personal/boards'].map((path) => [
          path,
          (headers) =>
            new Response(null, {
              status: 307,
              headers: {
                ...headers,
                location: `/login?returnUrl=${encodeURIComponent(`${origin}/verify-token?nextUrl=${encodeURIComponent(path)}`)}`,
              },
            }),
        ])
      )
    )
  );
  assert.equal(report.ok, true, JSON.stringify(report.results));
});

for (const [name, overrides, expected] of [
  [
    'malformed Location',
    {
      '/': (headers) =>
        new Response(null, {
          status: 307,
          headers: { ...headers, location: 'https://[' },
        }),
    },
    /Invalid URL/u,
  ],
  [
    'body read',
    {
      '/robots.txt': (headers) => ({
        status: 200,
        headers: new Headers(headers),
        text: async () => {
          throw new Error('body read failed');
        },
      }),
    },
    /body read failed/u,
  ],
  [
    'initial fetch',
    {
      '/robots.txt': () => {
        throw new Error('fetch failed');
      },
    },
    /fetch failed/u,
  ],
  [
    'asset fetch',
    {
      '/assets/index.css': () => {
        throw new Error('asset fetch failed');
      },
    },
    /asset fetch failed/u,
  ],
]) {
  test(`${name} failure produces a FAIL row and remaining checks run`, async () => {
    const report = await runSmoke(base, nativeFetch(overrides));
    assert.equal(report.ok, false);
    assert.equal(report.results.length, smokePlan(base).length);
    const failed = report.results.filter((result) => !result.ok);
    assert.equal(failed.length, 1);
    assert.match(failed[0].failures.join(), expected);
    assert.equal(report.results.at(-1).ok, true);
  });
}
