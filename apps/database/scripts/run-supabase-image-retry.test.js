import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCommand } from './run-supabase.js';
import {
  appendDiagnostic,
  isImagePullCommand,
  isTransientImagePullFailure,
  retryImagePull,
} from './run-supabase-image-retry.js';
import {
  generateTypesFromDisposableStack,
  runBufferedCommand,
} from './run-supabase-isolated-typegen.js';

const quiet = { write() {} };
const failure = {
  code: 1,
  signal: null,
  stderr:
    'failed to pull docker image from all registries: ghcr.io/supabase/postgres: toomanyrequests',
};

test('classifies registry throttling and transport errors, rejects real failures', () => {
  for (const text of [
    failure.stderr,
    'Error response from daemon: toomanyrequests',
    'failed to pull docker image: TLS handshake timeout',
    'error pulling image: unexpected EOF',
  ])
    assert.equal(isTransientImagePullFailure(text), true, text);
  for (const text of [
    'migration failed',
    'not ok 1 - denied',
    'failed to pull docker image: manifest unknown',
    'failed to pull docker image: unauthorized',
    'failed to pull docker image: no matching manifest',
    'toomanyrequests\nSQLSTATE 23505',
    'failed to pull docker image: invalid reference format',
  ])
    assert.equal(isTransientImagePullFailure(text), false, text);
});

test('only startup and type generation are replayable', () => {
  for (const args of [
    ['start'],
    ['--workdir', '/tmp/stack', 'start', '--exclude', 'studio'],
    ['gen', 'types', 'typescript', '--local'],
  ])
    assert.equal(isImagePullCommand(args), true);
  for (const args of [
    ['db', 'reset'],
    ['test', 'db'],
    ['db', 'push'],
    ['stop'],
    ['--workdir', 'start', 'test', 'db'],
  ])
    assert.equal(isImagePullCommand(args), false);
});

test('exhaustion returns final failure after seven attempts with bounded exponential jitter', async () => {
  for (const [random, expected] of [
    [0, [10000, 20000, 40000, 80000, 120000, 120000]],
    [1, [12500, 25000, 50000, 100000, 150000, 150000]],
  ]) {
    let calls = 0;
    const waits = [];
    const result = await retryImagePull(
      async () => {
        calls++;
        return failure;
      },
      {
        random: () => random,
        sleepMs: async (ms) => waits.push(ms),
        stderr: quiet,
      }
    );
    assert.equal(result, failure);
    assert.equal(calls, 7);
    assert.deepEqual(waits, expected);
  }
});

test('stops on success, non-transient failure, signal, disabled retries or spawn error', async () => {
  for (const result of [
    { code: 0 },
    { code: 2, stderr: 'migration failed' },
    { ...failure, signal: 'SIGTERM' },
  ]) {
    let calls = 0;
    assert.equal(
      await retryImagePull(async () => {
        calls++;
        return result;
      }),
      result
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  await retryImagePull(
    async () => {
      calls++;
      return failure;
    },
    { enabled: false }
  );
  assert.equal(calls, 1);
  await assert.rejects(
    retryImagePull(async () => {
      throw new Error('ENOENT');
    }),
    /ENOENT/
  );
});

test('successful typegen retry publishes only final stdout once', async () => {
  let calls = 0;
  const writes = [];
  await generateTypesFromDisposableStack({
    binaryPath: 'supabase',
    metadata: {
      disposableRoot: '/tmp/stack',
      repositoryRoot: '/repo',
      typegenOutput: 'packages/types/src/supabase.ts',
    },
    runner: async () =>
      ++calls === 1
        ? { ...failure, stdout: 'partial output' }
        : { code: 0, stdout: 'export type Database = {};' },
    writer: async (...args) => writes.push(args),
    retryOptions: { sleepMs: async () => {}, stderr: quiet },
  });
  assert.equal(calls, 2);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][2].toString(), 'export type Database = {};');
});

test('failed typegen never writes output and preserves exit code', async () => {
  await assert.rejects(
    generateTypesFromDisposableStack({
      binaryPath: 'supabase',
      metadata: { disposableRoot: '/tmp/stack' },
      runner: async () => ({
        code: 7,
        stderr: 'schema error',
        stdout: 'partial',
      }),
      writer: async () => assert.fail('must not publish failed output'),
    }),
    (error) => error.exitCode === 7
  );
});

test('real buffered child separates diagnostics and types, retains only bounded tail', async () => {
  const result = await runBufferedCommand(
    process.execPath,
    [
      '-e',
      "process.stderr.write('toomanyrequests'); process.stdout.write('types'); process.exitCode = 9",
    ],
    process.cwd()
  );
  assert.equal(result.code, 9);
  assert.equal(result.stdout.toString(), 'types');
  assert.equal(result.stderr, 'toomanyrequests');
  assert.equal(appendDiagnostic('x'.repeat(100000), 'last').length, 65536);
  assert.ok(appendDiagnostic('x'.repeat(100000), 'last').endsWith('last'));
});

test('real startup runner retries stderr while SQL tests retain their original exit', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'supabase-retry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const script = path.join(root, 'fake-supabase.cjs');
  await writeFile(
    script,
    `#!/usr/bin/env node
const fs = require('node:fs');
const countFile = require('node:path').join(__dirname, 'count');
const count = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile)) : 0;
fs.writeFileSync(countFile, String(count + 1));
if (count === 0 || process.argv[2] === 'test') {
  process.stderr.write('failed to pull docker image: toomanyrequests');
  process.exitCode = 7;
}
`,
    { mode: 0o755 }
  );
  const waits = [];
  const options = {
    stdio: 'ignore',
    retryOptions: {
      random: () => 0,
      sleepMs: async (ms) => waits.push(ms),
      stderr: quiet,
    },
  };
  assert.deepEqual(await runCommand(script, ['start'], root, options), {
    code: 0,
    signal: null,
  });
  assert.deepEqual(waits, [10000]);
  waits.length = 0;
  assert.deepEqual(await runCommand(script, ['test', 'db'], root, options), {
    code: 7,
    signal: null,
  });
  assert.deepEqual(waits, []);
});
