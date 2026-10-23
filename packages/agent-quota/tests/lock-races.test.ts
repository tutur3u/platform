import { access, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

const faults = vi.hoisted(() => ({ change: false, device: false }));
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>();
  return {
    ...fs,
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
