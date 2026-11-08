import { describe, expect, it } from 'vitest';
import { cookieConsentBanner, evaluateFlags, registry } from './index';
import {
  applyFeatureFlagMutation,
  emptyLedger,
  reconcileOperation,
  retryKnownOperation,
  type MutationCommand,
} from './runtime-state';

const actor = '11111111-1111-4111-8111-111111111111';
const now = '2026-11-09T10:00:00.000Z';
const allow = () => true;
const options = { allowActor: allow, now };

function command(overrides: Partial<MutationCommand> = {}): MutationCommand {
  return {
    actorId: actor,
    environment: 'production',
    expectedRevision: 0,
    flagKey: 'mobile_offline',
    operationId: '22222222-2222-4222-8222-222222222222',
    overrideEnabled: true,
    ...overrides,
  };
}

describe('platform feature flag mutation', () => {
  it('rejects a missing actor, a forged actor, time, and workspace before any write', () => {
    let ledger = emptyLedger();
    for (const extra of [
      { bodyActorId: actor },
      { bodyTime: now },
      { bodyWorkspaceId: '33333333-3333-4333-8333-333333333333' },
    ]) {
      const result = applyFeatureFlagMutation(ledger, command(extra), options);
      ledger = result.ledger;
      expect(result.outcome.status).toBe('rejected');
      expect(result.outcome.storage).toBe(false);
    }
    const denied = applyFeatureFlagMutation(ledger, command(), {
      ...options,
      allowActor: () => false,
    });
    expect(denied.outcome).toMatchObject({ code: 'denied', storage: false });
    expect(denied.ledger).toEqual(emptyLedger());
  });

  it('rejects unknown keys, cookie consent, both read-only families, and unknown environments', () => {
    const cases = [
      { flagKey: 'not_a_flag', code: 'unknown_flag' },
      { flagKey: cookieConsentBanner.key, code: 'unknown_flag' },
      { flagKey: 'ENABLE_AI', code: 'read_only_workspace_secret' },
      { flagKey: 'newsletter_sending', code: 'read_only_workspace_secret' },
      {
        flagKey: 'MOBILE_TASK_DESCRIPTION_EDITING_ENABLED',
        code: 'read_only_mobile_build',
      },
      { environment: 'preview', code: 'unknown_environment' },
    ];
    for (const item of cases) {
      const result = applyFeatureFlagMutation(
        emptyLedger(),
        command(item),
        options
      );
      expect(result.outcome).toMatchObject({ code: item.code, storage: false });
      expect(result.ledger.states).toHaveLength(0);
      expect(result.ledger.audits).toHaveLength(0);
    }
  });

  it('commits state and the exact actor, time, old, and new audit together', () => {
    const result = applyFeatureFlagMutation(emptyLedger(), command(), options);
    expect(result.outcome).toMatchObject({
      newOverride: true,
      newRevision: 1,
      oldOverride: null,
      oldRevision: 0,
      status: 'applied',
      storage: true,
    });
    expect(result.ledger.states).toEqual([
      expect.objectContaining({
        actorId: actor,
        overrideEnabled: true,
        revision: 1,
        updatedAt: now,
      }),
    ]);
    expect(result.ledger.audits).toEqual([
      expect.objectContaining({
        actorId: actor,
        newOverride: true,
        occurredAt: now,
        oldOverride: null,
        oldRevision: 0,
        newRevision: 1,
      }),
    ]);
  });

  it('rolls back when the audit write fails and writes no audit when state fails', () => {
    const auditFailed = applyFeatureFlagMutation(emptyLedger(), command(), {
      ...options,
      failAudit: true,
    });
    expect(auditFailed.ledger).toEqual(emptyLedger());
    expect(auditFailed.outcome).toMatchObject({
      code: 'failed_audit',
      storage: false,
    });
    const stateFailed = applyFeatureFlagMutation(emptyLedger(), command(), {
      ...options,
      failState: true,
    });
    expect(stateFailed.ledger).toEqual(emptyLedger());
    expect(stateFailed.outcome.code).toBe('failed_state');
  });

  it('lets one of two same-revision requests win and records one audit', () => {
    const first = applyFeatureFlagMutation(
      emptyLedger(),
      command({ operationId: '22222222-2222-4222-8222-222222222222' }),
      options
    );
    const second = applyFeatureFlagMutation(
      first.ledger,
      command({
        operationId: '33333333-3333-4333-8333-333333333333',
        overrideEnabled: false,
      }),
      options
    );
    expect(first.outcome.status).toBe('applied');
    expect(second.outcome).toMatchObject({
      revision: 1,
      status: 'conflict',
      storage: false,
    });
    expect(second.ledger.audits).toHaveLength(1);
    expect(second.ledger.states).toHaveLength(1);
  });

  it('keeps a monotonic revision through reset so recreate cannot win an ABA race', () => {
    const created = applyFeatureFlagMutation(emptyLedger(), command(), options);
    const reset = applyFeatureFlagMutation(
      created.ledger,
      command({
        expectedRevision: 1,
        operationId: '33333333-3333-4333-8333-333333333333',
        overrideEnabled: null,
      }),
      options
    );
    expect(reset.outcome).toMatchObject({
      newRevision: 2,
      oldRevision: 1,
      status: 'applied',
    });
    expect(reset.ledger.states[0]).toMatchObject({
      overrideEnabled: null,
      revision: 2,
    });
    const recreate = applyFeatureFlagMutation(
      reset.ledger,
      command({
        expectedRevision: 0,
        operationId: '44444444-4444-4444-8444-444444444444',
      }),
      options
    );
    expect(recreate.outcome).toMatchObject({ revision: 2, status: 'conflict' });
    expect(recreate.ledger.states[0]?.revision).toBe(2);
    expect(recreate.ledger.audits).toHaveLength(2);
  });

  it('replays an operation id without a second mutation and does not blind-retry', () => {
    const applied = applyFeatureFlagMutation(emptyLedger(), command(), options);
    const replay = retryKnownOperation(applied.ledger, command(), options);
    expect(replay.outcome).toMatchObject({
      matchesRequest: true,
      replayed: true,
      status: 'replayed',
      storage: false,
    });
    expect(replay.ledger.audits).toHaveLength(1);
    const blind = applyFeatureFlagMutation(
      applied.ledger,
      command({ operationId: '55555555-5555-4555-8555-555555555555' }),
      options
    );
    expect(blind.outcome.status).toBe('conflict');
    expect(
      reconcileOperation(applied.ledger, command().operationId)?.newRevision
    ).toBe(1);
    expect(reconcileOperation(emptyLedger(), command().operationId)).toBeNull();
  });

  it('treats an identical stored value as a no-op with no audit', () => {
    const applied = applyFeatureFlagMutation(emptyLedger(), command(), options);
    const again = applyFeatureFlagMutation(
      applied.ledger,
      command({
        expectedRevision: 1,
        operationId: '66666666-6666-4666-8666-666666666666',
      }),
      options
    );
    expect(again.outcome).toMatchObject({ revision: 1, status: 'noop' });
    expect(again.ledger.audits).toHaveLength(1);
  });
});

describe('registry defaults stay fail closed under the master switch', () => {
  it('uses each registry default when storage is missing and still gates offline children', () => {
    expect(evaluateFlags(registry, {})).toEqual(
      Object.fromEntries(registry.map(({ key }) => [key, false]))
    );
    const gated = evaluateFlags(
      registry,
      {},
      {
        mobile_offline: false,
        offline_read_notes: true,
      }
    );
    expect(gated.mobile_offline).toBe(false);
    expect(gated.offline_read_notes).toBe(false);
    const open = evaluateFlags(
      registry,
      {},
      {
        mobile_offline: true,
        offline_read_notes: true,
      }
    );
    expect(open.offline_read_notes).toBe(true);
    expect(open.offline_edit_tasks).toBe(false);
  });
});
