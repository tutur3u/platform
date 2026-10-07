import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stageDisposableProject } from './run-supabase-isolated.js';

const payload = 'synthetic staging fixture only\n';
const fixtureFile = 'apps/database/supabase/fixture.txt';
const missingFile = 'apps/database/supabase/missing-fixture.txt';

async function inventory(root) {
  let bytes = 0;
  let files = 0;
  let directories = 1;
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false);
      if (entry.isDirectory()) {
        directories++;
        await visit(target);
      } else {
        assert.equal(entry.isFile(), true);
        files++;
        bytes += (await stat(target)).size;
      }
    }
  }
  await visit(root);
  assert.ok(bytes <= 4096, `Fixture bytes exceeded bound: ${bytes}`);
  assert.ok(files <= 2, `Fixture files exceeded bound: ${files}`);
  assert.ok(directories <= 12, `Fixture directories exceeded bound: ${directories}`);
  return { bytes, files, directories };
}

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'employee-stage-cleanup-v54-'));
  const repositoryRoot = path.join(root, 'synthetic-repository');
  const temporaryRoot = path.join(root, 'synthetic-staging');
  try {
    await mkdir(path.dirname(path.join(repositoryRoot, fixtureFile)), { recursive: true });
    await mkdir(temporaryRoot);
    await writeFile(path.join(repositoryRoot, fixtureFile), payload);
    await run({
      root,
      temporaryRoot,
      repositoryRoot,
      // Explicit file list prevents the helper's default Git catalog reader.
      // The missing second file fails before config, metadata or project startup.
      options: {
        temporaryRoot,
        repositoryRoot,
        trackedFiles: [fixtureFile, missingFile],
        basePort: 12000,
        headSha: 'synthetic-only',
        projectId: 'synthetic-only',
      },
    });
  } finally {
    const measured = await inventory(root);
    await rm(root, { recursive: true, force: true });
    await assert.rejects(access(root), { code: 'ENOENT' });
    console.log(JSON.stringify({ fixtureCleanup: 'owned-root-absent', ...measured }));
  }
}

async function stagingFailure(options, repositoryRoot) {
  let caught;
  try {
    await stageDisposableProject(options);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.equal(caught.code, 'ENOENT');
  assert.equal(caught.syscall, 'copyfile');
  assert.equal(caught.path, path.join(repositoryRoot, missingFile));
  return caught;
}

async function assertRetained(root, temporaryRoot) {
  assert.equal(path.dirname(root), temporaryRoot);
  assert.ok(path.basename(root).startsWith('tuturuuu-supabase-'));
  assert.equal(await readFile(path.join(root, 'supabase/fixture.txt'), 'utf8'), payload);
  assert.deepEqual(await readdir(temporaryRoot), [path.basename(root)]);
}

test('default staging cleanup removes only its partial synthetic root', async () => {
  await withFixture(async ({ options, repositoryRoot, temporaryRoot }) => {
    await stagingFailure(options, repositoryRoot);
    assert.deepEqual(await readdir(temporaryRoot), []);
    assert.equal(await readFile(path.join(repositoryRoot, fixtureFile), 'utf8'), payload);
  });
});

test('custom retain callback receives guarded root and leaves partial fixture intact', async () => {
  await withFixture(async ({ options, repositoryRoot, temporaryRoot }) => {
    const calls = [];
    const diagnostics = [];
    await stagingFailure({
      ...options,
      removeStagedRoot: async (...args) => { calls.push(args); },
      diagnostic: message => { diagnostics.push(message); },
    }, repositoryRoot);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][1], { force: true, recursive: true });
    await assertRetained(calls[0][0], temporaryRoot);
    assert.deepEqual(diagnostics, []);
  });
});

test('cleanup failure is secondary while original copy failure remains primary', async () => {
  await withFixture(async ({ options, repositoryRoot, temporaryRoot }) => {
    const cleanupError = new Error('synthetic cleanup failure');
    const diagnostics = [];
    let retainedRoot;
    const primary = await stagingFailure({
      ...options,
      removeStagedRoot: async (root, removalOptions) => {
        retainedRoot = root;
        assert.deepEqual(removalOptions, { force: true, recursive: true });
        throw cleanupError;
      },
      diagnostic: message => { diagnostics.push(message); },
    }, repositoryRoot);
    assert.notEqual(primary, cleanupError);
    assert.deepEqual(diagnostics, ['Secondary staging cleanup failure: synthetic cleanup failure']);
    await assertRetained(retainedRoot, temporaryRoot);
  });
});
