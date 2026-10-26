import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mountedPath,
  resolveRuntimeProbes,
  runtimeExpectationProblems,
  runtimeOutcomeFailure,
} from './runtime-outcome.mjs';

test('a runtime map must be a record that declares the root', () => {
  assert.deepEqual(runtimeExpectationProblems({ '/': 200 }), []);
  assert.deepEqual(
    runtimeExpectationProblems({
      '/': { redirect: '/en' },
      '/login': 200,
      '/out': { redirect: 'https://tuturuuu.com/login' },
    }),
    []
  );
  // Containers that would drop the root assertion.
  for (const runtime of [{}, [], [200], { '/about': 200 }, null, 'ok', 200])
    assert.notDeepEqual(
      runtimeExpectationProblems(runtime),
      [],
      JSON.stringify(runtime)
    );
  assert.match(
    runtimeExpectationProblems({ '/about': 200 }).join(),
    /must declare the root "\/"/u
  );
  // Malformed entries.
  for (const expected of [
    500,
    199,
    200.5,
    '200',
    { redirect: '' },
    { redirect: 'en' },
    { redirect: '//evil.test/x' },
    { redirect: 'javascript:alert(1)' },
    { redirect: '/en', status: 307 },
    { status: 200 },
    [],
  ])
    assert.notDeepEqual(
      runtimeExpectationProblems({ '/': expected }),
      [],
      JSON.stringify(expected)
    );
  assert.notDeepEqual(runtimeExpectationProblems({ '/': 200, about: 200 }), []);
});

const root = { origin: 'http://127.0.0.1:8787' };
const apex = { origin: 'http://tuturuuu.com', base: '/forms' };

test('statuses must match exactly; a login redirect never passes for 200', () => {
  assert.equal(
    runtimeOutcomeFailure({ ...root, path: '/', expected: 200, status: 200 }),
    null
  );
  assert.match(
    runtimeOutcomeFailure({
      ...root,
      path: '/',
      expected: 200,
      status: 307,
      location: 'https://tuturuuu.com/login?returnUrl=%2F',
    }),
    /\/: 307 -> https:\/\/tuturuuu\.com\/login.*expected 200/u
  );
  assert.match(
    runtimeOutcomeFailure({ ...apex, path: '/', expected: 200, status: 500 }),
    /^\/forms: 500; expected 200$/u
  );
});

test('path redirects stay on the origin and keep the mount', () => {
  const expected = { redirect: '/en' };
  const outcome = (context, location, status = 307) =>
    runtimeOutcomeFailure({
      ...context,
      path: '/',
      expected,
      status,
      location,
    });
  assert.equal(outcome(root, '/en'), null);
  assert.equal(outcome(root, 'http://127.0.0.1:8787/en?x=1'), null);
  assert.equal(outcome(apex, '/forms/en'), null);
  assert.equal(outcome(apex, 'http://tuturuuu.com/forms/en'), null);
  // Negative controls: wrong origin, missing mount prefix, another app.
  assert.match(outcome(apex, 'https://evil.test/forms/en'), /same-origin/u);
  assert.match(outcome(root, 'https://evil.test/en'), /same-origin/u);
  assert.match(outcome(apex, '/en'), /expected \/forms\/en$/u);
  assert.match(outcome(apex, '/finance/en'), /expected \/forms\/en$/u);
  assert.match(outcome(apex, '//evil.test/forms/en'), /same-origin/u);
  // Not a redirect at all.
  assert.match(outcome(apex, null, 200), /expected a redirect to \/en/u);
  assert.match(outcome(apex, '/forms/en', 200), /expected a redirect/u);
});

test('a redirect to the mount root keeps the mount boundary', () => {
  const expected = { redirect: '/' };
  const outcome = (location) =>
    runtimeOutcomeFailure({
      ...apex,
      path: '/x',
      expected,
      status: 308,
      location,
    });
  assert.equal(outcome('/forms'), null);
  assert.equal(outcome('/forms/'), null);
  assert.match(outcome('/formsx'), /expected \/forms\//u);
  assert.match(outcome('/'), /expected \/forms\//u);
});

test('absolute URL redirects match as URL prefixes on every origin', () => {
  const expected = { redirect: 'https://tuturuuu.com/login' };
  for (const context of [root, apex]) {
    assert.equal(
      runtimeOutcomeFailure({
        ...context,
        path: '/',
        expected,
        status: 307,
        location: 'https://tuturuuu.com/login?returnUrl=%2Fforms',
      }),
      null
    );
    assert.match(
      runtimeOutcomeFailure({
        ...context,
        path: '/',
        expected,
        status: 307,
        location: 'https://evil.test/login',
      }),
      /expected https:\/\/tuturuuu\.com\/login$/u
    );
  }
});

test('the apex path of an app-relative path', () => {
  assert.equal(mountedPath('/forms', '/'), '/forms');
  assert.equal(mountedPath('/forms', '/en'), '/forms/en');
  assert.equal(mountedPath('', '/'), '');
});

test('policy probes default to real responses and never guess', () => {
  assert.deepEqual(
    resolveRuntimeProbes(undefined, {
      expectations: { '/': 200 },
      hasBuildInfo: true,
    }),
    {
      probes: [
        { kind: 'page', path: '/' },
        { kind: 'api', path: '/api/build-info' },
        { kind: 'notFound', path: '/__native-smoke-missing__' },
      ],
      problems: [],
    }
  );
  // A redirecting root and no build-info: nothing to default to.
  const missing = resolveRuntimeProbes(undefined, {
    expectations: { '/': { redirect: '/login' }, '/vi': 307 },
    hasBuildInfo: false,
  });
  assert.equal(missing.problems.length, 2);
  assert.match(missing.problems.join('\n'), /runtimeProbes\.page: declare/);
  assert.match(missing.problems.join('\n'), /runtimeProbes\.api: declare/);
  // Declared paths and explicit skips.
  assert.deepEqual(
    resolveRuntimeProbes(
      { page: '/pricing', api: { skip: 'no anonymous API' }, notFound: '/x' },
      { expectations: {}, hasBuildInfo: false }
    ).probes,
    [
      { kind: 'page', path: '/pricing' },
      { kind: 'api', skip: 'no anonymous API' },
      { kind: 'notFound', path: '/x' },
    ]
  );
  for (const declared of [
    [],
    'x',
    { page: 'pricing' },
    { page: '//evil' },
    { page: { skip: ' ' } },
    { page: { skip: 'x', path: '/' } },
    { other: '/x' },
  ])
    assert.notDeepEqual(
      resolveRuntimeProbes(declared, {
        expectations: { '/': 200 },
        hasBuildInfo: true,
      }).problems,
      [],
      JSON.stringify(declared)
    );
});

test('skipped probes name a real replacement and one probe always runs', () => {
  const context = {
    expectations: { '/': { redirect: '/login' } },
    hasBuildInfo: true,
    fixtureExists: (file) => file === 'cloudflare/signed-ssr.runtime.mjs',
  };
  const skip = (fixture) => ({
    skip: 'auth-only',
    ...(fixture ? { fixture } : {}),
  });
  // A page/404 skip must name an existing cloudflare/*.runtime.mjs fixture.
  assert.match(
    resolveRuntimeProbes({ page: skip() }, context).problems.join('\n'),
    /runtimeProbes\.page: declare .*"fixture": "cloudflare\/<name>\.runtime\.mjs"/
  );
  assert.match(
    resolveRuntimeProbes(
      { page: skip('cloudflare/missing.runtime.mjs') },
      context
    ).problems.join('\n'),
    /runtimeProbes\.page\.fixture: cloudflare\/missing\.runtime\.mjs does not exist/
  );
  for (const fixture of [
    'signed-ssr.runtime.mjs',
    '../x.runtime.mjs',
    'cloudflare/x.mjs',
  ])
    assert.notDeepEqual(
      resolveRuntimeProbes({ page: skip(fixture) }, context).problems,
      [],
      fixture
    );
  const covered = resolveRuntimeProbes(
    { page: skip('cloudflare/signed-ssr.runtime.mjs') },
    context
  );
  assert.deepEqual(covered.problems, []);
  assert.deepEqual(covered.probes[0], {
    kind: 'page',
    skip: 'auth-only',
    fixture: 'cloudflare/signed-ssr.runtime.mjs',
  });
  // The API probe skips with a reason alone (no fixture key).
  assert.notDeepEqual(
    resolveRuntimeProbes(
      {
        page: '/pricing',
        api: skip('cloudflare/signed-ssr.runtime.mjs'),
      },
      context
    ).problems,
    []
  );
  // Every probe skipped: a gate with zero fetches is rejected.
  const allSkipped = resolveRuntimeProbes(
    {
      page: skip('cloudflare/signed-ssr.runtime.mjs'),
      api: { skip: 'no anonymous API' },
      notFound: skip('cloudflare/signed-ssr.runtime.mjs'),
    },
    context
  );
  assert.match(allSkipped.problems.join('\n'), /at least one probe must run/);
});
