import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('bespoke HSTS Worker boundaries', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-vm-modules',
      '--test',
      '--test-concurrency=2',
      'scripts/test-fixtures/hsts-bespoke/boundaries.mjs',
    ],
    { encoding: 'utf8', env }
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /(?:pass 21|# pass 21)/u);
});
