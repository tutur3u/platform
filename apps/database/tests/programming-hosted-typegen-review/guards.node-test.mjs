import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  readLifecycleMetadata,
  removeDisposableRoot,
  stageDisposableProject,
} from '../../scripts/run-supabase-isolated.js';
import {
  APPROVED_TYPEGEN_OUTPUT,
  validateTypegenOutputPath,
} from '../../scripts/run-supabase-isolated-typegen.js';
import {
  assertDisk,
  limits,
  main,
  ownedNames,
  typegenOutputForRepository,
} from './proposal.mjs';

test('disk budget accepts boundary and rejects every exhausted budget', () => {
  assert.doesNotThrow(() =>
    assertDisk(limits.initialFreeBytes, limits.minimumFreeBytes)
  );
  assert.throws(() =>
    assertDisk(limits.initialFreeBytes - 1, limits.initialFreeBytes)
  );
  assert.throws(() =>
    assertDisk(limits.initialFreeBytes, limits.minimumFreeBytes - 1)
  );
  assert.throws(() => assertDisk(30 * 1024 ** 3, 19 * 1024 ** 3));
});
test('cleanup inventory includes only exact owned Supabase identity', () => {
  assert.deepEqual(
    ownedNames(
      [
        'supabase_db_tt-owned',
        'supabase_db_other',
        'other_tt-owned',
        'supabase_db_tt-owned-suffix',
      ],
      'tt-owned'
    ),
    ['supabase_db_tt-owned']
  );
  assert.throws(() => ownedNames([], '*'));
});
test('execution rejects non-hosted environments before Docker or installation', async () => {
  const original = process.env.GITHUB_ACTIONS;
  try {
    delete process.env.GITHUB_ACTIONS;
    await assert.rejects(main('prepare'), /Requires isolated Linux/);
    await assert.rejects(main('run'), /Requires isolated Linux/);
    await assert.rejects(main('cleanup'), /Requires isolated Linux/);
  } finally {
    if (original === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = original;
  }
});

test('actual helper accepts the staged relative typegen output on resume', async () => {
  const fixture = await mkdtemp(
    path.join(os.tmpdir(), 'typegen-review-contract-')
  );
  let disposableRoot;
  try {
    await mkdir(path.join(fixture, 'packages/types/src'), { recursive: true });
    await mkdir(path.join(fixture, 'apps/database/supabase'), {
      recursive: true,
    });
    await copyFile(
      'apps/database/supabase/config.toml',
      path.join(fixture, 'apps/database/supabase/config.toml')
    );
    const metadata = await stageDisposableProject({
      basePort: 27000,
      headSha: 'a'.repeat(40),
      projectId: 'tt-review-contract',
      repositoryRoot: fixture,
      typegenOutput: typegenOutputForRepository(fixture),
      trackedFiles: ['apps/database/supabase/config.toml'],
    });
    disposableRoot = metadata.disposableRoot;
    const resumed = await readLifecycleMetadata(disposableRoot);
    assert.equal(resumed.typegenOutput, APPROVED_TYPEGEN_OUTPUT);
    assert.equal(
      validateTypegenOutputPath(fixture, resumed.typegenOutput),
      APPROVED_TYPEGEN_OUTPUT
    );
    assert.throws(
      () =>
        validateTypegenOutputPath(
          fixture,
          path.join(fixture, APPROVED_TYPEGEN_OUTPUT)
        ),
      /must be exactly/
    );
  } finally {
    if (disposableRoot) await removeDisposableRoot(disposableRoot);
    await rm(fixture, { recursive: true, force: true });
  }
});
