import { describe, expect, it } from 'vitest';
import { admit } from '../src/admission';
import { emptyLedger } from '../src/hook-ledger';
import type { AdmissionRequest } from '../src/hooks-types';
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
describe('planning preference is not capacity', () => {
  it('orders equal healthy pools toward Codex and suggests only supported effort', () => {
    const { request, context } = fixture();
    expect(admit(request, context)).toMatchObject({
      chosen: { providerInstanceId: 'codex' },
      suggestedOptions: { reasoningEffort: 'low' },
    });
  });
  it('allows configured preference without overriding exhaustion', () => {
    const { request, context } = fixture();
    request.policy.preferenceWeights = { codex: 100 };
    context.accounts[1] = pool('codex', 'codex', 100);
    expect(admit(request, context)).toMatchObject({
      chosen: { providerInstanceId: 'claude' },
    });
  });
  it('bounds unknown preferred pools and keeps healthy pools first', () => {
    const { request, context } = fixture();
    request.policy.preferenceWeights = { codex: 100 };
    context.accounts[1] = { ...pool('codex', 'codex'), windows: [] };
    expect(admit(request, context)).toMatchObject({
      chosen: { providerInstanceId: 'claude' },
    });
    request.requirements.privacyApprovedInstanceIds = ['codex'];
    expect(admit({ ...request, requestId: 'unknown-1' }, context).status).toBe(
      'admit'
    );
    expect(admit({ ...request, requestId: 'unknown-2' }, context).status).toBe(
      'block'
    );
  });
  it('reviewer independence beats the preferred author pool', () => {
    const { request, context } = fixture();
    request.requirements.capability = 'review';
    request.requirements.authorInstanceId = 'codex';
    request.policy.preferenceWeights = { codex: 100 };
    expect(admit(request, context)).toMatchObject({
      chosen: { providerInstanceId: 'claude' },
    });
  });
  it('applies one preference per shared account, never sums alias weights', () => {
    const { request, context } = fixture();
    const alias = {
      ...pool('alias', 'codex'),
      accountIdentityHash: pool('codex', 'codex').accountIdentityHash,
    };
    context.accounts.push(alias);
    request.policy.preferenceWeights = { codex: 4, alias: 4 };
    const result = admit(request, context);
    expect(
      result.pools.find((x) => x.instanceIds.includes('codex'))
    ).toMatchObject({ preferenceWeight: 4 });
    expect(
      result.pools.filter((x) => x.instanceIds.includes('codex'))
    ).toHaveLength(1);
  });
});
