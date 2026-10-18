import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { safeFixtureFailure } from './mail-profile-runtime.mjs';
import {
  observeFixtureFailure,
  privateStartupDiagnostics,
  readStageObservations,
  startupCategories,
} from './mail-profile-startup-diagnostics.mjs';

test('startup log diagnostics contain only allowlisted categories', () => {
  assert.deepEqual(
    startupCategories('token=private-value MODULE_NOT_FOUND /secret/path'),
    ['missing-module']
  );
  assert.deepEqual(startupCategories('Error: private-value'), []);
  assert.deepEqual(startupCategories('EDQUOT EADDRINUSE'), [
    'storage-quota',
    'address-in-use',
  ]);
});

test('private collection is bounded and rejects symlink log sources', async () => {
  const reports = await fs.mkdtemp(
    path.join(os.tmpdir(), 'startup-diagnostics-test-')
  );
  try {
    await fs.writeFile(
      path.join(reports, 'web-private.log'),
      `${'x'.repeat(150000)} MODULE_NOT_FOUND token=private-value`,
      { mode: 0o600 }
    );
    await fs.symlink(
      'web-private.log',
      path.join(reports, 'lettin-private.log')
    );
    const records = await privateStartupDiagnostics(reports, [
      { profileApp: 'web', exitCode: 1, signalCode: null },
    ]);
    assert.equal(records[0].postCleanupExitCode, 1);
    assert.equal(records[0].inspectedBytes, 128 * 1024);
    assert.equal(records[0].truncated, true);
    assert.deepEqual(records[0].categories, ['missing-module']);
    assert.equal(records[0].causeProven, false);
    assert.equal(records[1].logRead, 'private-read-failed');
    assert.equal(records[1].readStages, undefined);
    assert.equal(JSON.stringify(records).includes('private-value'), false);
  } finally {
    await fs.rm(reports, { recursive: true });
  }
});

test('inner safe startup reason survives lifecycle assertion wrapping', async () => {
  let reason;
  const inner = new Error('Owned web app exited before readiness');
  const runner = observeFixtureFailure(
    async () => {
      throw inner;
    },
    safeFixtureFailure,
    (value) => {
      reason ??= value;
    }
  );
  await assert.rejects(runner(), (error) => error === inner);
  let wrapper;
  try {
    assert.equal(1, 0, 'Full fixture or scoped Supabase stop failed');
  } catch (error) {
    wrapper = error;
  }
  assert.equal(safeFixtureFailure(wrapper), 'unclassified-fixture-failure');
  reason ??= safeFixtureFailure(wrapper);
  assert.equal(reason, 'web-app-before-readiness');
});

test('failure observation passes successful values without recording a failure', async () => {
  const records = [];
  const runner = observeFixtureFailure(
    async (...args) => args,
    safeFixtureFailure,
    (value) => records.push(value)
  );
  assert.deepEqual(await runner('owned', 2), ['owned', 2]);
  assert.deepEqual(records, []);
});

test('failure observation exposes only fixed classification and preserves rejection identity', async () => {
  const records = [];
  const inner = new Error(
    'token=private-value /secret/path arbitrary startup text'
  );
  const runner = observeFixtureFailure(
    async () => {
      throw inner;
    },
    safeFixtureFailure,
    (value) => records.push(value)
  );
  await assert.rejects(runner(), (error) => error === inner);
  assert.deepEqual(records, ['unclassified-fixture-failure']);
  assert.equal(JSON.stringify(records).includes('private-value'), false);
  assert.equal(JSON.stringify(records).includes('/secret/path'), false);
});

// Synthetic known-family inputs exercise safe enums, not the actual hosted cause.
const additionalFamilies = [
  ['unsupported-cli-option', "error: unknown option '--private-option'"],
  ['next-config-load', 'Failed to load next.config.ts'],
  ['module-export-contract', 'ERR_PACKAGE_PATH_NOT_EXPORTED'],
  ['node-option-rejected', '--private-option is not allowed in NODE_OPTIONS'],
  ['runtime-syntax', 'SyntaxError: unexpected private-value'],
];
for (const [category, message] of additionalFamilies) {
  test(`additional startup family ${category} reveals no private text`, () => {
    const input = `${message} token=private-value /secret/path https://private.invalid/?credential=private-value`;
    const output = startupCategories(input);
    assert.deepEqual(output, [category]);
    assert.equal(JSON.stringify(output).includes('private-value'), false);
    assert.equal(JSON.stringify(output).includes('/secret/path'), false);
    assert.equal(JSON.stringify(output).includes('private.invalid'), false);
    assert.deepEqual(startupCategories(input + input), [category]);
  });
}

test('new private startup families remain bounded enums with cause unproved', async () => {
  const reports = await fs.mkdtemp(
    path.join(os.tmpdir(), 'startup-families-test-')
  );
  try {
    await fs.writeFile(
      path.join(reports, 'web-private.log'),
      additionalFamilies.map(([, message]) => message).join('\n') +
        '\ntoken=private-value /secret/path https://private.invalid/credential',
      { mode: 0o600 }
    );
    const records = await privateStartupDiagnostics(reports, [
      { profileApp: 'web', exitCode: 1, signalCode: null },
    ]);
    assert.deepEqual(
      records[0].categories,
      additionalFamilies.map(([name]) => name)
    );
    assert.equal(records[0].causeProven, false);
    assert.equal(records[0].logRead, 'bounded-private-tail');
    assert.equal(records[0].truncated, false);
    assert.equal(records[0].inspectedBytes, records[0].logBytes);
    const output = JSON.stringify(records);
    for (const privateText of [
      'private-value',
      '/secret/path',
      'private.invalid',
      'unknown option',
    ])
      assert.equal(output.includes(privateText), false);
    assert.deepEqual(
      startupCategories(
        'token=private-value /secret/path unknown private cause'
      ),
      []
    );
  } finally {
    await fs.rm(reports, { recursive: true });
  }
});

test('read stages retain fixed observations without private log text', () => {
  const output = readStageObservations(
    [
      '[lettin-read] profile actor started',
      '[lettin-read] profile actor completed { elapsedMs: 2 }',
      '[lettin-read] layout workspace failed { elapsedMs: 3 }',
      '[lettin-read] private token started',
      '[lettin-read] profile actor failed token=private-value /secret/path',
      'private-value https://private.invalid/secret',
    ].join('\n')
  );
  assert.equal(output.events, 3);
  assert.equal(output.truncated, false);
  assert.equal(output.requestAttribution, 'unavailable');
  assert.deepEqual(output.stages, [
    {
      stage: 'profile actor',
      started: 1,
      completed: 1,
      failed: 0,
      lastStatus: 'completed',
    },
    {
      stage: 'layout workspace',
      started: 0,
      completed: 0,
      failed: 1,
      lastStatus: 'failed',
    },
  ]);
  for (const secret of ['private-value', '/secret/path', 'private.invalid']) {
    assert.equal(JSON.stringify(output).includes(secret), false);
  }
});

test('read counts cap events and retain incomplete evidence', () => {
  const overflow = readStageObservations(
    Array(257).fill('[lettin-read] profile worlds started').join('\n')
  );
  assert.equal(overflow.events, 256);
  assert.equal(overflow.stages[0].started, 256);
  assert.equal(overflow.eventsTruncated, true);
  assert.equal(overflow.truncated, true);
  const tail = readStageObservations(
    [
      '[lettin-read] profile actor started',
      '[lettin-read] layout session started',
      '[lettin-read] layout session started',
      '[lettin-read] layout session completed { elapsedMs: 1 }',
    ].join('\n'),
    true
  );
  assert.equal(tail.tailTruncated, true);
  assert.equal(tail.events, 3);
  assert.equal(tail.stages.length, 1);
  assert.equal(tail.stages[0].started, 2);
  assert.equal(tail.stages[0].completed, 1);
  assert.equal(tail.requestAttribution, 'unavailable');
  const clipped = readStageObservations(
    `${'x'.repeat(150000)}\n[lettin-read] profile actor started`
  );
  assert.equal(clipped.tailTruncated, true);
  assert.equal(clipped.events, 1);
  assert.deepEqual(readStageObservations('unrelated secret').stages, []);
});

test('owned Lettin log projects only safe stage counts', async () => {
  const reports = await fs.mkdtemp(path.join(os.tmpdir(), 'read-stages-test-'));
  try {
    await fs.writeFile(
      path.join(reports, 'lettin-private.log'),
      [
        '[lettin-read] profile bindings started',
        '[lettin-read] profile bindings failed { elapsedMs: 1 }',
        'Error: token=private-value /secret/path',
      ].join('\n'),
      { mode: 0o600 }
    );
    const records = await privateStartupDiagnostics(reports, [
      { profileApp: 'lettin', exitCode: 0, signalCode: null },
    ]);
    assert.equal(records[1].logRead, 'bounded-private-tail');
    assert.equal(records[1].readStages.events, 2);
    assert.equal(records[1].readStages.stages[0].lastStatus, 'failed');
    assert.equal(records[1].readStages.truncated, false);
    assert.equal(records[1].causeProven, false);
    assert.equal(JSON.stringify(records).includes('private-value'), false);
    assert.equal(JSON.stringify(records).includes('/secret/path'), false);
  } finally {
    await fs.rm(reports, { recursive: true });
  }
});
