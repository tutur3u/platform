import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertDisposableRoot,
  chooseAvailablePortBlock,
  cleanupInterruptedProject,
  deriveIsolatedIdentity,
  derivePortBlock,
  hasProjectCollision,
  PORT_FIELDS,
  parseArguments,
  readLifecycleMetadata,
  removeDisposableRoot,
  rewriteSupabaseConfig,
  runIsolatedLifecycle,
  stageDisposableProject,
  validateFocusedTestPath,
} from '../apps/database/scripts/run-supabase-isolated.js';

const CONFIG = `project_id = "tuturuuu"

[api]
port = 8001

[db]
port = 8002
shadow_port = 8000

[db.pooler]
port = 8009

[studio]
port = 8003

[inbucket]
port = 8004
# smtp_port = 8005

[edge_runtime]
inspector_port = 8083

[analytics]
port = 8007
`;
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

async function temporaryDirectory(t, prefix = 'isolated-supabase-test-') {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  return directory;
}

function digest(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function fakeMetadata(disposableRoot, overrides = {}) {
  return {
    basePort: 20000,
    createdAt: '2026-08-10T00:00:00.000Z',
    disposableRoot,
    headSha: 'a'.repeat(40),
    projectId: 'tt-test-aaaaaaaaaa-bbbbbbbbbb',
    repositoryRoot: '/repo',
    status: 'staged',
    testPath: 'supabase/tests/focused.sql',
    version: 1,
    ...overrides,
  };
}

function lifecycleHarness(results, { signalAfterCall = null } = {}) {
  const commands = [];
  let signalCallback = null;
  let call = 0;
  return {
    commands,
    registerSignals(callback) {
      signalCallback = callback;
      return () => {};
    },
    async runner(command, args, cwd) {
      commands.push({ args, command, cwd });
      call += 1;
      if (call === signalAfterCall) signalCallback?.('SIGINT');
      return { code: results.shift() ?? 0, signal: null };
    },
  };
}

test('identity separates worktrees at the same SHA and stays Docker-safe', () => {
  const first = deriveIsolatedIdentity({
    headSha: 'a'.repeat(40),
    repositoryPath: '/repo/.worktrees/feature-one',
  });
  const second = deriveIsolatedIdentity({
    headSha: 'a'.repeat(40),
    repositoryPath: '/repo/.worktrees/feature-two',
  });

  assert.notEqual(first.projectId, second.projectId);
  assert.match(first.projectId, /^[a-z0-9-]+$/);
  assert.ok(first.projectId.length <= 40);
});

test('identity separates exact bases and reruns deterministically', () => {
  const input = { headSha: 'a'.repeat(40), repositoryPath: '/repo/worktree' };
  assert.deepEqual(
    deriveIsolatedIdentity(input),
    deriveIsolatedIdentity(input)
  );
  assert.notEqual(
    deriveIsolatedIdentity(input).projectId,
    deriveIsolatedIdentity({ ...input, headSha: 'b'.repeat(40) }).projectId
  );
});

test('config rewrite changes the project and every active port exactly once', () => {
  const rewritten = rewriteSupabaseConfig(CONFIG, {
    basePort: 24000,
    projectId: 'tt-safe-project',
  });

  assert.match(rewritten, /project_id = "tt-safe-project"/);
  for (const { key, offset, section } of PORT_FIELDS) {
    const sectionText = rewritten.split(`[${section}]`)[1];
    assert.match(sectionText, new RegExp(`${key} = ${24000 + offset}`));
  }
  assert.match(rewritten, /# smtp_port = 8005/);
});

test('config rewrite fails closed for missing, duplicate, and new port fields', () => {
  assert.throws(
    () =>
      rewriteSupabaseConfig(CONFIG.replace('port = 8007\n', ''), {
        basePort: 24000,
        projectId: 'tt-safe',
      }),
    /Supabase port schema changed/
  );
  assert.throws(
    () =>
      rewriteSupabaseConfig(`${CONFIG}port = 9000\n`, {
        basePort: 24000,
        projectId: 'tt-safe',
      }),
    /Missing\/duplicate/
  );
  assert.throws(
    () =>
      rewriteSupabaseConfig(`${CONFIG}\n[auth.email.smtp]\nport = 587\n`, {
        basePort: 24000,
        projectId: 'tt-safe',
      }),
    /unexpected: auth.email.smtp.port/
  );
});

test('port selection uses a bounded deterministic alternate slot', async () => {
  const identity = deriveIsolatedIdentity({
    headSha: 'a'.repeat(40),
    repositoryPath: '/repo/worktree',
  });
  const first = derivePortBlock(identity, 0);
  const blockedPort = first.basePort + 3;
  const selected = await chooseAvailablePortBlock(identity, {
    available: async (port) => port !== blockedPort,
  });

  assert.equal(selected.attempt, 1);
  assert.notEqual(selected.basePort, first.basePort);
});

test('port selection fails after the bounded attempts', async () => {
  const identity = deriveIsolatedIdentity({
    headSha: 'a'.repeat(40),
    repositoryPath: '/repo/worktree',
  });
  await assert.rejects(
    chooseAvailablePortBlock(identity, {
      attempts: 2,
      available: async () => false,
    }),
    /after 2 attempts/
  );
});

test('project collision recognizes only the exact Supabase identity', () => {
  assert.equal(
    hasProjectCollision('tt-owned', [
      'supabase_db_tuturuuu',
      'supabase_auth_tt-owned',
      'unrelated_tt-owned',
    ]),
    true
  );
  assert.equal(hasProjectCollision('tt-free', ['supabase_db_tuturuuu']), false);
});

test('staging copies only tracked Supabase files and preserves sources', async (t) => {
  const repositoryRoot = await temporaryDirectory(t, 'isolated-repo-');
  const temporaryRoot = await temporaryDirectory(t, 'isolated-parent-');
  const files = new Map([
    ['apps/database/supabase/config.toml', CONFIG],
    ['apps/database/supabase/migrations/001.sql', 'select 1;\n'],
    ['apps/database/supabase/seed.sql', 'select 2;\n'],
    ['apps/database/supabase/templates/invite.html', '<p>Invite</p>\n'],
  ]);
  for (const [relativePath, contents] of files) {
    const target = path.join(repositoryRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  await writeFile(
    path.join(repositoryRoot, 'apps/database/supabase/untracked.sql'),
    'select 3;\n'
  );
  const before = new Map(
    [...files].map(([relativePath, contents]) => [
      relativePath,
      digest(contents),
    ])
  );

  const metadata = await stageDisposableProject({
    basePort: 24000,
    headSha: 'a'.repeat(40),
    projectId: 'tt-staged',
    repositoryRoot,
    temporaryRoot,
    trackedFiles: [...files.keys()],
  });
  t.after(() =>
    fs.rmSync(metadata.disposableRoot, { force: true, recursive: true })
  );

  assert.equal(
    fs.existsSync(path.join(metadata.disposableRoot, 'supabase/untracked.sql')),
    false
  );
  assert.match(
    await readFile(
      path.join(metadata.disposableRoot, 'supabase/config.toml'),
      'utf8'
    ),
    /project_id = "tt-staged"/
  );
  for (const [relativePath, expectedHash] of before) {
    assert.equal(
      digest(await readFile(path.join(repositoryRoot, relativePath))),
      expectedHash
    );
  }
  assert.deepEqual(
    [...files.keys()].map((file) => file.replace('apps/database/', '')).sort(),
    [
      'supabase/config.toml',
      'supabase/migrations/001.sql',
      'supabase/seed.sql',
      'supabase/templates/invite.html',
    ]
  );
  assert.equal(
    (await readLifecycleMetadata(metadata.disposableRoot, { temporaryRoot }))
      .projectId,
    'tt-staged'
  );
});

test('cleanup rejects paths outside the owned disposable root', async (t) => {
  const temporaryRoot = await temporaryDirectory(t, 'isolated-parent-');
  assert.throws(
    () => assertDisposableRoot(path.join(temporaryRoot, 'someone-else')),
    /Refusing to clean unowned path/
  );
  await assert.rejects(
    removeDisposableRoot(path.join(temporaryRoot, '..', 'outside')),
    /Refusing to clean unowned path/
  );
});

test('focused test validation accepts only existing repo-relative pgTAP files', async (t) => {
  const repositoryRoot = await temporaryDirectory(t, 'isolated-repo-');
  const testFile = path.join(
    repositoryRoot,
    'apps/database/supabase/tests/focused.sql'
  );
  await mkdir(path.dirname(testFile), { recursive: true });
  await writeFile(testFile, 'select 1;\n');

  assert.equal(
    validateFocusedTestPath(repositoryRoot, 'supabase/tests/focused.sql'),
    'supabase/tests/focused.sql'
  );
  assert.throws(
    () => validateFocusedTestPath(repositoryRoot, 'supabase/tests/../seed.sql'),
    /does not exist inside|must be repo-relative/
  );
  assert.throws(
    () => validateFocusedTestPath(repositoryRoot, '/tmp/focused.sql'),
    /must be repo-relative/
  );
});

test('argument parser keeps cleanup mutually exclusive', () => {
  assert.deepEqual(parseArguments(['--test', 'supabase/tests/a.sql']), {
    cleanupRoot: null,
    resumeRoot: null,
    testPath: 'supabase/tests/a.sql',
  });
  assert.throws(
    () =>
      parseArguments(['--cleanup', '/tmp/a', '--test', 'supabase/tests/a.sql']),
    /cannot be combined/
  );
  assert.throws(() => parseArguments(['--unknown']), /Unknown or incomplete/);
});

test('database manifest and runbook expose the canonical commands', () => {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(repositoryRoot, 'apps/database/package.json'),
      'utf8'
    )
  );
  const runbook = fs.readFileSync(
    path.join(
      repositoryRoot,
      'apps/docs/build/development-tools/local-supabase-development.mdx'
    ),
    'utf8'
  );

  assert.equal(
    manifest.scripts['sb:validate:isolated'],
    'node scripts/run-supabase-isolated.js'
  );
  assert.match(
    runbook,
    /bun --cwd apps\/database sb:validate:isolated --test supabase\/tests\/workspace-creator-membership\.sql/
  );
  assert.match(
    runbook,
    /sb:validate:isolated --resume \/tmp\/tuturuuu-supabase-EXAMPLE/
  );
  assert.match(
    runbook,
    /sb:validate:isolated --cleanup \/tmp\/tuturuuu-supabase-EXAMPLE/
  );
  assert.doesNotMatch(runbook, /bun --cwd apps\/database run /);
});

test('lifecycle starts, resets, tests, and removes only its project', async () => {
  const metadata = fakeMetadata('/tmp/tuturuuu-supabase-success');
  const harness = lifecycleHarness([0, 0, 0, 0]);
  const removed = [];
  const code = await runIsolatedLifecycle({
    binaryPath: '/supabase',
    metadata,
    registerSignals: harness.registerSignals,
    removeRoot: async (root) => removed.push(root),
    runner: harness.runner,
    stderr: { write() {} },
    updateMetadata: async () => {},
  });

  assert.equal(code, 0);
  assert.deepEqual(
    harness.commands.map(({ args }) => args),
    [
      ['--workdir', metadata.disposableRoot, 'start'],
      ['--workdir', metadata.disposableRoot, 'db', 'reset'],
      ['--workdir', metadata.disposableRoot, 'test', 'db', metadata.testPath],
      [
        '--workdir',
        metadata.disposableRoot,
        'stop',
        '--project-id',
        metadata.projectId,
        '--no-backup',
      ],
    ]
  );
  assert.deepEqual(removed, [metadata.disposableRoot]);
});

for (const [name, results, expectedCode, commandCount] of [
  ['start failure', [7, 0], 7, 2],
  ['migration failure', [0, 8, 0], 8, 3],
  ['test failure', [0, 0, 9, 0], 9, 4],
]) {
  test(`lifecycle preserves ${name} through cleanup`, async () => {
    const metadata = fakeMetadata(
      `/tmp/tuturuuu-supabase-${name.replaceAll(' ', '-')}`
    );
    const harness = lifecycleHarness(results);
    const code = await runIsolatedLifecycle({
      binaryPath: '/supabase',
      metadata,
      registerSignals: harness.registerSignals,
      removeRoot: async () => {},
      runner: harness.runner,
      stderr: { write() {} },
      updateMetadata: async () => {},
    });
    assert.equal(code, expectedCode);
    assert.equal(harness.commands.length, commandCount);
  });
}

test('signal requests scoped cleanup and returns the signal exit code', async () => {
  const metadata = fakeMetadata('/tmp/tuturuuu-supabase-signal');
  const harness = lifecycleHarness([0, 0], { signalAfterCall: 1 });
  const code = await runIsolatedLifecycle({
    binaryPath: '/supabase',
    metadata,
    registerSignals: harness.registerSignals,
    removeRoot: async () => {},
    runner: harness.runner,
    stderr: { write() {} },
    updateMetadata: async () => {},
  });
  assert.equal(code, 130);
  assert.equal(harness.commands.length, 2);
  assert.ok(harness.commands[1].args.includes(metadata.projectId));
});

test('cleanup failure retains metadata for explicit recovery', async () => {
  const metadata = fakeMetadata('/tmp/tuturuuu-supabase-cleanup-failure');
  const harness = lifecycleHarness([0, 0, 0, 12]);
  let removed = false;
  const code = await runIsolatedLifecycle({
    binaryPath: '/supabase',
    metadata,
    registerSignals: harness.registerSignals,
    removeRoot: async () => {
      removed = true;
    },
    runner: harness.runner,
    stderr: { write() {} },
    updateMetadata: async () => {},
  });
  assert.equal(code, 12);
  assert.equal(removed, false);
});

test('explicit cleanup is repeatable and always scopes the project id', async () => {
  const metadata = fakeMetadata('/tmp/tuturuuu-supabase-repeat-cleanup');
  const commands = [];
  let removals = 0;
  const runner = async (_command, args) => {
    commands.push(args);
    return { code: 0, signal: null };
  };
  for (let count = 0; count < 2; count += 1) {
    assert.equal(
      await cleanupInterruptedProject({
        binaryPath: '/supabase',
        metadata,
        removeRoot: async () => {
          removals += 1;
        },
        runner,
      }),
      0
    );
  }
  assert.equal(removals, 2);
  assert.ok(commands.every((args) => args.includes(metadata.projectId)));
  assert.ok(commands.every((args) => !args.includes('--all')));
});

test('two isolated lifecycles have no command or port overlap', async () => {
  const identities = ['/repo/one', '/repo/two'].map((repositoryPath) =>
    deriveIsolatedIdentity({ headSha: 'a'.repeat(40), repositoryPath })
  );
  const blocks = identities.map((identity) => derivePortBlock(identity));
  const firstPorts = new Set(Object.values(blocks[0].ports));
  assert.equal(
    Object.values(blocks[1].ports).some((port) => firstPorts.has(port)),
    false
  );

  const commandSets = [];
  await Promise.all(
    identities.map(async (identity, index) => {
      const metadata = fakeMetadata(
        `/tmp/tuturuuu-supabase-concurrent-${index}`,
        { projectId: identity.projectId }
      );
      const harness = lifecycleHarness([0, 0, 0, 0]);
      await runIsolatedLifecycle({
        binaryPath: '/supabase',
        metadata,
        registerSignals: harness.registerSignals,
        removeRoot: async () => {},
        runner: harness.runner,
        stderr: { write() {} },
        updateMetadata: async () => {},
      });
      commandSets.push(harness.commands);
    })
  );
  const roots = commandSets.map((commands) => commands[0].cwd);
  assert.equal(new Set(roots).size, 2);
});
