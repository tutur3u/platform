import { describe, expect, it } from 'vitest';
import {
  assessFeatureFlagMutation,
  assessFeatureFlagRead,
  boundAuditLimit,
  FEATURE_FLAG_MUTATE_PERMISSION,
  FEATURE_FLAG_READ_PERMISSION,
  httpStatusForMutation,
} from './runtime-access';
import { applyFeatureFlagMutation, emptyLedger } from './runtime-state';
import { catalogFamilyCounts, classifyFlagKey } from './runtime-policy';

const actor = '11111111-1111-4111-8111-111111111111';

const body = {
  environment: 'staging',
  expectedRevision: 0,
  flagKey: 'offline_read_notes',
  operationId: '22222222-2222-4222-8222-222222222222',
  overrideEnabled: true,
};

describe('admin mutation access', () => {
  it('uses one read permission and one mutation permission', () => {
    expect(FEATURE_FLAG_READ_PERMISSION).toBe('view_infrastructure');
    expect(FEATURE_FLAG_MUTATE_PERMISSION).toBe('manage_workspace_roles');
    expect(
      assessFeatureFlagRead({
        authenticated: false,
        canRead: true,
        rootMember: true,
      })
    ).toBe('unauthenticated');
    expect(
      assessFeatureFlagRead({
        authenticated: true,
        canRead: false,
        rootMember: true,
      })
    ).toBe('forbidden');
    expect(
      assessFeatureFlagRead({
        authenticated: true,
        canRead: true,
        rootMember: false,
      })
    ).toBe('forbidden');
  });

  it('denies missing session, non-root, and view-only callers without a command', () => {
    expect(
      assessFeatureFlagMutation({
        authenticated: false,
        body,
        canMutate: true,
        rootMember: true,
        sessionActorId: null,
      }).kind
    ).toBe('unauthenticated');
    expect(
      assessFeatureFlagMutation({
        authenticated: true,
        body,
        canMutate: false,
        rootMember: true,
        sessionActorId: actor,
      }).kind
    ).toBe('forbidden');
    expect(
      assessFeatureFlagMutation({
        authenticated: true,
        body,
        canMutate: true,
        rootMember: false,
        sessionActorId: actor,
      }).kind
    ).toBe('forbidden');
  });

  it('rejects forged body fields before a storage command is returned', () => {
    for (const extra of [
      { actorId: '33333333-3333-4333-8333-333333333333' },
      { occurredAt: '2020-01-01T00:00:00.000Z' },
      { wsId: '33333333-3333-4333-8333-333333333333' },
    ]) {
      const decision = assessFeatureFlagMutation({
        authenticated: true,
        body: { ...body, ...extra },
        canMutate: true,
        rootMember: true,
        sessionActorId: actor,
      });
      expect(decision.kind).toBe('command');
      if (decision.kind !== 'command') continue;
      const applied = applyFeatureFlagMutation(
        emptyLedger(),
        decision.command,
        {
          allowActor: () => true,
          now: '2026-11-09T10:00:00.000Z',
        }
      );
      expect(applied.outcome.status).toBe('rejected');
      expect(applied.ledger).toEqual(emptyLedger());
    }
  });

  it('binds the actor to the session and maps conflict to 409', () => {
    const decision = assessFeatureFlagMutation({
      authenticated: true,
      body,
      canMutate: true,
      rootMember: true,
      sessionActorId: actor,
    });
    expect(decision).toMatchObject({
      kind: 'command',
      command: { actorId: actor, flagKey: 'offline_read_notes' },
    });
    expect(
      httpStatusForMutation({
        code: 'conflict',
        environment: 'staging',
        flagKey: 'offline_read_notes',
        revision: 3,
        status: 'conflict',
        storage: false,
      })
    ).toBe(409);
    expect(boundAuditLimit(undefined)).toBe(50);
    expect(boundAuditLimit(100)).toBe(100);
    expect(boundAuditLimit(101)).toBeNull();
  });
});

describe('catalog families at the pinned base', () => {
  it('keeps every catalog entry and only the registry runtime keys mutable', () => {
    expect(catalogFamilyCounts()).toEqual({
      'mobile-build': 2,
      'mobile-runtime': 16,
      'workspace-secret': 33,
      total: 51,
    });
    expect(classifyFlagKey('mobile_offline')).toEqual({
      family: 'mobile-runtime',
      mutable: true,
    });
    expect(classifyFlagKey('cookie_consent_banner').mutable).toBe(false);
    expect(classifyFlagKey('ENABLE_CHAT').family).toBe('workspace-secret');
  });
});
