import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  assertBrowserResults,
  assertHostedOwner,
  ownedCleanupOnce,
  PROFILE_TITLE,
  playwrightConfig,
  profilePreflight,
  safeFixtureFailure,
  stopOwnedChildren,
  storageProxyFailure,
  TRANSPORT_TITLE,
} from './mail-profile-runtime.mjs';

const hosted = {
  GITHUB_ACTIONS: 'true',
  RUNNER_ENVIRONMENT: 'github-hosted',
  GITHUB_RUN_ID: '123',
  GITHUB_SHA: 'a'.repeat(40),
};
const results = (status = 'passed') => ({
  errors: [],
  suites: [
    {
      specs: [PROFILE_TITLE, TRANSPORT_TITLE].map((title) => ({
        title,
        tests: [
          {
            expectedStatus: 'passed',
            results: [{ status }],
          },
        ],
      })),
    },
  ],
});

test('foreign machines and provider credentials cannot start a fixture', () => {
  assert.doesNotThrow(() => assertHostedOwner(hosted));
  for (const patch of [
    { RUNNER_ENVIRONMENT: 'self-hosted' },
    { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    { CLOUDFLARE_API_TOKEN: 'credential' },
    { SUPABASE_ACCESS_TOKEN: 'credential' },
    { GITHUB_SHA: 'unknown' },
  ]) {
    assert.throws(() => assertHostedOwner({ ...hosted, ...patch }));
  }
});

test('real results require both named contracts without skip, retry or empty PASS', () => {
  assert.doesNotThrow(() => assertBrowserResults(results()));
  for (const status of ['skipped', 'failed', 'timedOut', 'interrupted'])
    assert.throws(() => assertBrowserResults(results(status)));
  assert.throws(() => assertBrowserResults({ suites: [] }));
  const retry = results();
  retry.suites[0].specs[0].tests[0].results.push({ status: 'passed' });
  assert.throws(() => assertBrowserResults(retry));
  const setupFailure = results();
  setupFailure.errors.push({ message: 'afterAll failed' });
  assert.throws(() => assertBrowserResults(setupFailure));
});

test('private config preserves sandbox and certificate verification without unrelated setup', () => {
  const source = playwrightConfig(
    '/owned/e2e',
    '/owned/reports',
    '/owned/playwright'
  );
  assert.match(source, /chromiumSandbox:true/u);
  assert.match(source, /ignoreHTTPSErrors:false/u);
  assert.match(source, /workers:1,retries:0/u);
  assert.doesNotMatch(source, /globalSetup|no-sandbox|trace:'on/u);
  assert.match(source, /lettin-wiki\.noauth\.spec\.ts/u);
  assert.match(source, /lettin-session-transport\.noauth\.spec\.ts/u);
});

test('cleanup continues after an owned stop failure and reports it as failure', async () => {
  const stopped = [];
  await assert.rejects(
    stopOwnedChildren([1, 2, 3], async (child) => {
      stopped.push(child);
      if (child === 2) throw new Error('owned stop failed');
    }),
    AggregateError
  );
  assert.deepEqual(stopped, [3, 2, 1]);
});

test('shared browser context retains normal certificate verification', () => {
  const helper = fs.readFileSync(
    new URL('../../apps/web/e2e/helpers/lettin-session.ts', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(helper, /ignoreHTTPSErrors\s*:\s*true/u);
  assert.match(helper, /browser\.newContext\(\)/u);
});

test('a failed cleanup preserves its first failure without repeating stop operations', async () => {
  const calls = [];
  const failure = new Error('first owned failure');
  const cleanup = ownedCleanupOnce(async () => {
    calls.push('stop');
    throw failure;
  });
  assert.equal(cleanup.attempted, false);
  await assert.rejects(cleanup.run(), (error) => error === failure);
  assert.equal(cleanup.attempted, true);
  await assert.rejects(cleanup.run(), (error) => error === failure);
  assert.deepEqual(calls, ['stop']);
});
test('fresh hosted setup queues through the lightweight resources entry before SDK exports exist', () => {
  const workflow = fs.readFileSync(
    new URL(
      '../../.github/workflows/mail-profile-runtime-contract.yaml',
      import.meta.url
    ),
    'utf8'
  );
  assert.equal(
    workflow.split('bun packages/sdk/src/cli/resources-entry.ts status --json')
      .length - 1,
    2
  );
  assert.match(
    workflow,
    /bun packages\/sdk\/src\/cli\/resources-entry\.ts run -- node scripts\/ci\/mail-profile-runtime-setup\.mjs/u
  );
  assert.match(
    workflow,
    /bun packages\/sdk\/src\/cli\/resources-entry\.ts run -- node scripts\/ci\/mail-profile-runtime\.mjs "\$PROFILE_EXPECTED_HEAD"/u
  );
  assert.doesNotMatch(workflow, /bun ttr resources/u);
  const entry = fs.readFileSync(
    new URL('../../packages/sdk/src/cli/resources-entry.ts', import.meta.url),
    'utf8'
  );
  assert.match(entry, /from '\.\/resources'/u);
  assert.doesNotMatch(entry, /from '\.\/commands'|from '\.\.\/platform'/u);
});

test('preflight failure records only its stage once and preserves strict rejection', async () => {
  for (const failedStage of [
    'hosted-owner',
    'expected-head',
    'source-status',
    'foreign-containers',
    'port-availability',
    'source-index',
  ]) {
    const records = [];
    const failure = new Error('sensitive diagnostic must not be recorded');
    const env =
      failedStage === 'hosted-owner'
        ? { ...hosted, CLOUDFLARE_API_TOKEN: 'secret' }
        : hosted;
    let calls = 0;
    const run = async (tool, args) => {
      calls++;
      if (args[0] === 'rev-parse') return 'a'.repeat(40);
      if (args[0] === 'status')
        return failedStage === 'source-status' ? ' M private-file' : '';
      if (tool === 'docker')
        return failedStage === 'foreign-containers' ? 'private-container' : '';
      if (failedStage === 'source-index') throw failure;
      return 'private-index';
    };
    await assert.rejects(
      profilePreflight({
        env,
        expectedHead:
          failedStage === 'expected-head' ? 'b'.repeat(40) : 'a'.repeat(40),
        run,
        checkPort: async () => {
          if (failedStage === 'port-availability') throw failure;
        },
        record: async (record) => records.push(record),
      })
    );
    assert.deepEqual(records, [
      {
        phase: 'preflight',
        stage: failedStage,
        outcome: 'FAIL',
        fixtureStarted: false,
        deploymentProof: false,
        productionProof: false,
      },
    ]);
    assert.doesNotMatch(JSON.stringify(records), /secret|sensitive|private/u);
    if (failedStage === 'hosted-owner') assert.equal(calls, 0);
  }
});

test('receipt write failure retains the primary preflight failure without retry', async () => {
  const primary = new Error('guard failure');
  const receipt = new Error('write failure');
  let attempts = 0;
  await assert.rejects(
    profilePreflight({
      env: hosted,
      expectedHead: 'a'.repeat(40),
      run: async () => {
        throw primary;
      },
      checkPort: async () => {},
      record: async () => {
        attempts++;
        throw receipt;
      },
    }),
    (error) =>
      error instanceof AggregateError &&
      error.errors[0] === primary &&
      error.errors[1] === receipt
  );
  assert.equal(attempts, 1);
});

test('storage proxy failure preserves headers and ends only unsent responses', () => {
  for (const headersSent of [false, true]) {
    const calls = [];
    const response = {
      headersSent,
      writeHead(status) {
        assert.equal(
          headersSent,
          false,
          'cannot write forwarded headers twice'
        );
        calls.push(['writeHead', status]);
      },
      end() {
        calls.push(['end']);
      },
      destroy() {
        calls.push(['destroy']);
      },
    };
    storageProxyFailure(response);
    assert.deepEqual(
      calls,
      headersSent ? [['destroy']] : [['writeHead', 502], ['end']]
    );
  }
});

test('fixture diagnostics classify expected failures without leaking errors', () => {
  assert.equal(
    safeFixtureFailure(new Error('Owned command failed (1)')),
    'owned-command-exit'
  );
  assert.equal(
    safeFixtureFailure(new Error('Owned command exceeded its deadline')),
    'owned-command-deadline'
  );
  assert.equal(
    safeFixtureFailure(new Error('token=private-value response=private-body')),
    'unclassified-fixture-failure'
  );
  assert.equal(
    safeFixtureFailure({
      message: 'Owned cleanup failed',
      secret: 'private-value',
    }),
    'unclassified-fixture-failure'
  );
  assert.equal(
    safeFixtureFailure(new Error('Owned cleanup failed')),
    'owned-cleanup-failed'
  );
});
