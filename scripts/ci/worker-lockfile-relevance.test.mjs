// bun.lock relevance for affected-workflow gating. Narrowing must only ever
// skip a workflow when every changed lock entry is scoped to workspaces outside
// its dependency closure; anything unknown keeps the workflow running.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lockfileWorkspaceDelta } from './lockfile-workspace-delta.ts';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

function lock({ workspaces = {}, packages = {}, extra = {} } = {}) {
  // Mirror bun.lock's trailing-comma layout.
  const json = JSON.stringify(
    {
      lockfileVersion: 1,
      configVersion: 1,
      workspaces: {
        '': { name: 'root', devDependencies: { turbo: '^2' } },
        'apps/colab': {
          name: '@tuturuuu/colab',
          dependencies: { '@tuturuuu/utils': 'workspace:*' },
        },
        'packages/utils': {
          name: '@tuturuuu/utils',
          dependencies: { zod: '^4' },
        },
        ...workspaces,
      },
      packages: {
        '@tuturuuu/colab': ['@tuturuuu/colab@workspace:apps/colab'],
        '@tuturuuu/utils': ['@tuturuuu/utils@workspace:packages/utils'],
        zod: ['zod@4.1.0', '', {}, 'sha512-a'],
        ...packages,
      },
      ...extra,
    },
    null,
    2
  );
  return json.replace(/(\n\s*)([}\]])/g, ',$1$2').replace(/\{,/g, '{');
}

const quota = {
  workspaces: {
    'packages/agent-quota': {
      name: '@tuturuuu/agent-quota',
      dependencies: { picocolors: '^1' },
    },
  },
  packages: {
    '@tuturuuu/agent-quota': [
      '@tuturuuu/agent-quota@workspace:packages/agent-quota',
    ],
    picocolors: ['picocolors@1.1.0', '', {}, 'sha512-b'],
  },
};

test('a new unrelated workspace with new packages is scoped to that workspace', () => {
  assert.deepEqual(lockfileWorkspaceDelta(lock(), lock(quota)), {
    global: false,
    workspaces: ['@tuturuuu/agent-quota'],
  });
  assert.deepEqual(lockfileWorkspaceDelta(lock(), lock()), {
    global: false,
    workspaces: [],
  });
});

test('nested resolutions under a workspace scope to that workspace', () => {
  const nested = {
    packages: { '@tuturuuu/utils/zod': ['zod@3.25.0', '', {}, 'sha512-c'] },
  };
  assert.deepEqual(lockfileWorkspaceDelta(lock(), lock(nested)), {
    global: false,
    workspaces: ['@tuturuuu/utils'],
  });
});

test('shared, root and settings changes stay global', () => {
  for (const [label, head] of [
    [
      'modified top-level',
      lock({ packages: { zod: ['zod@4.2.0', '', {}, 'sha512-d'] } }),
    ],
    [
      'nested under a third-party package',
      lock({ packages: { 'zod/tslib': ['tslib@2.0.0', '', {}, 'sha512-e'] } }),
    ],
    [
      'root workspace',
      lock({
        workspaces: { '': { name: 'root', devDependencies: { turbo: '^3' } } },
      }),
    ],
    ['overrides', lock({ extra: { overrides: { zod: '4.2.0' } } })],
    ['unparseable', '{ not json'],
  ]) {
    assert.equal(lockfileWorkspaceDelta(lock(), head).global, true, label);
  }
  const removed = lock();
  const base = lock({
    packages: { picocolors: ['picocolors@1.1.0', '', {}, 'sha512-b'] },
  });
  assert.equal(lockfileWorkspaceDelta(base, removed).global, true, 'removal');
});

test('trailing-comma parsing leaves string contents intact', () => {
  const tricky = lock({
    packages: {
      'odd-name': ['odd@1.0.0', '', { bin: { x: 'a,}b' } }, 'sha512-f'],
    },
  });
  assert.equal(lockfileWorkspaceDelta(tricky, tricky).global, false);
});

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-relevance-'));
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), value);
  };
  write(
    'package.json',
    JSON.stringify({ name: 'root', workspaces: ['apps/*', 'packages/*'] })
  );
  write(
    'apps/colab/package.json',
    JSON.stringify({
      name: '@tuturuuu/colab',
      dependencies: { '@tuturuuu/utils': 'workspace:*' },
    })
  );
  write(
    'packages/utils/package.json',
    JSON.stringify({ name: '@tuturuuu/utils' })
  );
  write(
    'packages/agent-quota/package.json',
    JSON.stringify({ name: '@tuturuuu/agent-quota' })
  );
  write('bun.lock', lock());
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'ci@example.com']);
  git(root, ['config', 'user.name', 'CI Test']);
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'base']);
  return { root, write, base: git(root, ['rev-parse', 'HEAD']) };
}

function decide(root, env) {
  const output = execFileSync(
    process.execPath,
    [
      '--experimental-strip-types',
      'scripts/ci/check-workflow-config.ts',
      '--workflow',
      'colab-cloudflare.yaml',
      '--event-name',
      'pull_request',
      '--root-dir',
      root,
      '--changed-files',
      'bun.lock',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: '', ...env },
      stdio: ['ignore', 'pipe', 'ignore'],
    }
  );
  return { output, shouldRun: /Should run: true/.test(output) };
}

test('the workflow gate skips Workers only for lock edits outside their closure', () => {
  const { root, write, base } = fixture();
  try {
    write('bun.lock', lock(quota));
    git(root, ['commit', '-q', '-am', 'add quota']);
    const unrelated = git(root, ['rev-parse', 'HEAD']);
    const skipped = decide(root, {
      CHANGED_BASE_SHA: base,
      CHANGED_HEAD_SHA: unrelated,
    });
    assert.equal(skipped.shouldRun, false, skipped.output);
    assert.match(skipped.output, /bun\.lock relevance: @tuturuuu\/agent-quota/);

    write(
      'bun.lock',
      lock({
        ...quota,
        packages: {
          ...quota.packages,
          '@tuturuuu/utils/zod': ['zod@3.25.0', '', {}, 'sha512-c'],
        },
      })
    );
    git(root, ['commit', '-q', '-am', 'nest zod under utils']);
    const related = git(root, ['rev-parse', 'HEAD']);
    assert.equal(
      decide(root, { CHANGED_BASE_SHA: base, CHANGED_HEAD_SHA: related })
        .shouldRun,
      true
    );

    // Unknown base/head keeps bun.lock global.
    assert.equal(
      decide(root, { CHANGED_BASE_SHA: '', CHANGED_HEAD_SHA: '' }).shouldRun,
      true
    );
    assert.equal(
      decide(root, {
        CHANGED_BASE_SHA: 'f'.repeat(40),
        CHANGED_HEAD_SHA: unrelated,
      }).shouldRun,
      true
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ci-check passes the compared commits and ships the delta module', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, '.github/workflows/ci-check.yml'),
    'utf8'
  );
  assert.match(source, /scripts\/ci\/lockfile-workspace-delta\.ts/);
  assert.match(
    source,
    /CHANGED_BASE_SHA: \$\{\{ steps\.changed_files\.outputs\.base_sha \}\}/
  );
  assert.match(
    source,
    /CHANGED_HEAD_SHA: \$\{\{ steps\.changed_files\.outputs\.head_sha \}\}/
  );
});

// Paused runtimes report "disabled" from a check runner on every trigger, so
// they must not trigger on inputs shared with every active app.
test('paused runtime workflows do not trigger on shared repository inputs', () => {
  const shared = [
    'bun.lock',
    'package.json',
    'turbo.json',
    'tuturuuu.ts',
    'tuturuuu.ci.ts',
    '.github/workflows/ci-check.yml',
    'scripts/ci/release-only-changes.*',
  ];
  for (const file of ['docker-setup-check.yaml', 'rust-backend.yml']) {
    const source = fs.readFileSync(
      path.join(repoRoot, '.github/workflows', file),
      'utf8'
    );
    const triggers = source.slice(0, source.indexOf('\npermissions:'));
    for (const input of shared) {
      assert.ok(
        !triggers.includes(`- "${input}"`),
        `${file} triggers on ${input}`
      );
    }
    assert.doesNotMatch(triggers, /- "apps\/docs\//u, file);
    assert.doesNotMatch(
      triggers,
      /- "apps\/(?!backend|tanstack-web)[^/"]+\/package\.json"/u,
      file
    );
  }
});
