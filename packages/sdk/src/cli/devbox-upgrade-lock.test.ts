import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquireUpgradeLock } from './devbox-upgrade-lock';

describe('upgrade process ownership', () => {
  let directory: string;
  let lock: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ttr-lock-'));
    lock = join(directory, 'upgrade.lock');
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  it('does not evict an active process and releases only its own lock', async () => {
    const release = await acquireUpgradeLock(lock);
    expect(release).toBeTypeOf('function');
    expect(await acquireUpgradeLock(lock)).toBeUndefined();
    await release!();
    const next = await acquireUpgradeLock(lock);
    expect(next).toBeTypeOf('function');
    await release!();
    expect(await acquireUpgradeLock(lock)).toBeUndefined();
    await next!();
  });
  it('recovers an interrupted installer without allowing concurrent reclaimers', async () => {
    await mkdir(lock);
    await writeFile(
      join(lock, 'owner.json'),
      JSON.stringify({ pid: 2_147_483_647, identity: null, nonce: 'abandoned' })
    );
    const claims = await Promise.all([
      acquireUpgradeLock(lock),
      acquireUpgradeLock(lock),
      acquireUpgradeLock(lock),
    ]);
    const successful = claims.filter(Boolean);
    expect(successful).toHaveLength(1);
    await successful[0]!();
  });
  it('keeps unknown crash state for operator inspection', async () => {
    await mkdir(lock);
    expect(await acquireUpgradeLock(lock)).toBeUndefined();
  });
});
