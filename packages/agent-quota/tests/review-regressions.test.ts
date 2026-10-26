import { describe, expect, it } from 'vitest';
import { accountKey, admit } from '../src/admission';
import { completedFailureClass, receiptReset } from '../src/failure-receipt';
import type { ChildSnapshot } from '../src/reconcile-children';
import { applyDescendantReceipts } from '../src/recovery';
import { receiptCovers } from '../src/window-scope';
import { fixture, now, snapshot } from './review-regressions-helpers';

describe('independent review regressions', () => {
  it('quarantines a future ledger receipt per account without blocking other pools', () => {
    const { request, context } = fixture();
    const codex = context.accounts.find((item) => item.instanceId === 'codex')!;
    const future = new Date(context.now.getTime() + 86400_000).toISOString();
    context.ledger.observations.push({
      eventId: 'future-codex-limit',
      instanceId: 'codex',
      accountKey: accountKey(codex),
      outcome: 'usage-limit',
      observedAt: future,
      resetsAt: new Date(context.now.getTime() + 2 * 86400_000).toISOString(),
      model: 'gpt-6.1-sol',
      windowScope: { kind: 'models', modelPrefixes: ['gpt-'] },
    });

    const result = admit(request, context);
    expect(result.chosen?.providerInstanceId).toBe('antigravity');
    expect(result.pools.find((pool) => pool.pool === 'codex')).toMatchObject({
      state: 'UNKNOWN',
    });
    expect(result.pools.find((pool) => pool.pool === 'codex')?.reasons).toEqual(
      expect.arrayContaining(['future-receipt-untrusted'])
    );
    expect(
      result.pools.find((pool) => pool.pool === 'codex')?.reasons
    ).not.toContain('observed-usage-limit');
    expect(context.ledger.observations).toEqual([]);
    expect(context.ledger.futureQuarantines).toHaveProperty(accountKey(codex));
  });
  it('quarantines a future descendant receipt without trusting its reset', () => {
    const { request, context } = fixture();
    const future = new Date(context.now.getTime() + 86400_000).toISOString();
    const codex = context.accounts.find((item) => item.instanceId === 'codex')!;
    codex.windows[0] = {
      ...codex.windows[0]!,
      observedAt: new Date(context.now.getTime() + 1000).toISOString(),
      scope: { kind: 'models', modelPrefixes: ['gpt-'] },
    };
    const futureSnapshot: ChildSnapshot = {
      ...snapshot,
      runs: [
        {
          ...snapshot.runs[0]!,
          id: 'future-run',
          instanceId: 'codex',
          model: 'gpt-6.1-sol',
          rootNodeId: 'future-node',
        },
      ],
      failures: [
        {
          ...snapshot.failures[0]!,
          runId: 'future-run',
          nodeId: 'future-node',
          message: 'Usage Limit Reached. resets in 6 days',
          observedAt: future,
          resetAt: new Date(
            context.now.getTime() + 7 * 86400_000
          ).toISOString(),
        },
      ],
    };

    applyDescendantReceipts(futureSnapshot, context);
    expect(context.ledger.observations).toEqual([]);
    expect(context.ledger.futureQuarantines?.[accountKey(codex)]).toMatchObject(
      {
        latestReceiptAt: future,
        models: ['gpt-6.1-sol'],
        accountWide: false,
      }
    );
    expect(codex.windows).toEqual([]);
    const result = admit(request, context);
    expect(result.pools.find((pool) => pool.pool === 'codex')?.state).toBe(
      'UNKNOWN'
    );
    expect(
      result.pools.find((pool) => pool.pool === 'codex')?.reasons
    ).not.toContain('observed-usage-limit');
  });
  it('applies a completed-run receipt before plain admission despite fresh zero-percent cache', () => {
    const { request, context } = fixture();
    applyDescendantReceipts(snapshot, context);
    const result = admit(request, context);
    expect(result.pools.find((x) => x.pool === 'antigravity')).toMatchObject({
      state: 'EXHAUSTED',
      reasons: expect.arrayContaining(['observed-usage-limit']),
    });
    expect(result.chosen?.providerInstanceId).toBe('codex');
  });
  it('blocks Argon on the completed Antigravity limit receipt despite fresh 3p windows', () => {
    const { request, context } = fixture();
    context.now = new Date('2026-10-25T05:01:00Z');
    context.accounts[1]!.windows = [
      {
        id: '3p-5h',
        label: 'Claude & GPT (shared) · 5-hour',
        scope: { kind: 'models', modelPrefixes: ['claude-', 'gpt-'] },
        kind: 'short',
        providerWindowKind: 'session',
        usedPercent: 0,
        resetsAt: '2026-10-25T10:00:00Z',
        authoritative: true,
        source: 'fixture',
        observedAt: context.now.toISOString(),
      },
      {
        id: '3p-weekly',
        label: 'Claude & GPT (shared) · weekly',
        scope: { kind: 'models', modelPrefixes: ['claude-', 'gpt-'] },
        kind: 'long',
        providerWindowKind: 'weekly',
        usedPercent: 0,
        resetsAt: '2026-10-31T05:00:00Z',
        authoritative: true,
        source: 'fixture',
        observedAt: context.now.toISOString(),
      },
    ];
    const failureAt = '2026-10-25T05:00:00Z';
    applyDescendantReceipts(
      {
        ...snapshot,
        runs: snapshot.runs.map((run) => ({
          ...run,
          completedAt: failureAt,
        })),
        failures: snapshot.failures.map((failure) => ({
          ...failure,
          observedAt: failureAt,
          message:
            'Usage Limit Reached. Your limit will reset in 4 days, 22 hours.',
        })),
      },
      context
    );
    const receipt = context.ledger.observations.find(
      (event) => event.outcome === 'usage-limit'
    );
    expect(receipt).toMatchObject({
      resetsAt: '2026-10-30T03:00:00.000Z',
      windowScope: {
        kind: 'models',
        modelPrefixes: ['gemini-4-argon'],
      },
    });
    expect(receiptCovers(receipt!, 'antigravity', 'gemini-4-argon-high')).toBe(
      true
    );
    expect(receiptCovers(receipt!, 'antigravity', 'gemini-3.8-flash-low')).toBe(
      false
    );
    const result = admit(request, context);
    expect(
      result.pools.find((item) => item.pool === 'antigravity')
    ).toMatchObject({
      state: 'EXHAUSTED',
      reasons: expect.arrayContaining(['observed-usage-limit']),
    });
    expect(result.chosen?.providerInstanceId).toBe('codex');
  });
  it('parses relative resets from observed time and rounds fractional seconds up', () => {
    expect(
      receiptReset('reset in 6 days, 23 hours', '2026-10-23T03:30:38Z')
    ).toBe('2026-10-30T02:30:38.000Z');
    expect(receiptReset('resets in 0.1 seconds', now.toISOString())).toBe(
      '2026-10-23T04:00:01.000Z'
    );
  });
  it('clears unknown-reset exhaustion only with a later fresh covering check', () => {
    const { request, context } = fixture();
    applyDescendantReceipts(
      {
        ...snapshot,
        failures: snapshot.failures.map((x) => ({
          ...x,
          message: 'Usage Limit Reached',
          observedAt: now.toISOString(),
        })),
      },
      context
    );
    expect(
      admit(request, context).pools.find((x) => x.pool === 'antigravity')?.state
    ).toBe('EXHAUSTED');
    context.now = new Date(now.getTime() + 1000);
    context.accounts[1]!.windows[0]!.observedAt = context.now.toISOString();
    expect(
      admit({ ...request, requestId: 'next' }, context).pools.find(
        (x) => x.pool === 'antigravity'
      )?.state
    ).toBe('FRESH');
    context.now = new Date(now.getTime() + 16 * 60000);
    expect(
      admit({ ...request, requestId: 'stale-after-clear' }, context).pools.find(
        (x) => x.pool === 'antigravity'
      )?.state
    ).not.toBe('EXHAUSTED');
  });
  it('does not treat ordinary completed capacity analysis as a provider failure', () => {
    expect(
      completedFailureClass('Implemented capacity-aware routing; tests pass.')
    ).toBeNull();
    expect(
      completedFailureClass('We are currently at capacity. Try again later.')
    ).toBe('capacity');
    expect(
      completedFailureClass("You've hit your session limit · resets 11:20am")
    ).toBe('usage-limit');
  });
});
