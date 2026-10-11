import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { safeFixtureFailure } from './mail-profile-runtime.mjs';
import {
  observeFixtureFailure,
  privateStartupDiagnostics,
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
