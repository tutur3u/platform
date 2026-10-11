import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
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
