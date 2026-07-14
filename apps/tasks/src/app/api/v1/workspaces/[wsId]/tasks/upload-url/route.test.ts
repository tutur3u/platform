import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const normalizeWorkspaceId = vi.fn();
  const getPermissions = vi.fn();
  const taskMaybeSingle = vi.fn();
  const createSignedUploadUrl = vi.fn();
  const roleMembershipEqWorkspace = vi.fn();
  const roleMembershipEqUser = vi.fn(() => ({
    eq: roleMembershipEqWorkspace,
  }));
  const roleMembershipSelect = vi.fn(() => ({
    eq: roleMembershipEqUser,
  }));

  const adminClient = {
    from: vi.fn((table: string) =>
      table === 'workspace_role_members'
        ? { select: roleMembershipSelect }
        : {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: taskMaybeSingle,
              })),
            })),
          }
    ),
  };

  const storageAdminClient = {
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl,
      })),
    },
  };

  return {
    adminClient,
    createSignedUploadUrl,
    getPermissions,
    normalizeWorkspaceId,
    roleMembershipEqUser,
    roleMembershipEqWorkspace,
    roleMembershipSelect,
    storageAdminClient,
    taskMaybeSingle,
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminClient)),
  createDynamicAdminClient: vi.fn(() =>
    Promise.resolve(mocks.storageAdminClient)
  ),
}));

type UploadRouteHandler = (
  request: NextRequest,
  context: { user: { id: string }; supabase: unknown },
  params: { wsId: string }
) => Promise<Response>;

const authContext = {
  user: { id: 'user-1' },
  supabase: {},
};

describe('task upload-url route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.normalizeWorkspaceId.mockReset();
    mocks.getPermissions.mockReset();
    mocks.taskMaybeSingle.mockReset();
    mocks.createSignedUploadUrl.mockReset();
    mocks.roleMembershipEqWorkspace.mockReset();
    mocks.adminClient.from.mockClear();
    mocks.storageAdminClient.storage.from.mockClear();
  });

  it('returns the current permission, membership, and assigned roles', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_drive_tasks_directory',
      membershipType: 'MEMBER',
      permissions: ['manage_drive_tasks_directory'],
      withoutPermission: () => false,
    });
    mocks.roleMembershipEqWorkspace.mockResolvedValue({
      data: [
        {
          workspace_roles: {
            id: 'role-1',
            name: 'Project manager',
          },
        },
      ],
      error: null,
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/tasks/upload-url/route'
    );
    const response = await (GET as UploadRouteHandler)(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/tasks/upload-url'
      ),
      authContext,
      { wsId: 'ws-1' }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      effectivePermissions: ['manage_drive_tasks_directory'],
      hasPermission: true,
      membershipType: 'MEMBER',
      permission: 'manage_drive_tasks_directory',
      roles: [{ id: 'role-1', name: 'Project manager' }],
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: authContext.user,
      wsId: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('returns 403 when user lacks manage_drive_tasks_directory permission', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: (permission: string) =>
        permission === 'manage_drive_tasks_directory',
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/tasks/upload-url/route'
    );
    const response = await (POST as UploadRouteHandler)(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/tasks/upload-url',
        {
          method: 'POST',
          body: JSON.stringify({ filename: 'task.png' }),
        }
      ),
      authContext,
      { wsId: 'ws-1' }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'TASK_MEDIA_PERMISSION_DENIED',
      error: 'Insufficient permissions',
    });
  });

  it('returns 400 for unsupported extensions', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: () => false,
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/tasks/upload-url/route'
    );
    const response = await (POST as UploadRouteHandler)(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/tasks/upload-url',
        {
          method: 'POST',
          body: JSON.stringify({ filename: 'script.exe' }),
        }
      ),
      authContext,
      { wsId: 'ws-1' }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        'Unsupported file type. Only task image and video formats are allowed.',
    });
  });

  it('returns 404 when taskId does not belong to workspace', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: () => false,
    });
    mocks.taskMaybeSingle.mockResolvedValue({ data: null, error: null });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/tasks/upload-url/route'
    );
    const response = await (POST as UploadRouteHandler)(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/tasks/upload-url',
        {
          method: 'POST',
          body: JSON.stringify({
            filename: 'task.png',
            taskId: '11111111-1111-4111-8111-111111111111',
          }),
        }
      ),
      authContext,
      { wsId: 'ws-1' }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Task not found' });
  });

  it('returns signed upload payload scoped to task-images path', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: () => false,
    });
    mocks.taskMaybeSingle.mockResolvedValue({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        task_lists: {
          workspace_boards: {
            ws_id: '00000000-0000-0000-0000-000000000001',
          },
        },
      },
      error: null,
    });
    mocks.createSignedUploadUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://upload.example.com/signed',
        token: 'token-1',
      },
      error: null,
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/tasks/upload-url/route'
    );
    const response = await (POST as UploadRouteHandler)(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/tasks/upload-url',
        {
          method: 'POST',
          body: JSON.stringify({
            filename: 'preview.png',
            taskId: '11111111-1111-4111-8111-111111111111',
          }),
        }
      ),
      authContext,
      { wsId: 'ws-1' }
    );

    expect(response.status).toBe(200);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: authContext.user,
      wsId: '00000000-0000-0000-0000-000000000001',
    });
    const payload = await response.json();
    expect(payload.signedUrl).toBe('https://upload.example.com/signed');
    expect(payload.token).toBe('token-1');
    expect(payload.path).toMatch(
      /^task-images\/11111111-1111-4111-8111-111111111111\//
    );
    expect(payload.fullPath).toMatch(
      /^00000000-0000-0000-0000-000000000001\/task-images\/11111111-1111-4111-8111-111111111111\//
    );
  });
});
