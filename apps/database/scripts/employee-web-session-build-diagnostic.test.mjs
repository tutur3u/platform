import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  buildOutputCapture,
  projectBuildDiagnostic,
  projectDartTestDiagnostic,
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

const dartEvent = (type, fields = {}) =>
  `${JSON.stringify({ type, ...fields })}\n`;
function dartCapture(events, chunkSize = 17) {
  const capture = buildOutputCapture(paths, { dartTestOutput: true });
  const bytes = Buffer.from(events);
  for (let i = 0; i < bytes.length; i += chunkSize)
    capture.append('stdout', bytes.subarray(i, i + chunkSize));
  return capture.receipt();
}
const suite = dartEvent('suite', {
  suite: { id: 0, path: 'private-secret.dart' },
});
const start = (id = 1, name = 'workspace') =>
  dartEvent('testStart', {
    test: { id, name, suiteID: 0, url: 'private-secret.dart' },
  });
const end = (id = 1, result = 'failure') =>
  dartEvent('testDone', { testID: id, result, skipped: false });
const error = (isFailure = true, text = 'private-secret') =>
  dartEvent('error', {
    testID: 1,
    isFailure,
    error: text,
    stackTrace: 'private-secret-stack',
  });
const done = dartEvent('done', { success: false });
test('Dart event capture binds late errors to known cases and redacts all uncontrolled text', () => {
  const output = dartCapture(
    suite +
      error() +
      end() +
      start() +
      dartEvent('print', { message: 'private-secret-print' }) +
      done
  );
  assert.equal(JSON.stringify(output).includes('private-secret'), false);
  const summary = projectDartTestDiagnostic(output.dartTest);
  assert.ok(summary.flags.includes('reorderedEvent'));
  assert.equal(summary.errors[0].case, 'workspace');
  assert.equal(summary.errors[0].kind, 'assertion');
  assert.equal(summary.errors[0].sha256, digest('private-secret'));
  assert.equal(summary.cases[0].results.failure, 1);
  assert.equal(summary.doneSuccess, false);
  assert.equal(JSON.stringify(output).includes('private-secret'), false);
  assert.equal(output.processOutput.streams[0].totalBytes > 0, true);
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) <= 8192);
  const normal = buildOutputCapture(paths);
  normal.append('stdout', start());
  assert.equal(Object.hasOwn(normal.receipt(), 'dartTest'), false);
});
test('Dart classifications require observed error evidence and never infer a phase from ordering', () => {
  for (const [failure, text, expected] of [
    [false, 'private-secret', 'non-assertion'],
    [
      false,
      'tool/private.dart:1:2: Error: private-secret',
      'compiler-diagnostic',
    ],
    [false, 'Failed to load "private-secret": details', 'load-diagnostic'],
    [true, 'Failed to load "private-secret": details', 'assertion'],
  ]) {
    const value = dartCapture(
      error(failure, text) +
        suite +
        start(1, 'loading private-secret') +
        end() +
        done
    ).dartTest;
    assert.equal(value.errors[0].kind, expected);
    assert.equal(value.errors[0].case, 'unknown');
    assert.ok(value.flags.includes('unknownTest'));
    assert.equal(JSON.stringify(value).includes('private-secret'), false);
  }
});
test('Dart event boundaries retain interleaving, incomplete and malformed truth', () => {
  const value = dartCapture(
    suite +
      start(1) +
      start(2, 'personal') +
      end(2, 'success') +
      error(false) +
      end(1, 'error') +
      done,
    1
  ).dartTest;
  assert.deepEqual(value.flags, ['interleaved']);
  assert.equal(value.cases[1].results.success, 1);
  assert.equal(value.errors[0].case, 'workspace');
  assert.ok(
    dartCapture(
      suite + start() + end() + done + error()
    ).dartTest.flags.includes('lateEvent')
  );
  for (const [events, flag] of [
    [suite + start(), 'incomplete'],
    [`private-secret\n${suite}${start()}`, 'malformed'],
    [dartEvent('private-secret', { raw: 'private-secret' }), 'unknownEvent'],
    [dartEvent('error', { testID: 'private-secret' }), 'malformed'],
    [suite + end() + done, 'incomplete'],
  ]) {
    const summary = dartCapture(events).dartTest;
    assert.ok(summary.flags.includes(flag));
    assert.equal(JSON.stringify(summary).includes('private-secret'), false);
  }
});
test('Dart bounded inventories and stream tails explicitly retain diagnostic incompleteness', () => {
  for (const [events, flag] of [
    [dartEvent('print').repeat(257), 'eventOverflow'],
    [Array.from({ length: 33 }, (_, id) => start(id)).join(''), 'testOverflow'],
    [
      Array.from({ length: 5 }, (_, id) =>
        dartEvent('suite', { suite: { id } })
      ).join(''),
      'suiteOverflow',
    ],
    [suite + start() + error().repeat(5) + end() + done, 'errorOverflow'],
    [
      dartEvent('print', { message: 'private-secret'.repeat(10000) }) +
        suite +
        start() +
        end() +
        done,
      'tailTruncated',
    ],
  ]) {
    const value = dartCapture(events, 1024).dartTest;
    assert.ok(value.flags.includes(flag), flag);
    assert.ok(value.events <= 256);
    assert.ok(value.errors.length <= 4);
    assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 8192);
    assert.equal(JSON.stringify(value).includes('private-secret'), false);
  }
});
test('Dart summary projection rejects arbitrary fields, names, errors and oversized data', () => {
  const good = dartCapture(suite + start() + error() + end() + done).dartTest;
  for (const value of [
    { ...good, raw: 'private-secret' },
    { ...good, flags: ['private-secret'] },
    {
      ...good,
      cases: good.cases.map((entry) => ({ ...entry, name: 'private-secret' })),
    },
    { ...good, errors: [{ ...good.errors[0], message: 'private-secret' }] },
    { ...good, errors: Array(5).fill(good.errors[0]) },
    { ...good, raw: 'x'.repeat(9000) },
  ])
    assert.throws(() => projectDartTestDiagnostic(value));
});
