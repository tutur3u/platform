import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const app = fileURLToPath(new URL('..', import.meta.url));

// Bundles each entry the way it ships, keeping only the app's own modules, and
// checks the fixture qualifier reaches the staging bundle alone.
function bundle(entry) {
  const result = spawnSync(
    'bun',
    [
      'build',
      entry,
      '--target=browser',
      '--format=esm',
      '--external',
      'cloudflare:*',
      '--external',
      'node:*',
      '--external',
      '@tuturuuu/*',
      '--external',
      'zod',
    ],
    { cwd: app, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return result.stdout;
}

test('the production bundle carries no qualifier class or route', () => {
  const production = bundle('src/worker.ts');
  assert.match(production, /class PlaygroundSlot\b/u);
  assert.doesNotMatch(production, /PlaygroundQualifier|\/qualify\b/u);
  const staging = bundle('src/staging-worker.ts');
  assert.match(staging, /class PlaygroundQualifier\b/u);
});
