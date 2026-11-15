import * as fs from 'node:fs/promises';
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Deterministic replay of the herd race: a reclaimer opens the existing lock,
// then its owner releases it (releaseTransactionLock unlinks without taking
// `.reclaim`) before the reclaimer's own lstat or unlink of that path.
const race = vi.hoisted(() => ({
  lstatPath: undefined as string | undefined,
  unlinkPath: undefined as string | undefined,
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    lstat: vi.fn(async (path: string) => {
      if (path === race.lstatPath) {
        race.lstatPath = undefined;
        await actual.unlink(path);
      }
      return actual.lstat(path);
    }),
    unlink: vi.fn(async (path: string) => {
      if (path === race.unlinkPath) {
        race.unlinkPath = undefined;
        await actual.unlink(path);
      }
      return actual.unlink(path);
    }),
  };
});
vi.mock('../src/process-identity', async (original) => {
  const actual = await original<typeof import('../src/process-identity')>();
  return {
    ...actual,
    processStartedAt: () => 'fixture-own-start',
    processState: () => 'dead',
  };
});

const { acquireTransactionLock, releaseTransactionLock } = await import(
  '../src/transaction-lock'
);
const { readLedger, transactLedger } = await import('../src/hook-ledger');

const dirs: string[] = [];
afterEach(async () => {
  race.lstatPath = undefined;
  race.unlinkPath = undefined;
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function staleLock(kind: 'dead-owner' | 'incomplete') {
  const dir = await mkdtemp(join(tmpdir(), 'quota-lock-release-'));
  dirs.push(dir);
  const lockPath = join(dir, 'transaction.lock');
  if (kind === 'dead-owner') {
    await writeFile(
      lockPath,
      JSON.stringify({ pid: 4242, processStartedAt: 'fixture-owner-start' })
    );
  } else {
    // An empty lock past the incomplete-write grace period is reclaimable.
    await writeFile(lockPath, '');
    const past = new Date(Date.now() - 60_000);
    await utimes(lockPath, past, past);
  }
  return { dir, lockPath };
}

describe.each(['dead-owner', 'incomplete'] as const)(
  'a %s lock released mid-reclamation',
  (kind) => {
    it.each(['lstat', 'unlink'] as const)(
      'maps ENOENT at %s to the retryable disappeared error',
      async (site) => {
        const { lockPath } = await staleLock(kind);
        if (site === 'lstat') race.lstatPath = lockPath;
        else race.unlinkPath = lockPath;

        await expect(acquireTransactionLock(lockPath)).rejects.toThrow(
          'transaction-lock-disappeared'
        );
        // The injected release really happened at that call site.
        expect(race.lstatPath ?? race.unlinkPath).toBeUndefined();

        // The released path is free again, so a fresh attempt takes the lock.
        const lock = await acquireTransactionLock(lockPath);
        await releaseTransactionLock(lockPath, lock);
      }
    );

    it('lets a ledger transaction retry the hand-off instead of hard-failing', async () => {
      const { dir, lockPath } = await staleLock(kind);
      race.lstatPath = lockPath;

      await transactLedger((ledger) => {
        ledger.lastAdmissions = { ...ledger.lastAdmissions, handoff: 1 };
      }, dir);

      expect(race.lstatPath).toBeUndefined();
      expect((await readLedger(dir)).lastAdmissions).toEqual({ handoff: 1 });
    });
  }
);

it('still reports a non-ENOENT lstat failure as a hard error', async () => {
  const { lockPath } = await staleLock('dead-owner');
  const failure = Object.assign(new Error('EACCES: denied'), {
    code: 'EACCES',
  });
  vi.mocked(fs.lstat).mockRejectedValueOnce(failure);

  await expect(acquireTransactionLock(lockPath)).rejects.toBe(failure);
});
