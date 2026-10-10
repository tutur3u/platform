import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  assertBrowserResults,
  assertHostedOwner,
  ownedCleanupOnce,
  PROFILE_TITLE,
  playwrightConfig,
  stopOwnedChildren,
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
    /bun packages\/sdk\/src\/cli\/resources-entry\.ts run -- bun setup/u
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
