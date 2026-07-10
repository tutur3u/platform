const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const actionPath = path.join(__dirname, 'action.yml');
const actionSource = fs.readFileSync(actionPath, 'utf8');

function readRunScript() {
  const marker = '      run: |\n';
  const markerIndex = actionSource.indexOf(marker);

  assert.notEqual(markerIndex, -1, 'expected composite action run block');

  return actionSource
    .slice(markerIndex + marker.length)
    .split('\n')
    .map((line) => (line.startsWith('        ') ? line.slice(8) : line))
    .join('\n');
}

function runAction(env) {
  return spawnSync('bash', ['-s'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TURBO_CACHE_INPUT_API: '',
      TURBO_CACHE_INPUT_SIGNATURE_KEY: '',
      TURBO_CACHE_INPUT_TEAM: '',
      TURBO_CACHE_INPUT_TOKEN: '',
      ...env,
    },
    input: readRunScript(),
  });
}

test('runs locally and clears inherited remote-cache credentials without a token', () => {
  const result = runAction({
    TURBO_API: 'https://inherited.invalid',
    TURBO_CACHE_COMMAND: `test -z "\${TURBO_TOKEN:-}" && test -z "\${TURBO_TEAM:-}" && test -z "\${TURBO_API:-}" && test -z "\${TURBO_REMOTE_CACHE_SIGNATURE_KEY:-}"`,
    TURBO_CACHE_INPUT_TEAM: 'public-team-slug',
    TURBO_REMOTE_CACHE_SIGNATURE_KEY: 'inherited-signature',
    TURBO_TEAM: 'inherited-team',
    TURBO_TOKEN: 'inherited-token',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Turbo remote cache disabled/u);
});

test('rejects a token without a team before running the command', () => {
  const result = runAction({
    TURBO_CACHE_COMMAND: 'echo should-not-run',
    TURBO_CACHE_INPUT_TOKEN: 'test-token',
  });

  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /should-not-run/u);
  assert.match(result.stdout, /A team is required/u);
});

test('passes optional API and signature values only to the wrapped command', () => {
  const result = runAction({
    TURBO_CACHE_COMMAND:
      'test "$TURBO_TOKEN" = test-token && test "$TURBO_TEAM" = test-team && test "$TURBO_API" = https://cache.test && test "$TURBO_REMOTE_CACHE_SIGNATURE_KEY" = test-signature',
    TURBO_CACHE_INPUT_API: 'https://cache.test',
    TURBO_CACHE_INPUT_SIGNATURE_KEY: 'test-signature',
    TURBO_CACHE_INPUT_TEAM: 'test-team',
    TURBO_CACHE_INPUT_TOKEN: 'test-token',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Turbo remote cache enabled/u);
});

test('keeps credentials step-scoped instead of writing GitHub environment state', () => {
  const githubEnvironmentFile = ['GITHUB', 'ENV'].join('_');

  assert.equal(actionSource.includes(githubEnvironmentFile), false);
  assert.doesNotMatch(actionSource, />>/u);
  assert.match(
    actionSource,
    /TURBO_CACHE_INPUT_TOKEN: \$\{\{ inputs\.token \}\}/u
  );
});
