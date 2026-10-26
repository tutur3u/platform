import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyLedger, readLedger, transactLedger } from '../src/hook-ledger';
import { pruneLedger } from '../src/ledger-retention';
import { processStartedAt } from '../src/process-identity';
import { acquireSwitchLease, releaseSwitchLease } from '../src/switch-safety';
import { now } from './review-regressions-helpers';

describe('independent review regressions', () => {
  it('recovers a confirmed dead transaction owner and prunes old history', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-dead-'));
    try {
      await writeFile(
        join(dir, 'transaction.lock'),
        JSON.stringify({ pid: 2147483647, processStartedAt: now.toISOString() })
      );
      await transactLedger((ledger) => {
        ledger.observations.push({
          eventId: 'old',
          instanceId: 'codex',
          accountKey: 'fixture',
          outcome: 'success',
          observedAt: '2000-01-01T00:00:00Z',
        });
      }, dir);
      await transactLedger(() => {}, dir);
      expect((await readLedger(dir)).observations).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('checks process identity for release and refuses takeover of a live expired owner', () => {
    const ledger = emptyLedger();
    const identity = {
      threadId: 'owner',
      accountKey: 'fixture',
      attemptId: 'one',
      pid: process.pid,
      processStartedAt: processStartedAt(process.pid)!,
      ttlMs: 1000,
    };
    acquireSwitchLease(ledger, identity, now);
    expect(
      releaseSwitchLease(ledger, { ...identity, pid: identity.pid + 1 }, now)
        .status
    ).toBe('block');
    expect(
      acquireSwitchLease(
        ledger,
        { ...identity, attemptId: 'two' },
        new Date(now.getTime() + 1001)
      ).status
    ).toBe('block');
  });
  it('prunes old leases and observations without clearing unreset exhaustion', () => {
    const ledger = emptyLedger();
    ledger.observations.push({
      eventId: 'limit',
      accountKey: 'fixture',
      instanceId: 'antigravity',
      outcome: 'usage-limit',
      observedAt: new Date(now.getTime() - 86400_000).toISOString(),
    });
    pruneLedger(ledger, now);
    expect(ledger.observations).toHaveLength(1);
  });
  it('releases a live expired lease through the real transaction cleanup path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-expired-release-'));
    try {
      const actual = new Date();
      const identity = {
        threadId: 'owner',
        accountKey: 'fixture',
        attemptId: 'first',
        pid: process.pid,
        processStartedAt: processStartedAt(process.pid)!,
        ttlMs: 1000,
      };
      await transactLedger(
        (ledger) =>
          acquireSwitchLease(
            ledger,
            identity,
            new Date(actual.getTime() - 2000)
          ),
        dir
      );
      expect(
        (
          await transactLedger(
            (ledger) =>
              acquireSwitchLease(
                ledger,
                { ...identity, attemptId: 'second' },
                actual
              ),
            dir
          )
        ).status
      ).toBe('block');
      expect(
        (
          await transactLedger(
            (ledger) => releaseSwitchLease(ledger, identity, actual),
            dir
          )
        ).status
      ).toBe('released');
      expect(
        (
          await transactLedger(
            (ledger) =>
              acquireSwitchLease(
                ledger,
                { ...identity, attemptId: 'second' },
                actual
              ),
            dir
          )
        ).status
      ).toBe('acquired');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
