import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireMindAccess } from './access';

const mocks = vi.hoisted(() => ({
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

describe('requireMindAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: 'MEMBER',
      ok: true,
    });
  });

  it('keeps personal workspace normalization on the shared helper', async () => {
    const supabase = { from: vi.fn() };
    mocks.normalizeWorkspaceId.mockResolvedValue('personal-ws-id');

    const access = await requireMindAccess({
      context: {
        supabase: supabase as never,
        user: {
          email: 'agent@tuturuuu.com',
          id: 'user-1',
        } as SupabaseUser,
      },
      request: new Request(
        'https://mind.tuturuuu.com/api/v1/workspaces/personal/mind/boards'
      ),
      wsId: 'personal',
    });

    expect(access).toEqual({ normalizedWsId: 'personal-ws-id', ok: true });
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      supabase,
      undefined
    );
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      requiredType: 'MEMBER',
      supabase,
      userId: 'user-1',
      wsId: 'personal-ws-id',
    });
  });

  it('keeps non-personal workspace normalization on the shared helper', async () => {
    const supabase = { from: vi.fn() };
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-id');

    const access = await requireMindAccess({
      context: {
        supabase: supabase as never,
        user: {
          email: 'agent@tuturuuu.com',
          id: 'user-1',
        } as SupabaseUser,
      },
      request: new Request(
        'https://mind.tuturuuu.com/api/v1/workspaces/workspace-handle/mind/boards'
      ),
      wsId: 'workspace-handle',
    });

    expect(access).toEqual({ normalizedWsId: 'workspace-id', ok: true });
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'workspace-handle',
      supabase,
      undefined
    );
  });

  it('allows non-internal accounts when workspace membership is valid', async () => {
    const supabase = { from: vi.fn() };
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-id');

    const access = await requireMindAccess({
      context: {
        supabase: supabase as never,
        user: {
          email: 'customer@example.com',
          id: 'user-1',
        } as SupabaseUser,
      },
      request: new Request(
        'https://mind.tuturuuu.com/api/v1/workspaces/workspace-handle/mind/boards'
      ),
      wsId: 'workspace-handle',
    });

    expect(access).toEqual({ normalizedWsId: 'workspace-id', ok: true });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      requiredType: 'MEMBER',
      supabase,
      userId: 'user-1',
      wsId: 'workspace-id',
    });
  });

  it('still denies accounts without workspace membership', async () => {
    const supabase = { from: vi.fn() };
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-id');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: null,
      ok: false,
    });

    const access = await requireMindAccess({
      context: {
        supabase: supabase as never,
        user: {
          email: 'customer@example.com',
          id: 'user-1',
        } as SupabaseUser,
      },
      request: new Request(
        'https://mind.tuturuuu.com/api/v1/workspaces/workspace-handle/mind/boards'
      ),
      wsId: 'workspace-handle',
    });

    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.response.status).toBe(403);
      await expect(access.response.json()).resolves.toEqual({
        error: 'Workspace access denied',
      });
    }
  });
});
