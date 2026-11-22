import { GUARD_WORKSPACE_SELF_REMOVAL } from '@tuturuuu/apis/members/guarded-removal';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE } from './route';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  role: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.access,
}));

const request = new Request('https://example.test/workspace/role/person', {
  method: 'DELETE',
});
function removeRoleMember() {
  return DELETE(request, {
    params: Promise.resolve({
      roleId: 'role',
      userId: 'person',
      wsId: 'workspace-handle',
    }),
  });
}

describe('standard role member removal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({
      ok: true,
      user: { id: 'session-user' },
      permissions: { wsId: 'resolved-workspace' },
    });
    mocks.admin.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.role });
    mocks.role.mockResolvedValue({ data: { id: 'role' }, error: null });
  });

  it.each(['removed', 'not_found'])(
    'returns success on %s with no direct write',
    async (data) => {
      mocks.rpc.mockResolvedValue({ data, error: null });
      const response = await removeRoleMember();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ message: 'success' });
      expect(mocks.access).toHaveBeenCalledExactlyOnceWith(
        request,
        'workspace-handle',
        ['manage_workspace_roles']
      );
      expect(mocks.admin).toHaveBeenCalledExactlyOnceWith({ noCookie: true });
      expect(mocks.from).toHaveBeenCalledExactlyOnceWith('workspace_roles');
      expect(mocks.eq.mock.calls).toEqual([
        ['id', 'role'],
        ['ws_id', 'resolved-workspace'],
      ]);
      expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
        'remove_workspace_role_member_guarded_in_mode',
        {
          p_actor_id: 'session-user',
          p_guard_self: GUARD_WORKSPACE_SELF_REMOVAL,
          p_mode: 'workspace',
          p_role_id: 'role',
          p_user_id: 'person',
          p_ws_id: 'resolved-workspace',
        }
      );
    }
  );

  it('retains the credential denial without a service client', async () => {
    const rejection = NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401 }
    );
    mocks.access.mockResolvedValue({ ok: false, response: rejection });
    expect(await removeRoleMember()).toBe(rejection);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('returns the existing 404 when the role is outside the workspace', async () => {
    mocks.role.mockResolvedValue({ data: null, error: null });
    const response = await removeRoleMember();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: 'Role not found' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['forbidden', 403, { message: 'Workspace permission denied' }],
    [
      'last_manager',
      409,
      {
        code: 'WORKSPACE_LAST_MANAGER',
        message: 'At least one member must be able to manage members',
      },
    ],
    ['creator_protected', 500, { message: 'Error removing role member' }],
    ['unknown', 500, { message: 'Error removing role member' }],
  ])('maps %s without a fallback write', async (data, status, body) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    const response = await removeRoleMember();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('workspace_roles');
  });

  it('preserves the failure envelope on RPC error', async () => {
    mocks.rpc.mockResolvedValue({
      data: 'removed',
      error: new Error('unavailable'),
    });
    const response = await removeRoleMember();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error removing role member',
    });
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('workspace_roles');
  });
});
