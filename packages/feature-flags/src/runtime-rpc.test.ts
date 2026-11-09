import { describe, expect, it, vi } from 'vitest';
import {
  commitFeatureFlagRpc,
  commitPlatformFeatureFlagMutation,
  interpretAdminAuditRead,
  interpretAdminStateRead,
  interpretRuntimeRead,
} from './runtime-rpc';
import type { MutationCommand } from './runtime-state';

const operationId = '33333333-3333-4333-8333-333333333333';

function command(overrides: Partial<MutationCommand> = {}): MutationCommand {
  return {
    actorId: '44444444-4444-4444-8444-444444444444',
    environment: 'production',
    expectedRevision: 0,
    flagKey: 'mobile_offline',
    operationId,
    overrideEnabled: true,
    ...overrides,
  };
}

describe('feature flag rpc commit', () => {
  it('does not call storage when the command is rejected', async () => {
    const call = vi.fn();
    const forged = await commitPlatformFeatureFlagMutation({
      allowActor: () => true,
      call,
      command: command({ bodyActorId: 'present' }),
    });
    const readonly = await commitPlatformFeatureFlagMutation({
      allowActor: () => true,
      call,
      command: command({ flagKey: 'ENABLE_AI' }),
    });
    const denied = await commitPlatformFeatureFlagMutation({
      allowActor: () => false,
      call,
      command: command(),
    });
    expect(call).not.toHaveBeenCalled();
    expect(forged).toMatchObject({
      outcome: { code: 'forged_actor', storage: false },
    });
    expect(readonly).toMatchObject({
      outcome: { code: 'read_only_workspace_secret', storage: false },
    });
    expect(denied).toMatchObject({
      outcome: { code: 'denied', storage: false },
    });
  });

  it('returns unknown after one failed send and does not call again', async () => {
    const call = vi.fn(async () => {
      throw new Error('socket hang up');
    });
    const result = await commitFeatureFlagRpc({
      call,
      operationId,
      rejected: null,
    });
    expect(call).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ operationId, status: 'unknown' });
  });

  it('treats a partial success payload as unknown and a denial as denial', async () => {
    const partial = await commitFeatureFlagRpc({
      call: async () => ({ data: { status: 'applied' }, error: null }),
      operationId,
      rejected: null,
    });
    const denied = await commitFeatureFlagRpc({
      call: async () => ({
        data: null,
        error: { message: 'platform_feature_flag_denied' },
      }),
      operationId,
      rejected: null,
    });
    expect(partial).toEqual({ operationId, status: 'unknown' });
    expect(denied).toMatchObject({
      outcome: { code: 'denied', storage: false },
    });
  });

  it('keeps admin failure, runtime denial, and runtime defaults apart', () => {
    expect(
      interpretAdminStateRead({
        data: null,
        error: { message: 'platform_feature_flag_denied' },
      })
    ).toEqual({ status: 'denied' });
    expect(
      interpretAdminStateRead({
        data: {
          overrides: [
            { flagKey: 'mobile_offline', overrideEnabled: false, revision: 1 },
          ],
        },
        error: null,
      })
    ).toEqual({ status: 'unavailable' });
    expect(
      interpretRuntimeRead({ data: { overrides: [] }, error: null })
    ).toEqual({
      overrides: [],
      status: 'ready',
    });
    expect(
      interpretRuntimeRead({
        data: { overrides: [{ flagKey: 1 }] },
        error: null,
      })
    ).toEqual({ status: 'invalid' });
    expect(
      interpretRuntimeRead({
        data: null,
        error: { code: '08006', message: 'closed' },
      })
    ).toEqual({ status: 'unreachable' });
    expect(
      interpretAdminAuditRead({ data: { rows: [] }, error: null })
    ).toEqual({
      rows: [],
      status: 'ready',
    });
  });
  it('rejects a mixed admin snapshot containing an undeclared environment', () => {
    const row = {
      flagKey: 'mobile_offline',
      overrideEnabled: false,
      revision: 1,
    };
    const valid = { ...row, environment: 'production' };
    expect(
      interpretAdminStateRead({ data: { overrides: [valid] }, error: null })
    ).toEqual({ overrides: [valid], status: 'ready' });
    for (const environment of ['preview', undefined]) {
      expect(
        interpretAdminStateRead({
          data: { overrides: [valid, { ...row, environment }] },
          error: null,
        })
      ).toEqual({ status: 'unavailable' });
    }
  });
});
