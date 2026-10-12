import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  classifyEmployeeStartupFailure,
  generateEmployeeTypes,
  runTypegenCommand,
  schemaSnapshotHash,
} from './employee-schema-typegen.mjs';
import { runIsolatedLifecycle } from './run-supabase-isolated.js';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const generated = Buffer.from(
  'export type Database = {\n  public: {}\n  private: {}\n  storage: {}\n}\n'
);
const sourceSha = 'a'.repeat(40);
const controlSha = 'b'.repeat(40);
const snapshotSha256 = 'c'.repeat(64);
const metadata = {
  headSha: sourceSha,
  projectId: 'tt-source-aaaaaaaa-0123456789',
  disposableRoot: '/owned/disposable',
};
function fixture(t) {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'employee-typegen-test-')
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
const network = {
  id: 'd'.repeat(64),
  name: 'tt-employee-net-123-1',
  labels: Object.fromEntries(
    ['source', 'control', 'run', 'attempt', 'nonce', 'project'].map((key) => [
      `ttr.employee.${key}`,
      key,
    ])
  ),
};
const networkActual = {
  Id: network.id,
  Name: network.name,
  Internal: true,
  Driver: 'bridge',
  Labels: network.labels,
};
function request(t, overrides = {}) {
  const supplied = overrides.runner;
  return {
    binaryPath: '/owned/supabase',
    metadata,
    receiptDirectory: fixture(t),
    sourceSha,
    controlSha,
    snapshotSha256,
    network,
    ...overrides,
    runner: async (command, args, cwd, options) =>
      command === 'docker'
        ? Buffer.from(JSON.stringify([networkActual]))
        : supplied
          ? supplied(command, args, cwd, options)
          : args[0] === '--version'
            ? Buffer.from('2.117.0\n')
            : generated,
  };
}

test('real subprocess stdout is captured while stderr is drained', async () => {
  const result = await runTypegenCommand(
    process.execPath,
    [
      '-e',
      'process.stderr.write("private diagnostic");process.stdout.write("types")',
    ],
    process.cwd()
  );
  assert.equal(result.toString(), 'types');
});
test('nonzero subprocess errors do not disclose its private diagnostics', async () => {
  await assert.rejects(
    runTypegenCommand(
      process.execPath,
      ['-e', 'console.error("private credential");process.exit(1)'],
      process.cwd()
    ),
    { message: 'Bounded employee type generation failed' }
  );
});
test('a real sleeping process is terminated and drained by the whole command deadline', async () => {
  await assert.rejects(
    runTypegenCommand(
      process.execPath,
      ['-e', 'setInterval(()=>{},1000)'],
      process.cwd(),
      { timeoutMs: 50, killGraceMs: 50 }
    ),
    { message: 'Bounded employee type generation failed' }
  );
});
test('oversized subprocess stdout rejects without returning partial bytes', async () => {
  await assert.rejects(
    runTypegenCommand(
      process.execPath,
      ['-e', 'process.stdout.write("x".repeat(10000))'],
      process.cwd(),
      { maxBytes: 64 }
    ),
    { message: 'Bounded employee type generation failed' }
  );
});
test('signal-resistant owned descendants are killed before deadline rejection', async (t) => {
  const directory = fixture(t);
  const pidFile = path.join(directory, 'pid');
  const code = `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile)},String(child.pid));setInterval(()=>{},1000);`;
  await assert.rejects(
    runTypegenCommand(process.execPath, ['-e', code], process.cwd(), {
      timeoutMs: 300,
      killGraceMs: 50,
    })
  );
  const pid = Number(readFileSync(pidFile, 'utf8'));
  // Linux may retain an already dead orphan as a zombie until init reaps it.
  let status = '';
  try {
    status = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], {
      encoding: 'utf8',
    }).trim();
  } catch {
    /* absent */
  }
  assert.ok(
    status === '' || status.startsWith('Z'),
    'owned descendant must not remain running'
  );
});
test('types are generated locally on the same project and written only outside source', async (t) => {
  const calls = [];
  const options = request(t, {
    runner: async (command, args, cwd) => {
      calls.push({ command, args, cwd });
      return args[0] === '--version' ? Buffer.from('2.117.0\n') : generated;
    },
  });
  const receipt = await generateEmployeeTypes(options);
  assert.deepEqual(calls.find((call) => call.args.includes('gen')).args, [
    '--network-id',
    network.name,
    '--workdir',
    '/owned/disposable',
    'gen',
    'types',
    'typescript',
    '--local',
    '--schema',
    'public,private,storage',
    '--query-timeout',
    '30s',
  ]);
  assert.equal(
    calls.find((call) => call.args.includes('gen')).cwd,
    metadata.disposableRoot
  );
  assert.deepEqual(
    readFileSync(path.join(options.receiptDirectory, 'generated-types.ts')),
    generated
  );
  assert.equal(receipt.sha256, hash(generated));
  assert.equal(receipt.sourceSha, sourceSha);
  assert.equal(receipt.controlSha, controlSha);
  assert.equal(receipt.snapshotSha256, snapshotSha256);
  assert.equal(
    receipt.snapshotKind,
    'tracked-source-before-isolated-config-rewrite'
  );
  assert.equal(receipt.consumerQualified, false);
});

for (const [name, bytes] of [
  ['empty', Buffer.from('')],
  ['incomplete', Buffer.from('export type Database = {\n  public: {}\n}')],
  ['diagnostics', Buffer.from('private error')],
  ['invalid utf8', Buffer.from([0xff])],
]) {
  test(`invalid ${name} output creates no valid receipt`, async (t) => {
    await assert.rejects(
      generateEmployeeTypes(
        request(t, {
          runner: async (_command, args) =>
            args[0] === '--version' ? Buffer.from('2.117.0') : bytes,
        })
      ),
      { message: 'Bounded employee type generation failed' }
    );
  });
}

test('unreviewed CLI versions fail before generation', async (t) => {
  let calls = 0;
  await assert.rejects(
    generateEmployeeTypes(
      request(t, {
        runner: async () => {
          calls++;
          return Buffer.from('2.118.0');
        },
      })
    )
  );
  assert.equal(calls, 1);
});
test('source mismatch fails before any CLI command', async (t) => {
  let calls = 0;
  await assert.rejects(
    generateEmployeeTypes(
      request(t, {
        sourceSha: 'd'.repeat(40),
        runner: async () => {
          calls++;
        },
      })
    )
  );
  assert.equal(calls, 0);
});
test('preexisting artifact is never overwritten', async (t) => {
  const options = request(t);
  const target = path.join(options.receiptDirectory, 'generated-types.ts');
  writeFileSync(target, 'foreign beforeimage');
  await assert.rejects(generateEmployeeTypes(options));
  assert.equal(readFileSync(target, 'utf8'), 'foreign beforeimage');
});

test('symlink receipt directory is rejected before generation', async (t) => {
  const directory = fixture(t);
  const target = path.join(directory, 'target');
  const link = path.join(directory, 'link');
  mkdirSync(target);
  symlinkSync(target, link);
  await assert.rejects(
    generateEmployeeTypes(request(t, { receiptDirectory: link }))
  );
});

test('schema source fingerprint includes every tracked path and exact bytes, independent of listing order', (t) => {
  const directory = fixture(t);
  const relative = 'apps/database/supabase/migrations/one.sql';
  mkdirSync(path.dirname(path.join(directory, relative)), { recursive: true });
  writeFileSync(path.join(directory, relative), 'original schema');
  const first = schemaSnapshotHash(directory, [relative]);
  assert.equal(
    first,
    hash(JSON.stringify([[relative, hash('original schema')]]))
  );
  writeFileSync(path.join(directory, relative), 'changed schema');
  assert.notEqual(schemaSnapshotHash(directory, [relative]), first);
  assert.throws(() => schemaSnapshotHash(directory, ['../foreign']));
});

test('real lifecycle orchestration runs tests then types then cleanup on the same database', async () => {
  const phases = [];
  const result = await runIsolatedLifecycle({
    binaryPath: '/owned/supabase',
    metadata: { ...metadata, typegenOutput: 'packages/types/src/supabase.ts' },
    runner: async (_command, args) => {
      phases.push(
        args.includes('start')
          ? 'start'
          : args.includes('reset')
            ? 'reset'
            : args.includes('test')
              ? 'test'
              : 'stop'
      );
      return { code: 0 };
    },
    typegen: async ({ metadata: actual }) => {
      assert.equal(actual.projectId, metadata.projectId);
      phases.push('types');
    },
    registerSignals: () => () => {},
    updateMetadata: async () => {},
    removeRoot: async () => {},
    stderr: { write() {} },
  });
  assert.equal(result, 0);
  assert.deepEqual(phases, ['start', 'reset', 'test', 'types', 'stop']);
});

test('generation failure still executes exact cleanup and returns failure', async () => {
  const phases = [];
  const result = await runIsolatedLifecycle({
    binaryPath: '/owned/supabase',
    metadata: { ...metadata, typegenOutput: 'packages/types/src/supabase.ts' },
    runner: async (_command, args) => {
      phases.push(args.at(2));
      return { code: 0 };
    },
    typegen: async () => {
      phases.push('failed-types');
      throw new Error('fixed failure');
    },
    registerSignals: () => () => {},
    updateMetadata: async () => {},
    removeRoot: async () => {},
    stderr: { write() {} },
  });
  assert.equal(result, 1);
  assert.deepEqual(phases, ['start', 'db', 'test', 'failed-types', 'stop']);
});

test('unknown internal network denies before any CLI generation', async (t) => {
  let cliCalls = 0;
  await assert.rejects(
    generateEmployeeTypes(
      request(t, {
        network: undefined,
        runner: async () => {
          cliCalls++;
          return generated;
        },
      })
    )
  );
  assert.equal(cliCalls, 0);
});

for (const [category, stderr] of [
  [
    'image-operation-signature',
    'failed to pull docker image: private registry token',
  ],
  [
    'container-create-signature',
    'failed to create docker container: private name',
  ],
  [
    'container-start-signature',
    'failed to start docker container "private": opaque',
  ],
  [
    'database-connect-signature',
    'failed to connect to postgres: postgresql://user:secret@example.test/private',
  ],
  [
    'database-health-signature',
    'supabase_db_private container is not ready: unhealthy',
  ],
  ['container-job-signature', 'error running container: exit 1; private SQL'],
])
  test(`startup ${category} produces a literal safe category`, () => {
    assert.deepEqual(classifyEmployeeStartupFailure({ stderr }), {
      diagnosticKind: 'startup-stderr-signature-v1',
      category,
      capturedBytes: Buffer.byteLength(stderr),
    });
  });
test('startup diagnostics unknown, ambiguous and oversized remain honest and redacted', () => {
  for (const [stderr, category] of [
    ['private opaque SQL/token https://example.test/secret', 'unknown'],
    [
      'failed to connect to postgres: private\nfailed to pull docker image: other private',
      'ambiguous',
    ],
    [`failed to connect to postgres: ${'SECRET'.repeat(12000)}`, 'truncated'],
  ]) {
    const diagnostic = classifyEmployeeStartupFailure({ stderr });
    assert.equal(diagnostic.category, category);
    assert.deepEqual(Object.keys(diagnostic), [
      'diagnosticKind',
      'category',
      'capturedBytes',
    ]);
    assert.ok(diagnostic.capturedBytes <= 65537);
    const output = JSON.stringify(diagnostic);
    for (const value of ['private', 'SECRET', 'https://', 'SQL/token'])
      assert.equal(output.includes(value), false);
  }
});
test('startup missing diagnostic and buffer-overflow do not invent a matched cause', () => {
  assert.deepEqual(classifyEmployeeStartupFailure({}), {
    diagnosticKind: 'startup-stderr-signature-v1',
    category: 'unavailable',
    capturedBytes: 0,
  });
  assert.equal(
    classifyEmployeeStartupFailure({
      stderr: 'failed to connect to postgres: private',
      error: { code: 'ENOBUFS' },
    }).category,
    'truncated'
  );
});
