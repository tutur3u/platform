import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (
    ...args: Parameters<typeof mocks.resolveSessionAuthContext>
  ) => mocks.resolveSessionAuthContext(...args),
}));

function permissionsResult(wsId: string, permissions: string[]) {
  return {
    permissions,
    withoutPermission: (permission: string) =>
      !permissions.includes(permission),
    wsId,
  };
}

describe('resolveWorkspaceRouteAccess', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      user: { email: 'agent@tuturuuu.com', id: 'user-1' },
    });
    mocks.getPermissions.mockResolvedValue(
      permissionsResult('resolved-ws', ['manage_workspace_members'])
    );
  });

  it('threads the validated app-session principal into workspace access', async () => {
    const { resolveWorkspaceRouteAccess } = await import(
      '@/lib/workspace-route-access'
    );
    const request = new Request('http://localhost/api/workspaces/team');

    const result = await resolveWorkspaceRouteAccess(request, 'team', [
      'manage_workspace_members',
      'manage_workspace_roles',
    ]);

    expect(result.ok).toBe(true);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: { email: 'agent@tuturuuu.com', id: 'user-1' },
      wsId: 'team',
    });
  });

  it('returns the session failure before querying workspace permissions', async () => {
    const failure = {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
    mocks.resolveSessionAuthContext.mockResolvedValue(failure);
    const { resolveWorkspaceRouteAccess } = await import(
      '@/lib/workspace-route-access'
    );

    const result = await resolveWorkspaceRouteAccess(
      new Request('http://localhost/api/workspaces/team'),
      'team'
    );

    expect(result).toBe(failure);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('denies callers without workspace access', async () => {
    mocks.getPermissions.mockResolvedValue(null);
    const { resolveWorkspaceRouteAccess } = await import(
      '@/lib/workspace-route-access'
    );

    const result = await resolveWorkspaceRouteAccess(
      new Request('http://localhost/api/workspaces/team'),
      'team'
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected workspace access denial');
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toEqual({
      message: 'Workspace access denied',
    });
  });

  it('allows any matching required permission and denies when none match', async () => {
    const { resolveWorkspaceRouteAccess } = await import(
      '@/lib/workspace-route-access'
    );
    const request = new Request('http://localhost/api/workspaces/team');

    const allowed = await resolveWorkspaceRouteAccess(request, 'team', [
      'manage_workspace_members',
      'manage_workspace_roles',
    ]);
    expect(allowed.ok).toBe(true);

    mocks.getPermissions.mockResolvedValueOnce(
      permissionsResult('resolved-ws', [])
    );
    const denied = await resolveWorkspaceRouteAccess(request, 'team', [
      'manage_workspace_members',
      'manage_workspace_roles',
    ]);

    expect(denied.ok).toBe(false);
    if (denied.ok) throw new Error('Expected workspace permission denial');
    expect(denied.response.status).toBe(403);
    await expect(denied.response.json()).resolves.toEqual({
      message: 'Workspace permission denied',
    });
  });
});
