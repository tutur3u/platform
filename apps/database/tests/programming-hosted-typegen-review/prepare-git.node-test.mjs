import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { removeDisposableRoot } from '../../scripts/run-supabase-isolated.js';
import { createSyntheticCliContext } from './cli-environment.mjs';
import { command, limits, prepare, stageAndRecord } from './proposal.mjs';

// Actual Git and filesystem staging only. CLI, Docker, policy and port probes
// are injected synthetic adapters; no schema or customer state is used.
test('actual prepare stages admitted NUL-delimited Git files despite conflicting ambient selectors', async (t) => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'prepare-git-contract-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'repository');
  const alternate = path.join(base, 'unrelated-repository');
  const context = createSyntheticCliContext({
    root: path.join(base, 'private'),
    nativeBinary: process.execPath,
    temporaryRoot: os.tmpdir(),
  });
  const config = 'apps/database/supabase/config.toml';
  const unusual = 'apps/database/supabase/tests/case\nwith space.sql';
  const unrelated = 'apps/database/supabase/unrelated.sql';
  const git = (cwd, ...args) =>
    execFileSync('git', args, {
      cwd,
      env: context.env,
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 4 * 1024 ** 2,
    }).trim();
  for (const directory of [root, alternate]) {
    await mkdir(path.join(directory, 'apps/database/supabase/tests'), {
      recursive: true,
    });
    await mkdir(path.join(directory, 'packages/types/src'), {
      recursive: true,
    });
    git(directory, 'init', '-q');
  }
  await copyFile(config, path.join(root, config));
  await writeFile(path.join(root, unusual), '-- synthetic inert SQL fixture\n');
  git(root, 'add', '--', config, unusual);
  git(
    root,
    '-c',
    'user.name=Synthetic',
    '-c',
    'user.email=synthetic@example.test',
    'commit',
    '-qm',
    'synthetic source'
  );
  const expectedHead = git(root, 'rev-parse', 'HEAD');
  await writeFile(
    path.join(alternate, unrelated),
    '-- unrelated synthetic file\n'
  );
  git(alternate, 'add', '--', unrelated);
  const bin = path.join(base, 'ambient-bin');
  await mkdir(bin);
  await writeFile(path.join(bin, 'git'), '#!/bin/sh\nexit 91\n');
  await chmod(path.join(bin, 'git'), 0o700);
  const conflicts = {
    PATH: bin,
    HOME: alternate,
    GIT_DIR: path.join(alternate, '.git'),
    GIT_WORK_TREE: alternate,
    GIT_INDEX_FILE: path.join(alternate, '.git/index'),
    GIT_CONFIG_GLOBAL: path.join(alternate, 'synthetic-config'),
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.worktree',
    GIT_CONFIG_VALUE_0: alternate,
  };
  const original = Object.fromEntries(
    Object.keys(conflicts).map((key) => [key, process.env[key]])
  );
  let recorded;
  const calls = [];
  try {
    Object.assign(process.env, conflicts);
    const state = await prepare({
      hosted: () => {},
      existingState: () => false,
      configure: () => process.execPath,
      inventory: (kind) =>
        kind === 'network' ? ['bridge', 'host', 'none'] : [],
      disk: () => limits.initialFreeBytes,
      context: () => context,
      probe: async (_binary, args) =>
        args[0] === '--version'
          ? JSON.parse(await readFile('apps/database/package.json', 'utf8'))
              .devDependencies.supabase
          : '{}',
      commandRunner: (binary, args) =>
        command(binary, args, limits.commandMs, 4 * 1024 ** 2, {
          nativeBinary: process.execPath,
          context: () => context,
          repositoryRoot: root,
          execute: (actual, argv, options) => {
            calls.push(argv);
            assert.equal(actual, 'git');
            assert.equal(options.cwd, root);
            assert.equal(options.env, context.env);
            assert.equal(options.timeout, 5000);
            assert.equal(options.maxBuffer, 4 * 1024 ** 2);
            for (const key of Object.keys(conflicts).filter((key) =>
              key.startsWith('GIT_')
            ))
              assert(!Object.hasOwn(options.env, key));
            return execFileSync(actual, argv, options);
          },
        }),
      repositoryRoot: root,
      ports: async () => ({ basePort: 27000 }),
      fingerprint: () => 'synthetic',
      policy: () => ({ synthetic: true }),
      createOutput: () => {},
      stage: async (options, fields) => {
        assert.deepEqual(options.trackedFiles, [config, unusual]);
        return stageAndRecord(options, fields, {
          record: (saved) => {
            recorded = saved;
          },
        });
      },
    });
    assert.equal(state, recorded);
    assert.equal(state.metadata.headSha, expectedHead);
    assert.deepEqual(calls, [
      ['rev-parse', 'HEAD'],
      ['ls-files', '-z', '--', 'apps/database/supabase'],
    ]);
    assert.equal(
      await readFile(
        path.join(
          state.metadata.disposableRoot,
          'supabase/tests/case\nwith space.sql'
        ),
        'utf8'
      ),
      '-- synthetic inert SQL fixture\n'
    );
    await assert.rejects(
      readFile(
        path.join(state.metadata.disposableRoot, 'supabase/unrelated.sql')
      ),
      { code: 'ENOENT' }
    );
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (recorded) await removeDisposableRoot(recorded.metadata.disposableRoot);
  }
});
