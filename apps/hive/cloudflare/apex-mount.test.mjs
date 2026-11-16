import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(
  new URL('./apex-mount.check.ts', import.meta.url)
);

test('hive apex mount contract', () => {
  const result = spawnSync('bun', [checker], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /executed 4/);
});
