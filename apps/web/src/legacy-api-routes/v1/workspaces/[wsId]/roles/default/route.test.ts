import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  privateRpc: vi.fn(),
  resolveWorkspaceRouteAccess: vi.fn(),
  schema: vi.fn(),
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.resolveWorkspaceRouteAccess,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: mocks.from,
    schema: mocks.schema,
  })),
}));

import { PUT } from './route';

function putDefaults(
  body: Record<string, unknown> = {
    permissions: [{ enabled: false, id: 'manage_workspace_members' }],
  },
  memberType = 'MEMBER'
) {
  return PUT(
    new Request(`http://localhost/roles/default?memberType=${memberType}`, {
      body: JSON.stringify(body),
      method: 'PUT',
    }),
    { params: Promise.resolve({ wsId: 'personal' }) }
  );
}

describe('default workspace permissions update route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: { wsId: 'caller-workspace-id' },
      user: { id: 'admin-user' },
    });
    mocks.schema.mockReturnValue({ rpc: mocks.privateRpc });
    mocks.privateRpc.mockResolvedValue({ data: 'updated', error: null });
  });

  it('rejects a caller without manage_workspace_roles before the edit', async () => {
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    });

    const response = await putDefaults();

    expect(response.status).toBe(403);
    expect(mocks.resolveWorkspaceRouteAccess).toHaveBeenCalledWith(
      expect.any(Request),
      'personal',
      ['manage_workspace_roles']
    );
    expect(mocks.privateRpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('edits defaults through the guarded function as the session actor', async () => {
    const response = await putDefaults(
      {
        member_type: 'GUEST',
        permissions: [
          { enabled: true, id: 'manage_workspace_members' },
          { enabled: false, id: 'manage_subscription' },
        ],
      },
      'MEMBER'
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'success' });
    expect(mocks.schema).toHaveBeenCalledWith('private');
    expect(mocks.privateRpc).toHaveBeenCalledExactlyOnceWith(
      'update_workspace_default_permissions_guarded',
      {
        p_actor_id: 'admin-user',
        p_member_type: 'GUEST',
        p_mode: 'workspace',
        p_permissions: [
          { enabled: true, id: 'manage_workspace_members' },
          { enabled: false, id: 'manage_subscription' },
        ],
        p_ws_id: 'caller-workspace-id',
      }
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('refuses switching off the last member manager with 409', async () => {
    mocks.privateRpc.mockResolvedValue({ data: 'last_manager', error: null });

    const response = await putDefaults();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'WORKSPACE_LAST_MANAGER',
      message: 'At least one member must be able to manage members',
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 404, 'Workspace not found'],
    ['forbidden', 403, 'Workspace permission denied'],
    ['unexpected', 500, 'Error updating default workspace permissions'],
  ])('maps the guarded answer %s', async (data, status, message) => {
    mocks.privateRpc.mockResolvedValue({ data, error: null });

    const response = await putDefaults();

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ message });
  });

  it('fails closed when the guarded function errors', async () => {
    mocks.privateRpc.mockResolvedValue({
      data: 'updated',
      error: { code: '55P03', message: 'lock timeout' },
    });

    const response = await putDefaults();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error updating default workspace permissions',
    });
  });

  it.each([
    [{ permissions: [] }, 'OWNER'],
    [{ member_type: 'OWNER', permissions: [] }, 'MEMBER'],
    [{}, 'MEMBER'],
  ])('rejects an invalid body before the edit', async (body, memberType) => {
    const response = await putDefaults(body, memberType);

    expect(response.status).toBe(400);
    expect(mocks.privateRpc).not.toHaveBeenCalled();
  });
});
