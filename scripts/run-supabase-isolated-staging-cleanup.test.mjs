import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stageDisposableProject } from '../apps/database/scripts/run-supabase-isolated.js';

const fixtureFile = 'apps/database/supabase/fixture.txt';
const payload = 'disposable staging fixture\n';

async function withFailedStaging(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'staging-cleanup-test-'));
  const repositoryRoot = path.join(root, 'repository');
  const temporaryRoot = path.join(root, 'staging');
  const original = new Error('original synthetic staging failure');
  try {
    await mkdir(path.dirname(path.join(repositoryRoot, fixtureFile)), {
      recursive: true,
    });
    await mkdir(temporaryRoot);
    await writeFile(path.join(repositoryRoot, fixtureFile), payload);
    await writeFile(path.join(temporaryRoot, 'unrelated.txt'), payload);
    const trackedFiles = {
      *[Symbol.iterator]() {
        yield fixtureFile;
        throw original;
      },
    };
    await run({
      original,
      temporaryRoot,
      options: {
        repositoryRoot,
        temporaryRoot,
        trackedFiles,
        basePort: 12000,
        headSha: 'synthetic-only',
        projectId: 'synthetic-only',
      },
    });
    assert.equal(
      await readFile(path.join(repositoryRoot, fixtureFile), 'utf8'),
      payload
    );
    assert.equal(
      await readFile(path.join(temporaryRoot, 'unrelated.txt'), 'utf8'),
      payload
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('successful default cleanup preserves the original error and unrelated files', async () => {
  await withFailedStaging(async ({ options, original, temporaryRoot }) => {
    await assert.rejects(
      stageDisposableProject(options),
      (error) => error === original
    );
    assert.deepEqual(await readdir(temporaryRoot), ['unrelated.txt']);
  });
});

test('successful injected cleanup receives the owned root and emits no diagnostic', async () => {
  await withFailedStaging(async ({ options, original, temporaryRoot }) => {
    let calls = 0;
    await assert.rejects(
      stageDisposableProject({
        ...options,
        removeStagedRoot: async (root, removalOptions) => {
          calls++;
          assert.equal(path.dirname(root), temporaryRoot);
          assert.ok(path.basename(root).startsWith('tuturuuu-supabase-'));
          assert.deepEqual(removalOptions, { force: true, recursive: true });
          assert.equal(
            await readFile(path.join(root, 'supabase/fixture.txt'), 'utf8'),
            payload
          );
          await rm(root, removalOptions);
        },
        diagnostic: () => assert.fail('successful cleanup must not log'),
      }),
      (error) => error === original
    );
    assert.equal(calls, 1);
    assert.deepEqual(await readdir(temporaryRoot), ['unrelated.txt']);
  });
});

for (const diagnosticThrows of [false, true]) {
  test(`cleanup failure preserves the same staging error when diagnostic ${diagnosticThrows ? 'throws' : 'succeeds'}`, async () => {
    await withFailedStaging(async ({ options, original, temporaryRoot }) => {
      const cleanupError = new Error('private cleanup path must not be logged');
      const diagnostics = [];
      let retainedRoot;
      await assert.rejects(
        stageDisposableProject({
          ...options,
          removeStagedRoot: async (root) => {
            retainedRoot = root;
            throw cleanupError;
          },
          diagnostic: (message) => {
            diagnostics.push(message);
            if (diagnosticThrows) throw new Error('private diagnostic failure');
          },
        }),
        (error) => error === original
      );
      assert.deepEqual(diagnostics, ['Secondary staging cleanup failure.']);
      assert.equal(path.dirname(retainedRoot), temporaryRoot);
      assert.equal(
        await readFile(path.join(retainedRoot, 'supabase/fixture.txt'), 'utf8'),
        payload
      );
      assert.deepEqual(
        (await readdir(temporaryRoot)).sort(),
        [path.basename(retainedRoot), 'unrelated.txt'].sort()
      );
    });
  });
}
