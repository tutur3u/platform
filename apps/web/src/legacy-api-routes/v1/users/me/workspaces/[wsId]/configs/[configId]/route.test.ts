import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn();
const resolveAuthenticatedSessionUser = vi.fn();
const normalizeWorkspaceId = vi.fn();
const verifyWorkspaceMembershipType = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient,
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

describe('user workspace config route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    createClient.mockResolvedValue({});
    resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
      authError: null,
    });
    normalizeWorkspaceId.mockResolvedValue('workspace-1');
    verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('deletes the workspace override when the value is null', async () => {
    const route = await import(
      '@/legacy-api-routes/v1/users/me/workspaces/[wsId]/configs/[configId]/route'
    );
    const query = {
      delete: vi.fn(() => query),
      eq: vi.fn(() => query),
      error: null,
    };
    createClient.mockResolvedValue({
      from: vi.fn(() => query),
    });

    const response = await route.PUT(
      new NextRequest(
        'http://localhost/api/v1/users/me/workspaces/personal/configs/SIDEBAR_NAVIGATION_LAYOUT',
        {
          method: 'PUT',
          body: JSON.stringify({ value: null }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'personal',
          configId: 'SIDEBAR_NAVIGATION_LAYOUT',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('ws_id', 'workspace-1');
    expect(query.eq).toHaveBeenCalledWith('id', 'SIDEBAR_NAVIGATION_LAYOUT');
  });
});
