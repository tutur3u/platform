import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const workflow = resolve(
  '.github/workflows/playground-runtime-acceptance.yaml'
);
const steps = JSON.parse(
  execFileSync(
    'bun',
    [
      '-e',
      "process.stdout.write(JSON.stringify(Bun.YAML.parse(require('node:fs').readFileSync(process.argv[1],'utf8')).jobs.acceptance.steps))",
      workflow,
    ],
    { encoding: 'utf8' }
  )
);

const cleanup = steps.at(-1).run;
const acceptance = steps.find(
  (step) => step.name === 'Execute actual SDK sandbox and checkpoint acceptance'
).run;

function execute(mode) {
  const root = mkdtempSync(join(tmpdir(), 'playground-cleanup-contract-'));
  try {
    const calls = join(root, 'calls.jsonl');
    writeFileSync(
      join(root, 'docker'),
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_CALLS, JSON.stringify(args) + '\\n');
const mode = process.env.FAKE_MODE;
if (args[0] === 'ps') {
  if (mode === 'inventory-error') process.exit(1);
  const first = !fs.existsSync(process.env.FAKE_STATE);
  fs.writeFileSync(process.env.FAKE_STATE, 'seen');
  if (first && mode !== 'wrong-owner') console.log('aaaaaaaaaaaa\\nbbbbbbbbbbbb');
  process.exit(0);
}
if (args[0] === 'container' && args[1] === 'inspect') process.exit(0);
if (args[0] === 'inspect') {
  console.log(mode === 'wrong-owner' ? 'different-pool' : process.env.TUTURUUU_PLAYGROUND_POOL_ID);
  process.exit(0);
}
if (args[0] === 'rm' && args.at(-1) === 'aaaaaaaaaaaa' && mode === 'remove-error') process.exit(1);
`,
      { mode: 0o700 }
    );
    const result = spawnSync('bash', ['-c', cleanup], {
      encoding: 'utf8',
      env: {
        PATH: `${root}:${process.env.PATH}`,
        GITHUB_RUN_ID: '123',
        GITHUB_RUN_ATTEMPT: '1',
        TUTURUUU_PLAYGROUND_POOL_ID: 'ci-123-1',
        FAKE_CALLS: calls,
        FAKE_STATE: join(root, 'state'),
        FAKE_MODE: mode,
      },
    });
    assert.equal(result.error, undefined);
    return {
      status: result.status,
      calls: readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    };
  } finally {
    rmSync(root, { recursive: true });
  }
}

test('successful cleanup removes only its two owned sandboxes and registry volume', () => {
  const result = execute('success');
  assert.equal(result.status, 0);
  assert.deepEqual(
    result.calls.filter((call) => call[0] === 'rm'),
    [
      ['rm', '--force', '--volumes', 'aaaaaaaaaaaa'],
      ['rm', '--force', '--volumes', 'bbbbbbbbbbbb'],
      ['rm', '--force', '--volumes', 'ttr-acceptance-registry-123-1'],
    ]
  );
  for (const call of result.calls.filter((call) => call[0] === 'ps')) {
    assert.match(call.at(-1), /^label=ttr\.(pool|acceptance)=ci-123-1$/);
  }
});
test('a sandbox removal failure still attempts every other resource and fails the gate', () => {
  const result = execute('remove-error');
  assert.equal(result.status, 1);
  assert.equal(result.calls.filter((call) => call[0] === 'rm').length, 3);
});
test('an inventory error still attempts owned registry cleanup and fails closed', () => {
  const result = execute('inventory-error');
  assert.equal(result.status, 1);
  assert.deepEqual(
    result.calls.filter((call) => call[0] === 'rm'),
    [['rm', '--force', '--volumes', 'ttr-acceptance-registry-123-1']]
  );
});
test('a same-name registry owned by another pool is preserved and reported as a failure', () => {
  const result = execute('wrong-owner');
  assert.equal(result.status, 1);
  assert.equal(result.calls.filter((call) => call[0] === 'rm').length, 0);
});

test('the real acceptance starts with only the installed Bun executable on PATH', () => {
  const root = mkdtempSync(join(tmpdir(), 'playground-bun-path-'));
  try {
    const calls = join(root, 'calls');
    writeFileSync(
      join(root, 'bun'),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$FAKE_CALLS"\n',
      { mode: 0o700 }
    );
    const result = spawnSync('/bin/bash', ['-c', acceptance], {
      encoding: 'utf8',
      env: { PATH: root, FAKE_CALLS: calls },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n'), [
      'x',
      '--no-install',
      'vitest',
      'run',
      '--config',
      'vitest.playground-acceptance.config.ts',
    ]);
  } finally {
    rmSync(root, { recursive: true });
  }
});
