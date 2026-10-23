import { describe, expect, it } from 'vitest';
import { admit } from '../src/admission';
import { receiptReset } from '../src/failure-receipt';
import { emptyLedger } from '../src/hook-ledger';
import type { AdmissionRequest } from '../src/hooks-types';
import { type RerouteEvidence, reroutePlan } from '../src/reroute-plan';
import type { AccountUsage } from '../src/types';

const now = new Date('2026-10-23T01:00:00Z');
function pool(
  instanceId: string,
  provider: AccountUsage['provider'],
  usedPercent = 20
): AccountUsage {
  return {
    instanceId,
    provider,
    label: instanceId,
    available: true,
    accountIdentityHash: instanceId.padEnd(64, '0'),
    models: ['model'],
    modelOptions: {
      model: [{ id: 'reasoningEffort', values: ['low', 'medium', 'high'] }],
    },
    windows: [
      {
        kind: 'short',
        usedPercent,
        authoritative: true,
        source: 'fixture',
        observedAt: now.toISOString(),
        resetsAt: '2026-10-23T02:00:00Z',
      },
    ],
  };
}
function fixture() {
  const accounts = [
    pool('owner', 'antigravity', 80),
    pool('codex', 'codex'),
    pool('claude', 'claude'),
  ];
  const request: AdmissionRequest = {
    requestId: 'request',
    threadId: 'owner-thread',
    currentInstanceId: 'owner',
    requirements: {
      capability: 'implementation',
      taskClass: 'mechanical',
      authorizedInstanceIds: accounts.map((x) => x.instanceId),
      privacyApprovedInstanceIds: accounts.map((x) => x.instanceId),
      candidates: accounts.map((x) => ({
        instanceId: x.instanceId,
        model: 'model',
        capabilities: ['implementation', 'review', 'analysis'],
      })),
    },
    policy: {
      orchestratorReservePercent: 30,
      nearUsedPercent: 90,
      unknownMaxConcurrent: 1,
    },
  };
  return {
    request,
    context: { accounts, active: [], ledger: emptyLedger(), now },
  };
}

const entry = {
  threadId: 'child',
  runId: 'run4',
  latestRunId: 'run4',
  failureClass: 'usage-limit',
  providerInstanceId: 'claude',
  failureObservedAt: '2026-10-23T00:59:00Z',
  resetAt: '2026-10-23T02:00:00Z',
  recoveryAdmissionKey: 'receipt',
  switchBlockers: [],
  queuedRuns: [],
  snoozedUntil: '2026-10-23T02:00:00Z',
};
const proof: RerouteEvidence = {
  observedAt: now.toISOString(),
  onlyResetBlocked: true,
  writerPids: [{ pid: 123, state: 'idle-stream-json' }],
  writersComplete: true,
  dirtyFiles: ['a', 'b', 'c', 'd'],
  dirtyFilesPreserved: true,
  custodyPreserved: true,
  uncertainMutations: false,
};
describe('read-only reset reroute planning', () => {
  it('plans saved text and queue cancellation before configuration, preserving dirty files', () => {
    const { request, context } = fixture();
    const before = JSON.stringify(context.ledger);
    const plan = reroutePlan(
      [
        {
          ...entry,
          queuedRuns: [
            { runId: 'run5', providerInstanceId: 'claude', model: 'model' },
          ],
          switchBlockers: ['queued-old-account-risk'],
        },
      ],
      request,
      context,
      { child: proof }
    )[0];
    expect(plan?.status).toBe('plan-ready');
    expect(plan?.operations.slice(0, 2).map((x) => x.operation)).toEqual([
      'read-and-save-queued-text',
      't3_queue_cancel',
    ]);
    expect(plan?.admission.chosen?.providerInstanceId).toBe('codex');
    expect(JSON.stringify(context.ledger)).toBe(before);
  });
  it('blocks active writers', () => {
    const { request, context } = fixture();
    expect(
      reroutePlan([entry], request, context, {
        child: { ...proof, writerPids: [{ pid: 123, state: 'active' }] },
      })[0]?.blockers
    ).toContain('writer-active-or-unverified');
  });
  it('configuration alone is not resumed success', () => {
    const { request, context } = fixture();
    const configured = { providerInstanceId: 'codex', model: 'model' };
    expect(
      reroutePlan([entry], request, context, {
        child: { ...proof, configured },
      })[0]
    ).toMatchObject({ status: 'configured', success: false });
    expect(
      reroutePlan([entry], request, context, {
        child: {
          ...proof,
          configured,
          resumed: {
            ...configured,
            taskId: 'task6',
            runId: 'run6',
            status: 'running',
          },
        },
      })[0]
    ).toMatchObject({ status: 'block', success: false });
  });
  it('blocks when all pools are exhausted', () => {
    const { request, context } = fixture();
    context.accounts = context.accounts.map((x) => ({
      ...x,
      windows: x.windows.map((w) => ({ ...w, usedPercent: 100 })),
    }));
    expect(
      reroutePlan([entry], request, context, { child: proof })[0]?.blockers
    ).toContain('no-eligible-pool');
  });
  it('reviewer independence overrides Codex preference', () => {
    const { request, context } = fixture();
    request.requirements.capability = 'review';
    request.requirements.authorInstanceId = 'codex';
    expect(
      reroutePlan([entry], request, context, { child: proof })[0]?.admission
        .chosen
    ).toBeUndefined();
  });
  it('deduplicates by thread and failed run without reserving; admission commits once', () => {
    const { request, context } = fixture();
    const plans = reroutePlan([entry, entry], request, context, {
      child: proof,
    });
    expect(plans).toHaveLength(1);
    const key = plans[0]?.idempotencyKey;
    if (!key) throw Error('fixture');
    expect(admit({ ...request, requestId: key }, context).status).toBe('admit');
    expect(admit({ ...request, requestId: key }, context).status).toBe('block');
  });
  it('applies the actual failure before choosing from lagging healthy snapshots', () => {
    const { request, context } = fixture();
    request.policy.preferenceWeights = { claude: 100 };
    expect(
      reroutePlan([entry], request, context, { child: proof })[0]?.admission
        .chosen?.providerInstanceId
    ).toBe('codex');
  });
  it('does not interpret unrelated timestamps as resets', () => {
    expect(
      receiptReset('failure at 2026-10-23T01:00:00Z', now.toISOString())
    ).toBeNull();
    expect(
      receiptReset('resets at 2026-10-23T02:00:00Z', now.toISOString())
    ).toBe('2026-10-23T02:00:00.000Z');
  });
});
