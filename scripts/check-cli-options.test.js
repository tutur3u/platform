const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readdirSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { assertKnownCheckArgs } = require('./check-cli-options.js');

test('aggregate accepts only its documented execution flags', () => {
  assert.doesNotThrow(() => assertKnownCheckArgs([]));
  assert.doesNotThrow(() =>
    assertKnownCheckArgs([
      '--table',
      '--timing',
      '--details',
      '--run-all',
      '--force-now',
    ])
  );
});

for (const flag of [
  '--help',
  '--dry-run',
  '--dry',
  '--version',
  '--unknown',
  'unexpected',
]) {
  test(`aggregate rejects ${flag} before starting work or creating a queue`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'validate-cli-'));
    try {
      const result = spawnSync(
        process.execPath,
        [join(__dirname, 'check.js'), flag],
        {
          env: {
            ...process.env,
            TMPDIR: directory,
            TMP: directory,
            TEMP: directory,
          },
          encoding: 'utf8',
          timeout: 5000,
        }
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Unknown bun validate argument:/);
      assert.ok(result.stderr.includes(flag));
      assert.equal(result.stdout, '');
      assert.deepEqual(readdirSync(directory), []);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('tracked agent permissions do not auto-allow the aggregate or native checking', () => {
  const settings = JSON.parse(
    readFileSync(join(__dirname, '../.claude/settings.local.json'), 'utf8')
  );
  for (const rule of [
    'Bash(bun check:*)',
    'Bash(bun validate:*)',
    'Bash(bun:*)',
    'Bash(node scripts/check.js:*)',
  ]) {
    assert.equal(settings.permissions.allow.includes(rule), false, rule);
  }
});
