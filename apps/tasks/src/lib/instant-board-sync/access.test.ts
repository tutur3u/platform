import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({
      rpc: (name: string, args: Record<string, unknown>) => ({
        abortSignal: () => mocks.rpc(name, args),
      }),
    }),
  }),
}));

const pilotWorkspace = 'aaaaaaaa-0000-4000-8000-000000000001';
const otherWorkspace = 'aaaaaaaa-0000-4000-8000-000000000002';
const userId = 'bbbbbbbb-0000-4000-8000-000000000001';

function snapshot(rules: Record<string, unknown>[]) {
  return {
    data: {
      environment: 'production',
      version: '0123456789abcdef0123456789abcdef',
      rules,
    },
    error: null,
  };
}

const rolloutRule = {
  flagKey: 'TASKS_INSTANT_BOARD_SYNC',
  scope: 'platform',
  subjectId: null,
  mode: 'rollout',
  percentage: 0,
  allowWorkspaceIds: [pilotWorkspace],
  allowUserIds: [],
  revision: 1,
};

async function load() {
  vi.resetModules();
  return import('./access');
}

beforeEach(() => {
  mocks.rpc.mockReset();
  vi.stubEnv('VERCEL_ENV', 'production');
});

describe('isInstantBoardSyncEnabled', () => {
  it('is off without a platform rule and never reads subject rules', async () => {
    mocks.rpc.mockResolvedValue(snapshot([]));
    const { isInstantBoardSyncEnabled } = await load();

    for (let i = 0; i < 5; i++) {
      await expect(
        isInstantBoardSyncEnabled({ userId, workspaceId: pilotWorkspace })
      ).resolves.toBe(false);
    }

    // One cached platform snapshot for all board loads; no per-load query.
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('feature_flag_read_snapshot', {
      p_environment: 'production',
    });
  });

  it('enables only allow-listed pilot workspaces from the platform rule', async () => {
    mocks.rpc.mockResolvedValue(snapshot([rolloutRule]));
    const { isInstantBoardSyncEnabled } = await load();

    await expect(
      isInstantBoardSyncEnabled({ userId, workspaceId: pilotWorkspace })
    ).resolves.toBe(true);
    await expect(
      isInstantBoardSyncEnabled({ userId, workspaceId: otherWorkspace })
    ).resolves.toBe(false);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).not.toContain(
      'feature_flag_read_subject_rules'
    );
  });

  it('stays off when the rule store cannot be read', async () => {
    mocks.rpc.mockRejectedValue(new Error('store down'));
    const { isInstantBoardSyncEnabled } = await load();
    await expect(
      isInstantBoardSyncEnabled({ userId, workspaceId: pilotWorkspace })
    ).resolves.toBe(false);
  });
});
