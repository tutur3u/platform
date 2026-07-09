import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkEducationWorkspaceAccess,
  EDUCATION_ATTEMPTS_WORKSPACE_PERMISSION,
  EDUCATION_WORKSPACE_PERMISSION,
} from './access';

const mocks = vi.hoisted(() => {
  const createAdminClient = vi.fn();
  const getPermissions = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const verifyWorkspaceMembershipType = vi.fn();
  const workspaceSecretMaybeSingle = vi.fn();

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table !== 'workspace_secrets') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: workspaceSecretMaybeSingle,
            })),
          })),
        })),
      };
    }),
  };

  const sessionSupabase = {};

  return {
    adminSupabase,
    createAdminClient,
    getPermissions,
    normalizeWorkspaceId,
    sessionSupabase,
    verifyWorkspaceMembershipType,
    workspaceSecretMaybeSingle,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

function withPermissions(permissions: string[]) {
  return {
    withoutPermission: (permission: string) =>
      !permissions.includes(permission),
  };
}

describe('checkEducationWorkspaceAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue(mocks.adminSupabase);
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-normalized');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      ok: true,
      membershipType: 'MEMBER',
    });
    mocks.workspaceSecretMaybeSingle.mockResolvedValue({
      data: { value: 'true' },
      error: null,
    });
    mocks.getPermissions.mockResolvedValue(
      withPermissions([EDUCATION_WORKSPACE_PERMISSION])
    );
  });

  it('allows members when education is enabled and ai_lab is granted', async () => {
    const access = await checkEducationWorkspaceAccess({
      context: {
        user: { id: 'user-1' } as never,
        supabase: mocks.sessionSupabase as never,
      },
      wsId: 'ws-1',
    });

    expect(access.ok).toBe(true);
    if (!access.ok) return;
    expect(access.normalizedWsId).toBe('ws-normalized');
    expect(access.sbAdmin).toBe(mocks.adminSupabase);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: { id: 'user-1' },
      wsId: 'ws-normalized',
    });
  });

  it('blocks members without ai_lab even when they belong to the workspace', async () => {
    mocks.getPermissions.mockResolvedValue(withPermissions([]));

    const access = await checkEducationWorkspaceAccess({
      context: {
        user: { id: 'user-1' } as never,
        supabase: mocks.sessionSupabase as never,
      },
      wsId: 'ws-1',
    });

    expect(access.ok).toBe(false);
    if (access.ok) return;
    expect(access.response.status).toBe(403);
    await expect(access.response.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
  });

  it('supports stricter education data permissions for attempt metadata', async () => {
    mocks.getPermissions.mockResolvedValue(
      withPermissions([EDUCATION_ATTEMPTS_WORKSPACE_PERMISSION])
    );

    const access = await checkEducationWorkspaceAccess({
      context: {
        user: { id: 'user-1' } as never,
        supabase: mocks.sessionSupabase as never,
      },
      permission: EDUCATION_ATTEMPTS_WORKSPACE_PERMISSION,
      wsId: 'ws-1',
    });

    expect(access.ok).toBe(true);
  });

  it('blocks workspaces without the education feature flag before checking permissions', async () => {
    mocks.workspaceSecretMaybeSingle.mockResolvedValue({
      data: { value: 'false' },
      error: null,
    });

    const access = await checkEducationWorkspaceAccess({
      context: {
        user: { id: 'user-1' } as never,
        supabase: mocks.sessionSupabase as never,
      },
      wsId: 'ws-1',
    });

    expect(access.ok).toBe(false);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    if (access.ok) return;
    expect(access.response.status).toBe(404);
    await expect(access.response.json()).resolves.toEqual({
      message: 'Education is not enabled for this workspace',
    });
  });
});
