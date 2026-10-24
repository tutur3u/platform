import { constants } from 'node:fs';
import { access, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

const faults = vi.hoisted(() => ({
  change: false,
  device: false,
  replaceAfterUnlink: false,
}));
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>();
  return {
    ...fs,
    unlink: async (...args: Parameters<typeof fs.unlink>) => {
      await fs.unlink(...args);
      if (
        faults.replaceAfterUnlink &&
        String(args[0]).endsWith('transaction.lock')
      ) {
        faults.replaceAfterUnlink = false;
        const replacement = await fs.open(
          String(args[0]),
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
          0o600
        );
        await replacement.writeFile(
          JSON.stringify({
            pid: process.pid,
            processStartedAt: processStartedAt(process.pid),
          })
        );
        await replacement.close();
      }
    },
    lstat: async (...args: Parameters<typeof fs.lstat>) => {
      const stat = await fs.lstat(...args);
      return faults.change && String(args[0]).endsWith('transaction.lock')
        ? new Proxy(stat, {
            get: (target, key) =>
              key === (faults.device ? 'dev' : 'ino')
                ? Number(faults.device ? target.dev : target.ino) + 1
                : Reflect.get(target, key),
          })
        : stat;
    },
  };
});

import { processStartedAt } from '../src/process-identity';
import {
  acquireTransactionLock,
  releaseTransactionLock,
} from '../src/transaction-lock';

it.each(['', '{'])(
  'does not reclaim a fresh incomplete lock (%s)',
  async (contents) => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-lock-incomplete-fresh-'));
    const path = join(dir, 'transaction.lock');
    try {
      await writeFile(path, contents);
      await expect(acquireTransactionLock(path)).rejects.toThrow(
        'transaction-lock-incomplete'
      );
      await expect(access(path)).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);

it('reclaims an empty incomplete lock after the bounded grace period', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-lock-empty-aged-'));
  const path = join(dir, 'transaction.lock');
  try {
    await writeFile(path, '');
    const stale = new Date(Date.now() - 11_000);
    await utimes(path, stale, stale);
    const acquired = await acquireTransactionLock(path);
    await expect(access(path)).resolves.toBeUndefined();
    await releaseTransactionLock(path, acquired);
    await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('allows only one concurrent reclaimer to acquire an aged lock', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-lock-concurrent-reclaim-'));
  const path = join(dir, 'transaction.lock');
  try {
    await writeFile(
      path,
      JSON.stringify({
        pid: 2147483647,
        processStartedAt: '2000-01-01T00:00:00Z',
      })
    );
    const stale = new Date(Date.now() - 11_000);
    await utimes(path, stale, stale);
    const attempts = await Promise.allSettled([
      acquireTransactionLock(path),
      acquireTransactionLock(path),
    ]);
    const acquired = attempts.filter(
      (
        result
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof acquireTransactionLock>>
      > => result.status === 'fulfilled'
    );
    expect(acquired).toHaveLength(1);
    for (const result of acquired)
      await releaseTransactionLock(path, result.value);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('maps a post-unlink replacement race to transaction-lock-changed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-lock-replacement-race-'));
  const path = join(dir, 'transaction.lock');
  try {
    await writeFile(
      path,
      JSON.stringify({
        pid: 2147483647,
        processStartedAt: '2000-01-01T00:00:00Z',
      })
    );
    faults.replaceAfterUnlink = true;
    await expect(acquireTransactionLock(path)).rejects.toThrow(
      'transaction-lock-changed'
    );
    await expect(access(path)).resolves.toBeUndefined();
  } finally {
    faults.replaceAfterUnlink = false;
    await rm(dir, { recursive: true, force: true });
  }
});

it('does not reclaim a mutex owned by a live process', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-lock-live-'));
  const path = join(dir, 'transaction.lock');
  try {
    await writeFile(
      path,
      JSON.stringify({
        pid: process.pid,
        processStartedAt: processStartedAt(process.pid),
      })
    );
    await expect(acquireTransactionLock(path)).rejects.toThrow(
      'transaction-owner-live-or-unverified'
    );
    await expect(access(path)).resolves.toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it.each([false, true])(
  'refuses a changed inode or device during reclamation (device=%s)',
  async (device) => {
    faults.device = device;
    const dir = await mkdtemp(join(tmpdir(), 'quota-lock-race-'));
    const path = join(dir, 'transaction.lock');
    try {
      await writeFile(
        path,
        JSON.stringify({
          pid: 2147483647,
          processStartedAt: '2000-01-01T00:00:00Z',
        })
      );
      faults.change = true;
      await expect(acquireTransactionLock(path)).rejects.toThrow(
        'transaction-lock-changed'
      );
      await expect(access(path)).resolves.toBeUndefined();
    } finally {
      faults.change = false;
      await rm(dir, { recursive: true, force: true });
    }
  }
);
it('does not unlink a replacement inode on release', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-lock-release-'));
  const path = join(dir, 'transaction.lock');
  try {
    const owned = await acquireTransactionLock(path);
    faults.change = true;
    await releaseTransactionLock(path, owned);
    await expect(access(path)).resolves.toBeUndefined();
  } finally {
    faults.change = false;
    await rm(dir, { recursive: true, force: true });
  }
});
