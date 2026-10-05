import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { selectVerifiedPlatforms } from './select-publication.mjs';

const source = 'a'.repeat(40),
  run = '42',
  name = 'Tuturuuu-linux-x64.deb';
async function fixture(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-selection-'));
  try {
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
async function linux(directory) {
  const bytes = Buffer.from('verified fixture');
  await writeFile(join(directory, name), bytes);
  await writeFile(
    join(directory, 'verified-linux.json'),
    JSON.stringify({
      platform: 'linux',
      source,
      run,
      name,
      verification: 'deb-package-verified',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
  );
}
test('successful platform can publish when another selected build has no artifact', async () =>
  fixture(async (dir) => {
    await linux(dir);
    assert.deepEqual(
      await selectVerifiedPlatforms(dir, source, run, 'macos,linux'),
      ['linux']
    );
  }));
test('present unverified platform cannot be silently excluded', async () =>
  fixture(async (dir) => {
    await linux(dir);
    await writeFile(join(dir, 'Tuturuuu-macos-universal.dmg'), 'unverified');
    await assert.rejects(
      selectVerifiedPlatforms(dir, source, run, 'macos,linux'),
      /exactly match/
    );
  }));
test('unknown or unselected artifact blocks publication', async () =>
  fixture(async (dir) => {
    await linux(dir);
    await assert.rejects(
      selectVerifiedPlatforms(dir, source, run, 'macos'),
      /Unexpected/
    );
  }));
test('no successful artifacts and mismatched run fail closed', async () =>
  fixture(async (dir) => {
    await assert.rejects(
      selectVerifiedPlatforms(dir, source, run, 'linux'),
      /No verified/
    );
    await linux(dir);
    await assert.rejects(
      selectVerifiedPlatforms(dir, source, '43', 'linux'),
      /does not match/
    );
  }));
