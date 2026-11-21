import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('Deepgram SDK imports, dependencies, hosts and environment keys stay absent', () => {
  const result = spawnSync(
    'git',
    [
      'grep',
      '-ilE',
      '@deepgram/|@ai-sdk/deepgram|DEEPGRAM_(API_KEY|ENV)|deepgram\\.com',
      '--',
      '.',
      ':(exclude)plans/291-remove-phantom-ai-runtime-dependencies.md',
      ':(exclude)scripts/no-deepgram.test.mjs',
    ],
    { cwd: root, encoding: 'utf8' }
  );

  // git grep uses status 1 for no matches, distinct from execution failure.
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stderr || result.stdout);
});
