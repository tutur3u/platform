import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { accountKey } from '../src/accounts';
import {
  applyFutureQuarantines,
  recordFutureQuarantine,
} from '../src/future-quarantine';
import { checkHandover, type HandoverEvidence } from '../src/handover';
import { emptyLedger, readLedger, transactLedger } from '../src/hook-ledger';
import type { SwitchEvidence } from '../src/hooks-types';
import { pruneLedger } from '../src/ledger-retention';
import { validLedger } from '../src/ledger-validation';
import { applyRecoveryReceipt } from '../src/recovery';
import type { AccountUsage, UsageWindow } from '../src/types';

const now = new Date('2026-10-23T08:00:00Z');
const freshWindow = (family: 'opus' | 'sonnet'): UsageWindow => ({
  kind: 'weekly',
  scope: { kind: 'models', modelFamilies: [family] },
  usedPercent: 20,
  resetsAt: '2026-10-30T08:00:00Z',
  source: 'fixture',
  observedAt: now.toISOString(),
  authoritative: true,
});
const current: AccountUsage = {
  instanceId: 'claude_hehe',
  provider: 'claude',
  label: 'orchestrator',
  available: true,
  models: ['claude-opus-4-6', 'claude-sonnet-4-5'],
  windows: [freshWindow('sonnet')],
};
const switching: SwitchEvidence = {
  threadId: 'owner-thread',
  attemptId: 'attempt',
  accountKey: accountKey(current),
  observedAt: now.toISOString(),
  threadIdle: true,
  queue: { threadId: 'owner-thread', complete: true, items: [] },
  unfinishedWriterIds: [],
  backgroundJobIds: [],
  children: { preserved: true, ids: [] },
  watches: { preserved: true, ids: [] },
  uncertainMutationIds: [],
};
const handover: HandoverEvidence = {
  inThreadSwitchSupported: false,
  successorCount: 0,
  oldWriterDrainedOrStopped: true,
  sourcePreserved: true,
  dirtyFilesPreserved: true,
  indexPreserved: true,
  jobsPreserved: true,
  childParentsPreserved: true,
  questionsPreserved: true,
  watchesPreserved: true,
  unknownWritesPreserved: true,
  bindingVerified: false,
  successorIndependentlyAccepted: false,
  acceptanceRecorded: false,
};

describe('future quarantine follow-ups', () => {
  it('retains the 30-day pruning window when future-quarantine is imported first', () => {
    const ledger = emptyLedger();
    const old = new Date(now.getTime() - 31 * 86400_000).toISOString();
    const lease = {
      threadId: 'thread',
      accountKey: 'account',
      attemptId: 'attempt',
      pid: 123,
      processStartedAt: old,
      acquiredAt: old,
      expiresAt: old,
    };
    ledger.observations.push({
      eventId: 'old-cleared',
      instanceId: 'claude_hehe',
      accountKey: 'account',
      outcome: 'usage-limit',
      observedAt: old,
      clearedAt: old,
    });
    ledger.leaseHistory.push({ action: 'release', at: old, lease });
    ledger.retiredRequests = [{ requestId: 'old-request', retiredAt: old }];

    pruneLedger(ledger, now);

    expect(ledger.observations).toHaveLength(0);
    expect(ledger.leaseHistory).toHaveLength(0);
    expect(ledger.retiredRequests).toHaveLength(0);
  });

  it('treats an invalid long receipt model as account-wide', () => {
    const ledger = emptyLedger();
    const invalidModel = 'x'.repeat(513);
    recordFutureQuarantine(ledger, accountKey(current), now, {
      observedAt: now.toISOString(),
      model: invalidModel,
    });

    expect(ledger.futureQuarantines?.[accountKey(current)]).toMatchObject({
      models: [],
      accountWide: true,
    });
    expect(validLedger(ledger)).toBe(true);
  });

  it('keeps a pool quarantined while a future descendant receipt still exceeds the skew', () => {
    const ledger = emptyLedger();
    const receiptAt = new Date(now.getTime() + 86400_000).toISOString();
    recordFutureQuarantine(ledger, accountKey(current), now, {
      observedAt: receiptAt,
      model: 'claude-opus-4-6',
    });
    const account = {
      ...current,
      windows: [
        {
          ...freshWindow('opus'),
          observedAt: new Date(now.getTime() + 1000).toISOString(),
        },
      ],
    };

    applyFutureQuarantines({ accounts: [account], active: [], ledger, now });

    expect(ledger.futureQuarantines?.[accountKey(current)]).toBeDefined();
    expect(account.windows).toEqual([]);
    expect(account.lastError).toBe('future-receipt-untrusted');
  });

  it('requires the fresh window to cover the quarantined receipt model', () => {
    const ledger = emptyLedger();
    recordFutureQuarantine(
      ledger,
      accountKey(current),
      new Date(now.getTime() - 120_000),
      {
        observedAt: new Date(now.getTime() - 60_000).toISOString(),
        model: 'claude-opus-4-6',
      }
    );
    const account = { ...current, windows: [freshWindow('sonnet')] };

    applyFutureQuarantines({ accounts: [account], active: [], ledger, now });

    expect(ledger.futureQuarantines?.[accountKey(current)]).toBeDefined();
    expect(account.windows).toEqual([]);

    account.windows = [freshWindow('opus')];
    applyFutureQuarantines({ accounts: [account], active: [], ledger, now });
    expect(ledger.futureQuarantines?.[accountKey(current)]).toBeUndefined();
    expect(account.windows).toHaveLength(1);
  });

  it('does not let a Sonnet-only window clear mixed unknown-scope and Sonnet receipts', () => {
    const ledger = emptyLedger();
    const key = accountKey(current);
    recordFutureQuarantine(ledger, key, new Date(now.getTime() - 120_000), {
      observedAt: new Date(now.getTime() - 90_000).toISOString(),
    });
    recordFutureQuarantine(ledger, key, new Date(now.getTime() - 120_000), {
      observedAt: new Date(now.getTime() - 60_000).toISOString(),
      model: 'claude-sonnet-4-5',
    });
    const account = { ...current, windows: [freshWindow('sonnet')] };

    applyFutureQuarantines({ accounts: [account], active: [], ledger, now });

    expect(ledger.futureQuarantines?.[key]).toMatchObject({
      accountWide: true,
      models: ['claude-sonnet-4-5'],
    });
    expect(account.windows).toEqual([]);
  });

  it('does not report a quarantined owner as healthy in handover checks', () => {
    const ledger = emptyLedger();
    recordFutureQuarantine(ledger, accountKey(current), now, {
      observedAt: new Date(now.getTime() + 86400_000).toISOString(),
      model: 'claude-opus-4-6',
    });

    const result = checkHandover(
      ledger,
      { ...current },
      switching,
      handover,
      now
    );

    expect(result.path).not.toBe('stay');
    expect(result.reasons).not.toContain('current-account-healthy');
  });

  it('keeps the quota guidance free of machine-local skill links', () => {
    const reference = readFileSync(
      new URL(
        '../../../plugins/tuturuuu/skills/tuturuuu-agent-coordination/references/program-orchestration.md',
        import.meta.url
      ),
      'utf8'
    );
    const quotaSection = reference.split('## Quota-aware delegation')[1];
    expect(quotaSection).toBeDefined();
    expect(quotaSection).not.toMatch(
      /\]\(~\/\.codex\/skills\/pstack-t3-workflow/
    );
  });

  it('sanitizes malformed receipt timestamps and refuses to persist invalid ledgers', async () => {
    const ledger = emptyLedger();
    applyRecoveryReceipt(
      {
        failureClass: 'usage-limit',
        providerInstanceId: current.instanceId,
        failureObservedAt: 'not-a-date',
        model: 'claude-opus-4-6',
      },
      { accounts: [{ ...current }], active: [], ledger, now }
    );
    expect(ledger.futureQuarantines?.[accountKey(current)]).toMatchObject({
      latestReceiptAt: now.toISOString(),
      accountWide: true,
    });
    expect(validLedger(ledger)).toBe(true);

    const dir = await mkdtemp(join(tmpdir(), 'quota-ledger-invalid-write-'));
    try {
      await expect(
        transactLedger((value) => {
          value.futureQuarantines = {
            invalid: {
              quarantinedAt: 'not-a-date',
              latestReceiptAt: now.toISOString(),
              models: [],
              accountWide: true,
            },
          };
        }, dir)
      ).rejects.toThrow('ledger-invalid');
      expect(await readLedger(dir)).toMatchObject({
        version: 1,
        observations: [],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps a far-future receipt blocked inside the 30-day quarantine bound', () => {
    const ledger = emptyLedger();
    const startedAt = new Date(now.getTime() - 29 * 86400_000);
    recordFutureQuarantine(ledger, accountKey(current), startedAt, {
      observedAt: new Date(now.getTime() + 365 * 86400_000).toISOString(),
      model: 'claude-opus-4-6',
    });
    const account = { ...current, windows: [freshWindow('opus')] };

    applyFutureQuarantines({ accounts: [account], active: [], ledger, now });

    expect(ledger.futureQuarantines?.[accountKey(current)]).toBeDefined();
    expect(account.windows).toEqual([]);
  });

  it('lifts a source-less quarantine after the 30-day bound', () => {
    const ledger = emptyLedger();
    const startedAt = new Date(now.getTime() - 31 * 86400_000);
    recordFutureQuarantine(ledger, accountKey(current), startedAt, {
      observedAt: new Date(now.getTime() + 365 * 86400_000).toISOString(),
      model: 'claude-opus-4-6',
    });
    const account = { ...current, windows: [freshWindow('sonnet')] };

    applyFutureQuarantines({ accounts: [account], active: [], ledger, now });

    expect(ledger.futureQuarantines?.[accountKey(current)]).toBeUndefined();
    expect(account.windows).toHaveLength(1);
  });
});
