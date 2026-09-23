import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { RELEASE_FILES, verifyPublication } from './verify-publication.mjs';

const source = 'a'.repeat(40);
async function fixture(callback) {
  const root = await mkdtemp(join(tmpdir(), 'desktop-publication-'));
  try {
    for (const name of RELEASE_FILES)
      await writeFile(join(root, name), 'binary');
    for (const [platform, name, verification] of [
      ['windows', RELEASE_FILES[0], 'authenticode-timestamped'],
      ['macos', RELEASE_FILES[1], 'developer-id-notarized-stapled'],
      ['linux', RELEASE_FILES[2], 'deb-package-verified'],
    ]) {
      await writeFile(
        join(root, `verified-${platform}.json`),
        JSON.stringify({
          platform,
          name,
          verification,
          source,
          run: '123',
          sha256: createHash('sha256').update('binary').digest('hex'),
        })
      );
    }
    await callback(root);
  } finally {
    await rm(root, { recursive: true });
  }
}

test('publishes only the full signed package set from the same run and SHA', async () =>
  fixture(async (root) => {
    assert.equal((await verifyPublication(root, source, '123')).length, 3);
    await assert.rejects(
      verifyPublication(root, 'b'.repeat(40), '123'),
      /does not match/
    );
    await assert.rejects(
      verifyPublication(root, source, '124'),
      /does not match/
    );
  }));

test('rejects tampered bytes and additional uploaded files', async () =>
  fixture(async (root) => {
    await writeFile(join(root, RELEASE_FILES[0]), 'tampered');
    await assert.rejects(
      verifyPublication(root, source, '123'),
      /does not match/
    );
    await writeFile(join(root, '.env'), 'sensitive');
    await assert.rejects(
      verifyPublication(root, source, '123'),
      /approved package set/
    );
  }));

test('rejects absent verification and missing platforms', async () =>
  fixture(async (root) => {
    await rm(join(root, 'verified-macos.json'));
    await assert.rejects(
      verifyPublication(root, source, '123'),
      /approved package set/
    );
  }));

test('selected Linux publication still requires its exact receipt and asset set', async () =>
  fixture(async (root) => {
    for (const name of [
      RELEASE_FILES[0],
      RELEASE_FILES[1],
      'verified-windows.json',
      'verified-macos.json',
    ])
      await rm(join(root, name));
    assert.deepEqual(
      (await verifyPublication(root, source, '123', 'linux')).map(
        (file) => file.name
      ),
      [RELEASE_FILES[2]]
    );
    await assert.rejects(
      verifyPublication(root, source, '123', 'linux,macos'),
      /approved package set/
    );
    await assert.rejects(
      verifyPublication(root, source, '123', 'linux,linux'),
      /unique/
    );
    await assert.rejects(
      verifyPublication(root, source, '123', 'untrusted'),
      /allowlisted/
    );
    await assert.rejects(
      verifyPublication(root, 'b'.repeat(40), '123', 'linux'),
      /does not match/
    );
  }));
