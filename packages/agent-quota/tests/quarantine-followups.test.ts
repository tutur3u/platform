import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { accountKey } from '../src/accounts';
import {
  applyFutureQuarantines,
  recordFutureQuarantine,
} from '../src/future-quarantine';
import { checkHandover, type HandoverEvidence } from '../src/handover';
import { emptyLedger } from '../src/hook-ledger';
import type { SwitchEvidence } from '../src/hooks-types';
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
});
