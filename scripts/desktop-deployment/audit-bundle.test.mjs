import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { auditBundle, containsCredential } from './audit-bundle.mjs';

test('rejects private markers and elevated JWTs while permitting public anon keys', () => {
  const jwt = (role) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.abcdefghijklmnop`;
  assert.equal(containsCredential(jwt('service_role')), true);
  assert.equal(containsCredential(jwt('anon')), false);
  assert.equal(containsCredential('sb_publishable_publiconly'), false);
  assert.equal(containsCredential('prefix\0-----BEGIN PRIVATE KEY-----'), true);
  assert.equal(containsCredential('github_pat_abcdefghijklmnop'), true);
});

test('scans across stream boundaries and never returns the credential', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-audit-'));
  try {
    await writeFile(
      join(root, 'app.bin'),
      `${'x'.repeat(65530)}-----BEGIN PRIVATE KEY-----`
    );
    await assert.rejects(
      auditBundle(root),
      (error) =>
        error.message === 'Credential material detected in release bundle'
    );
  } finally {
    await rm(root, { recursive: true });
  }
});

test('rejects hidden config and escaping symlinks, permits framework links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-audit-'));
  try {
    await mkdir(join(root, 'bundle'));
    await writeFile(
      join(root, 'bundle', '.env.production'),
      'PUBLIC_SETTING=x'
    );
    await assert.rejects(auditBundle(join(root, 'bundle')), /forbidden/);
    await rm(join(root, 'bundle', '.env.production'));
    await writeFile(join(root, 'outside'), 'data');
    await symlink('../outside', join(root, 'bundle', 'escape'));
    await assert.rejects(auditBundle(join(root, 'bundle')), /outside/);
    await rm(join(root, 'bundle', 'escape'));
    await writeFile(join(root, 'bundle', 'binary'), 'safe-public-app');
    await symlink('binary', join(root, 'bundle', 'Current'));
    assert.equal(await auditBundle(join(root, 'bundle')), 1);
  } finally {
    await rm(root, { recursive: true });
  }
});
