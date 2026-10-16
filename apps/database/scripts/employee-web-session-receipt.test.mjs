import './employee-web-session-build-diagnostic.test.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertQualifiedWebSession,
  projectStartupDiagnostic,
  selectWebSessionRuntime,
  sessionCases,
  webSessionReceipt,
} from './employee-web-session-receipt.mjs';

const sourceSha = 'a'.repeat(40);
const complete = {
  qualified: true,
  phase: 'complete',
  sourceSha,
  cases: [...sessionCases],
  assertions: 100,
  serverStopped: true,
  productionProof: false,
  routeAuthorizationProof: true,
};
test('session gate is opt-in and requires real HTTP full-schema admission', () => {
  assert.equal(selectWebSessionRuntime(undefined, false), false);
  assert.equal(selectWebSessionRuntime('false', true), false);
  assert.equal(selectWebSessionRuntime('true', true), true);
  for (const value of ['true', true, '', '1'])
    assert.throws(() => selectWebSessionRuntime(value, false));
});
test('exact ordered boundary inventory, source, cleanup and child exit all gate acceptance', () => {
  const receipt = webSessionReceipt(JSON.stringify(complete));
  assert.doesNotThrow(() =>
    assertQualifiedWebSession(receipt, 0, sourceSha, true)
  );
  for (const candidate of [
    { ...complete, qualified: false, routeAuthorizationProof: false },
    { ...complete, phase: 'build' },
    { ...complete, serverStopped: false },
    { ...complete, cases: sessionCases.slice(1) },
    { ...complete, cases: [...sessionCases].reverse() },
    { ...complete, assertions: 0 },
  ])
    assert.throws(() =>
      assertQualifiedWebSession(
        webSessionReceipt(JSON.stringify(candidate)),
        0,
        sourceSha,
        true
      )
    );
  for (const status of [1, null, undefined, '0'])
    assert.throws(() =>
      assertQualifiedWebSession(receipt, status, sourceSha, true)
    );
  assert.throws(() =>
    assertQualifiedWebSession(receipt, 0, 'b'.repeat(40), true)
  );
  for (const stopped of [false, undefined, 'true'])
    assert.throws(() =>
      assertQualifiedWebSession(receipt, 0, sourceSha, stopped)
    );
});
test('malformed, secret-bearing diagnostics are bounded and projected to fixed fields', () => {
  for (const candidate of [
    null,
    [],
    {},
    { ...complete, phase: 'sensitive error' },
    { ...complete, assertions: 501 },
    { ...complete, sourceSha: 'main' },
    { ...complete, productionProof: true },
    { ...complete, routeAuthorizationProof: false },
    { ...complete, cases: ['private identity'] },
    { ...complete, cases: ['create', 'create'] },
  ])
    assert.throws(() => webSessionReceipt(JSON.stringify(candidate)));
  assert.deepEqual(
    webSessionReceipt(JSON.stringify({ ...complete, secret: 'not retained' })),
    complete
  );
  assert.throws(() => webSessionReceipt('x'.repeat(8193)), {
    message: 'Web session receipt invalid',
  });
  assert.throws(() => webSessionReceipt('private-invalid-json'), {
    message: 'Web session receipt invalid',
  });
});
test('failed runtime receipt retains observed boundary progress without claiming Web proof', () => {
  const failed = {
    ...complete,
    qualified: false,
    phase: 'cases',
    cases: sessionCases.slice(0, 3),
    routeAuthorizationProof: false,
  };
  assert.deepEqual(webSessionReceipt(JSON.stringify(failed)), failed);
  assert.throws(() => assertQualifiedWebSession(failed, 1, sourceSha));
});
test('workflow keeps optional runtime inside owned schema lifecycle and exact source checkout', () => {
  const workflow = readFileSync(
    new URL(
      '../../../.github/workflows/employee-schema-contract.yaml',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(
    workflow,
    /EMPLOYEE_SCHEMA_INCLUDE_WEB_SESSION: \$\{\{ inputs.include_web_session \}\}/
  );
  assert.match(workflow, /include_web_session:[\s\S]*?default: false/);
  const runner = readFileSync(
    new URL('./verify-employee-schema-contract.mjs', import.meta.url),
    'utf8'
  );
  assert.match(
    runner,
    /assertQualifiedWebSession\(\s*webSessionQualification,\s*sessionOutput.status,\s*sourceSha,\s*sessionOutput.processGroupStopped\s*\)/
  );
  assert.match(
    runner,
    /webSessionRuntime\s*&&\s*lifecycleCode === 0\s*&&\s*cleanupSucceeded/
  );
});

test('first failure and independent cleanup outcomes survive strict redacted projection', () => {
  const failed = {
    ...complete,
    qualified: false,
    routeAuthorizationProof: false,
    phase: 'build',
    cases: [],
    assertions: 3,
    serverStopped: false,
    failure: {
      phase: 'build',
      kind: 'process',
      exitCode: 1,
      signal: null,
      timedOut: false,
    },
    cleanup: { server: 'failed', proxy: 'closed' },
  };
  assert.deepEqual(
    webSessionReceipt(
      JSON.stringify({
        ...failed,
        failure: { ...failed.failure, message: 'secret' },
        cleanup: { ...failed.cleanup, stack: 'secret' },
      })
    ),
    failed
  );
  assert.throws(() => assertQualifiedWebSession(failed, 0, sourceSha, true));
  for (const failure of [
    { ...failed.failure, phase: 'cleanup' },
    { ...failed.failure, kind: 'private body' },
    { ...failed.failure, exitCode: 256 },
    { ...failed.failure, signal: 'private token' },
    { ...failed.failure, timedOut: 'false' },
    null,
  ])
    assert.throws(() =>
      webSessionReceipt(JSON.stringify({ ...failed, failure }))
    );
  assert.throws(() =>
    webSessionReceipt(JSON.stringify({ ...failed, serverStopped: true }))
  );
  assert.throws(() =>
    webSessionReceipt(
      JSON.stringify({
        ...complete,
        failure: failed.failure,
        cleanup: failed.cleanup,
      })
    )
  );
  assert.deepEqual(
    webSessionReceipt(
      JSON.stringify({
        ...complete,
        failure: null,
        cleanup: { server: 'stopped', proxy: 'closed' },
      })
    ),
    {
      ...complete,
      failure: null,
      cleanup: { server: 'stopped', proxy: 'closed' },
    }
  );
});

test('build compiler and cleanup error diagnostics are projected and fail closed', () => {
  const failure = {
    phase: 'build',
    kind: 'process',
    exitCode: 1,
    signal: null,
    timedOut: false,
    buildDiagnostic: {
      diagnostics: [{ category: 'type-error', code: 'TS2322', path: null }],
      truncated: false,
    },
  };
  const cleanup = {
    server: 'stopped',
    proxy: 'failed',
    serverError: null,
    proxyError: 'type-error',
  };
  const value = {
    ...complete,
    qualified: false,
    routeAuthorizationProof: false,
    phase: 'build',
    cases: [],
    assertions: 3,
    serverStopped: false,
    failure,
    cleanup,
  };
  assert.deepEqual(webSessionReceipt(JSON.stringify(value)), value);
  for (const candidate of [
    {
      ...value,
      failure: {
        ...failure,
        buildDiagnostic: {
          diagnostics: [{ category: 'private', code: null, path: null }],
          truncated: false,
        },
      },
    },
    { ...value, cleanup: { ...cleanup, proxyError: null } },
    { ...value, cleanup: { ...cleanup, proxyError: 'raw-private-message' } },
  ])
    assert.throws(() => webSessionReceipt(JSON.stringify(candidate)));
});

const startup = {
  outcome: 'deadline',
  lastResult: 'unexpected-status',
  status: 503,
  attempts: 60,
  exitCode: null,
  signal: null,
  timedOut: true,
};
test('startup receipt projects bounded enums and numbers without private payloads', () => {
  const privateFields = Object.fromEntries(
    [
      'body',
      'headers',
      'cookie',
      'token',
      'env',
      'url',
      'stdout',
      'stderr',
      'stack',
      'message',
    ].map((key) => [key, 'injected-private-value'])
  );
  const failure = {
    phase: 'start',
    kind: 'assertion',
    exitCode: null,
    signal: null,
    timedOut: false,
  };
  const value = {
    ...complete,
    qualified: false,
    routeAuthorizationProof: false,
    phase: 'start',
    cases: [],
    assertions: 3,
    failure,
    cleanup: { server: 'stopped', proxy: 'closed' },
    startupDiagnostic: { ...startup, ...privateFields },
  };
  const receipt = webSessionReceipt(JSON.stringify(value));
  assert.deepEqual(receipt.startupDiagnostic, startup);
  assert.deepEqual(receipt.failure, failure);
  assert.ok(!JSON.stringify(receipt).includes('injected-private'));
  assert.ok(Buffer.byteLength(JSON.stringify(receipt.startupDiagnostic)) < 256);
  for (const bad of [
    { outcome: 'private-secret' },
    { lastResult: 'private-secret' },
    { status: -1 },
    { status: 600 },
    { status: '503' },
    { attempts: 61 },
    { attempts: -1 },
    { attempts: 1.5 },
    { exitCode: 256 },
    { signal: 'private-secret' },
    { timedOut: false },
    { outcome: 'ready' },
    { outcome: 'child-exit', timedOut: false },
    { lastResult: 'none' },
    { status: 401 },
  ]) {
    assert.throws(
      () =>
        webSessionReceipt(
          JSON.stringify({
            ...value,
            startupDiagnostic: { ...startup, ...bad },
          })
        ),
      { message: 'Web session receipt invalid' }
    );
  }
  assert.throws(
    () =>
      webSessionReceipt(
        JSON.stringify({ ...complete, startupDiagnostic: startup })
      ),
    { message: 'Web session receipt invalid' }
  );
  assert.throws(
    () =>
      webSessionReceipt(
        JSON.stringify({
          ...value,
          phase: 'build',
          failure: { ...failure, phase: 'build' },
        })
      ),
    { message: 'Web session receipt invalid' }
  );
  assert.deepEqual(projectStartupDiagnostic({ ...startup, status: 0 }), {
    ...startup,
    status: 0,
  });
  assert.deepEqual(projectStartupDiagnostic({ ...startup, status: 599 }), {
    ...startup,
    status: 599,
  });
  assert.deepEqual(
    projectStartupDiagnostic({
      ...startup,
      outcome: 'child-exit',
      exitCode: 7,
      timedOut: false,
    }),
    { ...startup, outcome: 'child-exit', exitCode: 7, timedOut: false }
  );
});
