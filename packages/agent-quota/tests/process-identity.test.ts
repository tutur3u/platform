import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyLedger } from '../src/hook-ledger';
import { pruneLedger } from '../src/ledger-retention';
import { processStartedAt, processState } from '../src/process-identity';
import { acquireSwitchLease } from '../src/switch-safety';

const now = new Date('2026-10-31T00:00:00Z');
const identity = {
  threadId: 'owner',
  accountKey: 'codex:shared',
  attemptId: 'original',
  pid: process.pid,
  processStartedAt: processStartedAt(process.pid)!,
  ttlMs: 30_000,
};

afterEach(() => vi.restoreAllMocks());

describe('lease owner process identity', () => {
  it.each([
    ['EPERM', true],
    ['ESRCH', true],
    ['EIO', false],
  ])('%s reclaims an expired lease: %s', (code, stale) => {
    const ledger = emptyLedger();
    acquireSwitchLease(ledger, identity, now);
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error(code), { code });
    });
    const later = new Date(now.getTime() + identity.ttlMs);
    pruneLedger(ledger, later);
    expect(ledger.leases).toHaveLength(stale ? 0 : 1);
    expect(
      ledger.leaseHistory.some((event) => event.action === 'expired')
    ).toBe(stale);
    expect(
      acquireSwitchLease(ledger, { ...identity, attemptId: 'next' }, later)
        .status
    ).toBe(stale ? 'acquired' : 'block');
  });

  it('retains an unexpired EPERM lease and blocks another attempt', () => {
    const ledger = emptyLedger();
    acquireSwitchLease(ledger, identity, now);
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('denied'), { code: 'EPERM' });
    });
    pruneLedger(ledger, now);
    expect(ledger.leases).toHaveLength(1);
    expect(
      acquireSwitchLease(ledger, { ...identity, attemptId: 'next' }, now).status
    ).toBe('block');
  });

  it('preserves a successful live owner even after expiry', () => {
    const ledger = emptyLedger();
    acquireSwitchLease(ledger, identity, now);
    expect(processState(identity.pid, identity.processStartedAt)).toBe('same');
    const later = new Date(now.getTime() + identity.ttlMs);
    pruneLedger(ledger, later);
    expect(ledger.leases).toHaveLength(1);
    expect(
      acquireSwitchLease(ledger, { ...identity, attemptId: 'next' }, later)
        .status
    ).toBe('block');
  });

  it('keeps ESRCH dead and other errors unknown', () => {
    const kill = vi.spyOn(process, 'kill');
    for (const [code, state] of [
      ['ESRCH', 'dead'],
      ['EIO', 'unknown'],
    ]) {
      kill.mockImplementation(() => {
        throw Object.assign(new Error(code), { code });
      });
      expect(processState(identity.pid, identity.processStartedAt)).toBe(state);
    }
  });
});
