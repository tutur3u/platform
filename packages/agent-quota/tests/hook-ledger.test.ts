import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readLedger, transactLedger } from '../src/hook-ledger';
import { processStartedAt } from '../src/process-identity';
import { acquireSwitchLease } from '../src/switch-safety';

const now = new Date();
const lease = {
  threadId: 'owner',
  accountKey: 'codex:one',
  attemptId: 'first',
  pid: 123,
  processStartedAt: '2026-10-23T00:00:00Z',
  ttlMs: 30_000,
};
describe('atomic host-wide hook ledger', () => {
  it('admits exactly one concurrent transition on the same thread with different targets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-hooks-'));
    try {
      const result = await Promise.allSettled([
        transactLedger((value) => acquireSwitchLease(value, lease, now), dir),
        transactLedger(
          (value) =>
            acquireSwitchLease(
              value,
              { ...lease, accountKey: 'claude:two', attemptId: 'second' },
              now
            ),
          dir
        ),
      ]);
      expect(
        result.filter(
          (item) =>
            item.status === 'fulfilled' && item.value.status === 'acquired'
        )
      ).toHaveLength(1);
      expect((await readLedger(dir)).leases).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('allows two thread leases on a shared account and persists expired takeover', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-hooks-'));
    try {
      await transactLedger(
        (value) => acquireSwitchLease(value, lease, now),
        dir
      );
      await transactLedger(
        (value) =>
          acquireSwitchLease(
            value,
            { ...lease, threadId: 'upskii', attemptId: 'other-owner' },
            now
          ),
        dir
      );
      expect((await readLedger(dir)).leases).toHaveLength(2);
      const result = await transactLedger(
        (value) =>
          acquireSwitchLease(
            value,
            { ...lease, attemptId: 'replacement' },
            new Date(now.getTime() + 30_001)
          ),
        dir
      );
      expect(result.status).toBe('acquired');
      expect(
        (await readLedger(dir)).leaseHistory.some(
          (event) => event.action === 'expired-takeover'
        )
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('waits briefly for a live short transaction instead of returning malformed-state failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-hooks-'));
    try {
      const first = transactLedger(async (value) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        value.lastAdmissions = { first: 1 };
      }, dir);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const second = transactLedger((value) => {
        value.lastAdmissions = { second: 2 };
      }, dir);
      await expect(Promise.all([first, second])).resolves.toHaveLength(2);
      expect((await readLedger(dir)).lastAdmissions).toEqual({ second: 2 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('returns a retryable contention reason when a live transaction outlasts the bounded wait', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-hooks-'));
    try {
      const startedAt = processStartedAt(process.pid);
      if (!startedAt) throw Error('test process identity unavailable');
      await writeFile(
        join(dir, 'transaction.lock'),
        JSON.stringify({
          pid: process.pid,
          processStartedAt: startedAt,
        })
      );
      await expect(transactLedger(() => {}, dir)).rejects.toThrow(
        'ledger-contention-retry'
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
