import { describe, expect, it } from 'vitest';
import { emptyLedger } from '../src/hook-ledger';
import type { SwitchEvidence } from '../src/hooks-types';
import {
  acquireSwitchLease,
  checkSwitch,
  releaseSwitchLease,
} from '../src/switch-safety';

const now = new Date('2026-10-23T01:00:00Z');
const identity = {
  threadId: 'upskii',
  accountKey: 'codex:account:shared',
  attemptId: 'attempt-1',
  pid: 123,
  processStartedAt: '2026-10-23T00:00:00Z',
  ttlMs: 30_000,
};
const evidence: SwitchEvidence = {
  threadId: identity.threadId,
  accountKey: identity.accountKey,
  attemptId: identity.attemptId,
  observedAt: now.toISOString(),
  threadIdle: true,
  queue: { threadId: identity.threadId, complete: true, items: [] },
  unfinishedWriterIds: [],
  backgroundJobIds: [],
  children: { preserved: true, ids: ['child-1'] },
  watches: { preserved: true, ids: ['watch-1'] },
  uncertainMutationIds: [],
};
describe('switch safety', () => {
  it('blocks without a lease and never acquires in the read-only check', () => {
    const ledger = emptyLedger();
    const before = JSON.stringify(ledger);
    expect(checkSwitch(ledger, evidence, now)).toMatchObject({
      status: 'block',
      reasons: ['switch-lease-missing'],
    });
    expect(JSON.stringify(ledger)).toBe(before);
  });
  it('blocks non-empty queues that retain old model selections', () => {
    const ledger = emptyLedger();
    acquireSwitchLease(ledger, identity, now);
    expect(
      checkSwitch(
        ledger,
        { ...evidence, queue: { ...evidence.queue, items: ['old-model-run'] } },
        now
      )
    ).toMatchObject({
      status: 'block',
      reasons: ['queued-model-rollback-risk'],
    });
  });
  it('passes only with idle/drained state and preserved custody', () => {
    const ledger = emptyLedger();
    acquireSwitchLease(ledger, identity, now);
    expect(checkSwitch(ledger, evidence, now).status).toBe('pass');
    const result = checkSwitch(
      ledger,
      {
        ...evidence,
        threadIdle: false,
        unfinishedWriterIds: ['writer'],
        backgroundJobIds: ['job'],
        children: { preserved: false, ids: ['child'] },
        watches: { preserved: false, ids: ['watch'] },
        uncertainMutationIds: ['write'],
      },
      now
    );
    expect(result.reasons).toEqual([
      'thread-not-idle',
      'unfinished-writers',
      'background-jobs',
      'child-custody-unpreserved',
      'watch-custody-unpreserved',
      'uncertain-mutations',
    ]);
  });
  it('blocks competing attempts and records expired lease takeover', () => {
    const ledger = emptyLedger();
    acquireSwitchLease(ledger, identity, now);
    expect(
      acquireSwitchLease(ledger, { ...identity, attemptId: 'attempt-2' }, now)
        .status
    ).toBe('block');
    expect(
      checkSwitch(ledger, { ...evidence, attemptId: 'attempt-2' }, now).reasons
    ).toContain('switch-lease-other-attempt');
    const later = new Date(now.getTime() + 31_000);
    expect(
      checkSwitch(
        ledger,
        { ...evidence, observedAt: later.toISOString() },
        later
      ).reasons
    ).toContain('switch-lease-expired');
    expect(
      acquireSwitchLease(ledger, { ...identity, attemptId: 'attempt-2' }, later)
        .status
    ).toBe('acquired');
    expect(
      acquireSwitchLease(ledger, { ...identity, pid: 999 }, later).status
    ).toBe('block');
    expect(ledger.leaseHistory.map((x) => x.action)).toEqual([
      'acquire',
      'expired-takeover',
      'acquire',
    ]);
    releaseSwitchLease(ledger, identity, later);
    expect(ledger.leases[0]?.attemptId).toBe('attempt-2');
  });
  it('allows shared accounts across threads but serializes all targets on one thread', () => {
    const ledger = emptyLedger();
    acquireSwitchLease(ledger, identity, now);
    expect(
      acquireSwitchLease(
        ledger,
        { ...identity, threadId: 'mastermind', attemptId: 'other' },
        now
      ).status
    ).toBe('acquired');
    expect(
      acquireSwitchLease(
        ledger,
        { ...identity, accountKey: 'claude:account:other', attemptId: 'other' },
        now
      ).status
    ).toBe('block');
  });
  it('releases idempotently and rejects stale or incomplete queue evidence', () => {
    const ledger = emptyLedger();
    acquireSwitchLease(ledger, identity, now);
    expect(
      checkSwitch(
        ledger,
        {
          ...evidence,
          queue: { ...evidence.queue, complete: false },
          observedAt: '2026-10-23T00:00:00Z',
        },
        now
      ).reasons
    ).toEqual(['switch-evidence-stale', 'queue-evidence-incomplete']);
    expect(releaseSwitchLease(ledger, identity, now).replay).toBe(false);
    expect(releaseSwitchLease(ledger, identity, now).replay).toBe(true);
  });
});
