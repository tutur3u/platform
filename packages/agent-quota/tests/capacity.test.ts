import { describe, expect, it } from 'vitest';
import { accountKey, recordObservation } from '../src/admission';
import { createBlock, matchingBlocks } from '../src/block-ledger';
import { completedFailureClass, failureClass } from '../src/failure-receipt';
import { emptyLedger } from '../src/hook-ledger';
import { pruneLedger } from '../src/ledger-retention';
import { gateDecision } from '../src/positional-admit';
import { applyRecoveryReceipt } from '../src/recovery';
import type { AccountUsage } from '../src/types';

const now = new Date('2026-10-23T05:30:00Z');
const account: AccountUsage = {
  instanceId: 'antigravity',
  provider: 'antigravity',
  label: 'fixture',
  available: true,
  models: ['gemini-3.8-flash-low', 'gemini-4-argon-high'],
  windows: [
    {
      kind: 'short',
      usedPercent: 0,
      observedAt: now.toISOString(),
      resetsAt: '2026-10-24T00:00:00Z',
      source: 'fixture',
      authoritative: true,
    },
  ],
};
const message = 'Selected model is at capacity';
describe('model-only provider capacity cooldown', () => {
  it('classifies the completed assistant receipt as capacity, never usage quota', () => {
    expect(failureClass(message)).toBe('capacity');
    expect(completedFailureClass(message)).toBe('capacity');
  });
  it('records an exact model block with a default thirty-minute next eligibility', () => {
    const block = createBlock({
      pool: 'antigravity',
      modelScope: 'gemini-3.8-flash-low',
      reason: message,
      evidence: 'thread/run/capacity',
      observedAt: now.toISOString(),
    });
    expect(block).toMatchObject({
      kind: 'capacity',
      nextEligibleAt: '2026-10-23T06:00:00.000Z',
    });
    expect(block.resetAt).toBeUndefined();
    expect(
      matchingBlocks([block], ['antigravity'], 'gemini-3.8-flash-low', now)
    ).toHaveLength(1);
    expect(
      matchingBlocks([block], ['antigravity'], 'gemini-4-argon-high', now)
    ).toHaveLength(0);
    expect(
      matchingBlocks(
        [block],
        ['antigravity'],
        'gemini-3.8-flash-low',
        new Date('2026-10-23T06:00:00Z')
      )
    ).toHaveLength(0);
  });
  it('rejects whole-pool capacity blocks and quota-reset semantics', () => {
    const input = {
      pool: 'antigravity',
      modelScope: '*',
      reason: message,
      evidence: 'receipt',
      observedAt: now.toISOString(),
    };
    expect(() => createBlock(input)).toThrow(
      'capacity-requires-exact-model-and-next-eligible'
    );
    expect(() =>
      createBlock({
        ...input,
        modelScope: 'gemini-3.8-flash-low',
        resetAt: '2026-10-23T06:00:00Z',
      })
    ).toThrow('capacity-requires-exact-model-and-next-eligible');
  });
  it('blocks only the observed model in admission and expires independently of quota', () => {
    const context = {
      accounts: [account],
      active: [],
      ledger: emptyLedger(),
      now,
    };
    applyRecoveryReceipt(
      {
        failureClass: 'capacity',
        providerInstanceId: 'antigravity',
        model: 'gemini-3.8-flash-low',
        failureObservedAt: now.toISOString(),
        recoveryAdmissionKey: 'thread-run-capacity',
      },
      context
    );
    expect(context.ledger.observations[0]).toMatchObject({
      outcome: 'capacity-error',
      model: 'gemini-3.8-flash-low',
      nextEligibleAt: '2026-10-23T06:00:00.000Z',
    });
    expect(
      gateDecision('antigravity', 'gemini-3.8-flash-low', context)
    ).toMatchObject({
      exitCode: 3,
      reasons: expect.arrayContaining(['capacity-cooldown']),
    });
    expect(
      gateDecision('antigravity', 'gemini-4-argon-high', context).exitCode
    ).toBe(0);
    const later = new Date(now.getTime() + 30 * 60_000);
    const fresh = {
      ...account,
      windows: account.windows.map((w) => ({
        ...w,
        observedAt: later.toISOString(),
      })),
    };
    pruneLedger(context.ledger, later);
    expect(context.ledger.observations).toHaveLength(0);
    expect(
      gateDecision('antigravity', 'gemini-3.8-flash-low', {
        ...context,
        accounts: [fresh],
        now: later,
      }).exitCode
    ).toBe(0);
  });
  it('requires a model for a directly observed capacity event', () => {
    expect(() =>
      recordObservation(emptyLedger(), {
        eventId: 'capacity',
        instanceId: account.instanceId,
        accountKey: accountKey(account),
        outcome: 'capacity-error',
        observedAt: now.toISOString(),
      })
    ).toThrow('capacity-model-required');
  });
});
