import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertDisk, ownedNames, limits, main } from './proposal.mjs';
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
    await assert.rejects(main('run'), /Requires isolated Linux/);
    await assert.rejects(main('cleanup'), /Requires isolated Linux/);
  } finally {
    if (original === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = original;
  }
});
