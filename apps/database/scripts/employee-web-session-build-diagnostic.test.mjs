import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  buildOutputCapture,
  projectBuildDiagnostic,
  projectProcessOutput,
} from './employee-web-session-build-diagnostic.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const paths = new Set(['apps/web/src/public.ts', 'apps/web/next.config.ts']);
test('compiler diagnostics retain only allowlisted categories codes and tracked paths', () => {
  const capture = buildOutputCapture(paths);
  capture.append(
    'stderr',
    Buffer.from(
      '\x1b[31m./src/public.ts:12:4\x1b[0m\nType error: error TS2322: private-identity\n'
    )
  );
  const value = capture.receipt();
  assert.deepEqual(projectBuildDiagnostic(value, paths), {
    diagnostics: [
      {
        category: 'type-error',
        code: 'TS2322',
        path: 'apps/web/src/public.ts',
      },
    ],
    truncated: false,
  });
  assert.deepEqual(
    projectBuildDiagnostic(
      {
        ...value,
        raw: 'secret',
        diagnostics: value.diagnostics.map((entry) => ({
          ...entry,
          message: 'secret',
        })),
      },
      paths
    ),
    projectBuildDiagnostic(value, paths)
  );
});
test('all injected config keys, env secrets, credentials and token forms are discarded', () => {
  const secrets = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVER_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'TUTURUUU_APP_COORDINATION_SECRET',
    'NEXT_PUBLIC_APP_URL',
    'EMPLOYEE_CREATION_RUNTIME_ENABLED',
    'EMPLOYEE_RESTORATION_RUNTIME_ENABLED',
    'url',
    'key',
    'anonKey',
    'projectId',
    'basePort',
    'sourceSha',
    'GITHUB_TOKEN=ghp_private123',
    'Bearer private-bearer',
    'eyJhbGciOiJIUzI1NiJ9.private.signature',
    'sb_secret_private',
    'tuturuuu_app_session=private-cookie',
    'private@example.test',
    'https://private.example.test/?token=private',
    'private-password',
    'PRIVATE_ENV_SECRET',
  ];
  const capture = buildOutputCapture(paths);
  for (const secret of secrets)
    capture.append(
      'stderr',
      `Module not found: ${secret}\n./src/${secret}.ts:1:1\nType error: ${secret}\n`
    );
  const serialized = JSON.stringify(capture.receipt());
  for (const secret of secrets)
    assert.equal(serialized.includes(secret), false);
  assert.deepEqual(
    JSON.parse(serialized).diagnostics.every((entry) => entry.path === null),
    true
  );
});
test('stream tails, split chunks and diagnostic count remain bounded under output flood', () => {
  const capture = buildOutputCapture(paths);
  capture.append('stdout', Buffer.alloc(2000000, 65));
  capture.append('stderr', Buffer.from('private-secret\nModule not '));
  capture.append(
    'stderr',
    Buffer.from('found: ERR_MODULE_NOT_FOUND private\n')
  );
  const value = capture.receipt();
  assert.equal(value.truncated, true);
  assert.equal(value.diagnostics[0].category, 'module-resolution');
  assert.equal(value.diagnostics.length <= 8, true);
  assert.equal(JSON.stringify(value).length < 2048, true);
  assert.equal(JSON.stringify(value).includes('private'), false);
});
test('strict diagnostic projection rejects arbitrary categories codes paths and oversized inventories', () => {
  for (const entry of [
    { category: 'private', code: null, path: null },
    { category: 'type-error', code: 'TS9999-private', path: null },
    { category: 'type-error', code: null, path: 'apps/web/src/private.ts' },
  ])
    assert.throws(() =>
      projectBuildDiagnostic({ diagnostics: [entry], truncated: false }, paths)
    );
  assert.throws(() =>
    projectBuildDiagnostic(
      {
        diagnostics: Array(9).fill({
          category: 'type-error',
          code: null,
          path: null,
        }),
        truncated: false,
      },
      paths
    )
  );
});

test('unrecognized location boundaries and unrelated lines cannot inherit earlier source attribution', () => {
  for (const header of [
    './node_modules/example/index.js:3:1',
    '/private/absolute.ts:3:1',
    './src/untracked.ts:3:1',
    'unrelated output',
    '',
  ]) {
    const capture = buildOutputCapture(paths);
    capture.append(
      'stderr',
      `./src/public.ts:12:4\nType error: error TS2322\n${header}\nModule not found: ERR_MODULE_NOT_FOUND\n`
    );
    const value = capture.receipt();
    assert.equal(value.diagnostics[0].path, 'apps/web/src/public.ts');
    assert.equal(value.diagnostics[1].path, null);
    assert.equal(JSON.stringify(value).includes('node_modules'), false);
    assert.equal(JSON.stringify(value).includes('absolute'), false);
  }
});
test('diagnostic inventory overflow is explicit even without stream-byte truncation', () => {
  const capture = buildOutputCapture(paths);
  for (const code of [
    'TS2307',
    'TS2322',
    'TS2339',
    'TS2345',
    'TS2554',
    'TS2769',
    'TS7006',
    'TS18046',
    'ENOENT',
  ])
    capture.append('stderr', `Type error: error ${code}\n`);
  const value = capture.receipt();
  assert.equal(value.diagnostics.length, 8);
  assert.equal(value.truncated, true);
});

test('process summary hashes chunked output without private text', () => {
  const capture = buildOutputCapture(paths);
  const stdout = Buffer.from('synthetic private stdout');
  const stderr = Buffer.from('thread panicked at private-path token=secret');
  capture.append('stdout', stdout);
  capture.append('stderr', stderr.subarray(0, 12));
  capture.append('stderr', stderr.subarray(12));
  const output = projectProcessOutput(capture.receipt().processOutput);
  assert.deepEqual(output.indicators, ['native-panic']);
  for (const [index, bytes] of [stdout, stderr].entries()) {
    assert.equal(output.streams[index].totalBytes, bytes.length);
    assert.equal(output.streams[index].tailBytes, bytes.length);
    assert.equal(output.streams[index].totalSha256, digest(bytes));
    assert.equal(output.streams[index].tailSha256, digest(bytes));
  }
  assert.equal(output.truncated, false);
  for (const secret of ['private', 'token', 'secret', 'stdout token'])
    assert.equal(JSON.stringify(output).includes(secret), false);
});

test('process output tails are bounded with explicit unknown evidence', () => {
  const capture = buildOutputCapture(paths);
  const bytes = Buffer.alloc(100000, 65);
  capture.append('stderr', bytes);
  const output = projectProcessOutput(capture.receipt().processOutput);
  assert.deepEqual(output.indicators, ['unknown']);
  assert.equal(output.streams[1].totalBytes, bytes.length);
  assert.equal(output.streams[1].tailBytes, 65536);
  assert.equal(output.streams[1].totalSha256, digest(bytes));
  assert.equal(output.streams[1].tailSha256, digest(bytes.subarray(-65536)));
  assert.equal(output.truncated, true);
  assert.equal(JSON.stringify(output).length < 1024, true);
});

test('process summary indicators are fixed and reject malformed projection', () => {
  const capture = buildOutputCapture(paths);
  capture.append(
    'stderr',
    'Assertion failed private\nENOMEM\nFatal error: secret'
  );
  const value = capture.receipt().processOutput;
  assert.deepEqual(value.indicators, [
    'native-assertion',
    'out-of-memory',
    'runtime-fatal',
  ]);
  assert.deepEqual(projectProcessOutput(value), value);
  for (const invalid of [
    { ...value, raw: 'secret' },
    { ...value, indicators: ['secret'] },
    { ...value, truncated: true },
    { ...value, streams: [] },
    {
      ...value,
      streams: value.streams.map((entry) => ({ ...entry, tailBytes: 70000 })),
    },
  ])
    assert.throws(() => projectProcessOutput(invalid));
});
