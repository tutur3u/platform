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

function createQuery(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    select: vi.fn(() => query),
  };

  return query;
}

describe('requireMindAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: 'MEMBER',
      ok: true,
    });
  });

  it('resolves personal workspace from the verified app-session user', async () => {
    const workspaceQuery = createQuery({
      data: { id: 'personal-ws-id' },
      error: null,
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== 'workspaces') {
          throw new Error(`Unexpected table ${table}`);
        }

        return workspaceQuery;
      }),
    };

    mocks.normalizeWorkspaceId.mockRejectedValue(
      new Error('admin app-session client has no auth user')
    );

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
    expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
    expect(workspaceQuery.eq).toHaveBeenCalledWith('personal', true);
    expect(workspaceQuery.eq).toHaveBeenCalledWith(
      'workspace_members.user_id',
      'user-1'
    );
    expect(workspaceQuery.eq).toHaveBeenCalledWith(
      'workspace_members.type',
      'MEMBER'
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
});
