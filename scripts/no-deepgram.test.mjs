import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('Deepgram SDK imports, dependencies, hosts and environment keys stay absent', () => {
  const result = spawnSync(
    'git',
    [
      'grep',
      '-nE',
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
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  const matches =
    result.status === 1 ? [] : result.stdout.split('\n').filter(Boolean);
  // The sync denylist is the control that refuses to copy the retired key.
  // It is not an SDK, a host, or a live environment value.
  const denialRecords = new Set([
    'apps/docs/build/devops/shared-secret-write.mdx',
    'scripts/ci/web-cf-env-sync.mjs',
    'scripts/ci/web-cf-env-sync.test.mjs',
  ]);
  for (const match of matches) {
    const file = match.split(':')[0];
    assert.ok(denialRecords.has(file), match);
    assert.match(match, /DEEPGRAM_API_KEY/);
    assert.doesNotMatch(match, /@deepgram\/|@ai-sdk\/deepgram|deepgram\.com/);
  }
  assert.ok(
    matches.some((match) =>
      match.startsWith('scripts/ci/web-cf-env-sync.mjs:')
    ),
    'the Worker sync denylist must keep refusing DEEPGRAM_API_KEY'
  );
});
