import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertQualifiedProfileRoute,
  createProfileRouteProgress,
  parseProfileRouteReceipt,
  profileRouteCases,
  selectProfileRouteRuntime,
} from './employee-profile-route-receipt.mjs';

const sourceSha = 'a'.repeat(40);
function receipt() {
  return {
    version: 1,
    qualified: true,
    sourceSha,
    phase: 'complete',
    currentCase: null,
    assertions: 100,
    cases: [...profileRouteCases],
    serverStopped: true,
    failure: null,
    cleanup: {
      server: 'stopped',
      proxy: 'closed',
      serverError: null,
      proxyError: null,
    },
    startup: { attempts: 1, status: 401, ready: true },
    startupOutput: { categories: [], truncated: false },
    routeAuthorizationProof: true,
    productionProof: false,
  };
}
const parse = (value) => parseProfileRouteReceipt(JSON.stringify(value));
test('route selection defaults off and requires journal HTTP and managed, without requiring Web session', () => {
  assert.equal(selectProfileRouteRuntime(undefined, {}), false);
  assert.equal(selectProfileRouteRuntime('false', {}), false);
  const selected = {
    JOURNAL: 'true',
    HTTP: 'true',
    MANAGED_PROFILE: 'true',
    WEB_SESSION: 'false',
  };
  assert.equal(selectProfileRouteRuntime('true', selected), true);
  for (const key of ['JOURNAL', 'HTTP', 'MANAGED_PROFILE'])
    assert.throws(() =>
      selectProfileRouteRuntime('true', { ...selected, [key]: 'false' })
    );
  for (const key of [
    'PERSONAL_JOURNAL',
    'CHAT_INITIAL_SETTINGS',
    'STRUCTURED_PROVENANCE',
  ])
    assert.throws(() =>
      selectProfileRouteRuntime('true', { ...selected, [key]: 'true' })
    );
  for (const value of ['', 'TRUE', true, 1])
    assert.throws(() => selectProfileRouteRuntime(value, selected));
});
test('complete synthetic receipt validates shape but cannot establish execution or production', () => {
  const value = parse(receipt());
  assert.equal(value.productionProof, false);
  assert.equal(value.routeAuthorizationProof, true);
  assert.doesNotThrow(() =>
    assertQualifiedProfileRoute(value, 0, sourceSha, true)
  );
  for (const args of [
    [1, sourceSha, true],
    [0, 'b'.repeat(40), true],
    [0, sourceSha, false],
  ])
    assert.throws(() => assertQualifiedProfileRoute(value, ...args));
});
test('missing cases, stale source, production claims and cleanup failures cannot qualify', () => {
  const mutations = [
    (v) => {
      v.version = 2;
    },
    (v) => {
      v.sourceSha = '0'.repeat(40);
    },
    (v) => {
      v.phase = 'cases';
    },
    (v) => {
      v.currentCase = 'managed/totp';
    },
    (v) => {
      v.cases.pop();
    },
    (v) => {
      v.cases.reverse();
    },
    (v) => {
      v.cases[1] = v.cases[0];
    },
    (v) => {
      v.cases[0] = 'direct-PATCH-mock';
    },
    (v) => {
      v.assertions = 0;
    },
    (v) => {
      v.productionProof = true;
    },
    (v) => {
      v.routeAuthorizationProof = false;
    },
    (v) => {
      v.serverStopped = false;
    },
    (v) => {
      v.cleanup.server = 'failed';
    },
    (v) => {
      v.cleanup.proxyError = 'unknown';
    },
    (v) => {
      v.cleanup = null;
    },
    (v) => {
      v.startup.status = 405;
    },
    (v) => {
      v.startup.ready = false;
    },
    (v) => {
      v.startup.attempts = 61;
    },
    (v) => {
      v.startupOutput.categories = ['raw-secret'];
    },
  ];
  for (const mutate of mutations) {
    const value = receipt();
    mutate(value);
    assert.throws(() => parse(value));
  }
  for (const text of ['', '{}', 'null', JSON.stringify(receipt()).repeat(100)])
    assert.throws(() => parseProfileRouteReceipt(text));
});
test('failed cases project fixed diagnostics and cannot be promoted', () => {
  const value = receipt();
  Object.assign(value, {
    qualified: false,
    phase: 'cases',
    currentCase: 'managed/anonymous',
    cases: [],
    routeAuthorizationProof: false,
    failure: {
      phase: 'cases',
      kind: 'assertion',
      exitCode: null,
      signal: null,
      timedOut: false,
      message: 'private',
    },
    token: 'private',
  });
  const parsed = parse(value);
  assert.equal(parsed.qualified, false);
  assert.equal(JSON.stringify(parsed).includes('private'), false);
  assert.throws(() => assertQualifiedProfileRoute(parsed, 0, sourceSha, true));
});

test('checkpoint progress survives a later real assertion failure without completing that case', () => {
  const progress = createProfileRouteProgress();
  const checkpoint = (event) => progress.checkpoint(event);
  assert.throws(() => {
    checkpoint({ kind: 'start', name: profileRouteCases[0] });
    assert.equal(401, 401);
    checkpoint({ kind: 'assertion' });
    checkpoint({ kind: 'complete', name: profileRouteCases[0] });
    checkpoint({ kind: 'start', name: profileRouteCases[1] });
    assert.equal(200, 401);
    checkpoint({ kind: 'assertion' });
    checkpoint({ kind: 'complete', name: profileRouteCases[1] });
  }, assert.AssertionError);
  assert.deepEqual(progress.snapshot(), {
    currentCase: profileRouteCases[1],
    assertions: 1,
    cases: [profileRouteCases[0]],
  });
  const failed = {
    ...receipt(),
    ...progress.snapshot(),
    qualified: false,
    phase: 'cases',
    routeAuthorizationProof: false,
    failure: {
      phase: 'cases',
      kind: 'assertion',
      exitCode: null,
      signal: null,
      timedOut: false,
    },
  };
  const parsed = parse(failed);
  assert.deepEqual(parsed.cases, [profileRouteCases[0]]);
  assert.equal(parsed.assertions, 1);
  assert.equal(parsed.currentCase, profileRouteCases[1]);
  assert.throws(() => assertQualifiedProfileRoute(parsed, 0, sourceSha, true));
  for (const patch of [
    { currentCase: profileRouteCases[0] },
    { currentCase: profileRouteCases[2] },
    { assertions: 0 },
    { phase: 'build', failure: { ...failed.failure, phase: 'build' } },
    { qualified: true, routeAuthorizationProof: true },
  ])
    assert.throws(() => parse({ ...failed, ...patch }));
});
test('progress bounds and completion fences reject fabricated completion without changing observed progress', () => {
  const progress = createProfileRouteProgress();
  const first = profileRouteCases[0];
  assert.throws(() => progress.checkpoint({ kind: 'complete', name: first }));
  assert.throws(() =>
    progress.checkpoint({ kind: 'start', name: profileRouteCases[1] })
  );
  progress.checkpoint({ kind: 'start', name: first });
  assert.throws(() => progress.checkpoint({ kind: 'complete', name: first }));
  assert.deepEqual(progress.snapshot(), {
    currentCase: first,
    assertions: 0,
    cases: [],
  });
  for (let index = 0; index < 500; index++)
    progress.checkpoint({ kind: 'assertion' });
  assert.throws(() => progress.checkpoint({ kind: 'assertion' }));
  progress.checkpoint({ kind: 'complete', name: first });
  const external = progress.snapshot();
  external.cases.push(profileRouteCases[1]);
  assert.deepEqual(progress.snapshot(), {
    currentCase: null,
    assertions: 500,
    cases: [first],
  });
});
