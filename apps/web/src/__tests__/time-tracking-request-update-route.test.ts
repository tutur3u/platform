import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const workspaceMemberSingle = vi.fn();
  const adminRequestSingle = vi.fn();
  const adminUpdateRpc = vi.fn();
  const sessionStorageRemove = vi.fn();
  const adminStorageRemove = vi.fn();
  const normalizeWorkspaceId = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser: authGetUser,
    },
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: workspaceMemberSingle,
              })),
            })),
          })),
        };
      }

      if (table === 'time_tracking_requests') {
        return {};
      }

      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const adminSupabase = {
    rpc: adminUpdateRpc,
    storage: {
      from: vi.fn(() => ({
        remove: adminStorageRemove,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'time_tracking_requests') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: adminRequestSingle,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  const storageClient = {
    storage: {
      from: vi.fn(() => ({
        remove: sessionStorageRemove,
      })),
    },
  };

  return {
    adminRequestSingle,
    adminSupabase,
    authGetUser,
    adminUpdateRpc,
    normalizeWorkspaceId,
    sessionSupabase,
    storageClient,
    sessionStorageRemove,
    adminStorageRemove,
    workspaceMemberSingle,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
  createDynamicClient: vi.fn(() => Promise.resolve(mocks.storageClient)),
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

describe('time tracking request update route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mocks.workspaceMemberSingle.mockResolvedValue({
      data: { type: 'MEMBER' as const },
      error: null,
    });
    mocks.adminRequestSingle.mockResolvedValue({
      data: {
        id: 'request-1',
        workspace_id: 'ws-1',
        user_id: 'user-1',
        approval_status: 'PENDING',
        images: [],
      },
      error: null,
    });
    mocks.adminUpdateRpc.mockResolvedValue({
      data: {
        id: 'request-1',
        title: 'Updated request',
      },
      error: null,
    });
    mocks.sessionStorageRemove.mockResolvedValue({ error: null });
    mocks.adminStorageRemove.mockResolvedValue({ error: null });
  });

  it('updates request rows through the admin RPC while forwarding the authenticated actor id', async () => {
    const { PUT } = await import(
      '@/app/api/v1/workspaces/[wsId]/time-tracking/requests/[id]/route'
    );

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/time-tracking/requests/request-1',
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            title: 'Updated request',
            description: '',
            startTime: '2026-04-15T07:00:00.000Z',
            endTime: '2026-04-15T08:00:00.000Z',
            removedImages: [],
            newImagePaths: [],
          }),
        }
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1', id: 'request-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.adminUpdateRpc).toHaveBeenCalledWith(
      'update_time_tracking_request_content',
      expect.objectContaining({
        p_request_id: 'request-1',
        p_workspace_id: 'ws-1',
        p_actor_auth_uid: 'user-1',
        p_title: 'Updated request',
      })
    );
  });

  it('passes actor auth uid to RPC for CONTENT_UPDATED trigger actor attribution', async () => {
    const { PUT } = await import(
      '@/app/api/v1/workspaces/[wsId]/time-tracking/requests/[id]/route'
    );

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/time-tracking/requests/request-1',
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            title: 'Mobile App Authentication + UI/UX changes',
            description: 'Updated content',
            startTime: '2026-04-16T02:00:00.000Z',
            endTime: '2026-04-16T03:00:00.000Z',
            removedImages: [],
            newImagePaths: [],
          }),
        }
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1', id: 'request-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.adminUpdateRpc).toHaveBeenCalledWith(
      'update_time_tracking_request_content',
      expect.objectContaining({
        p_actor_auth_uid: 'user-1',
      })
    );
  });

  it('falls back to admin storage cleanup when request-scoped cleanup hits RLS', async () => {
    mocks.adminUpdateRpc.mockResolvedValue({
      data: null,
      error: {
        message:
          'User authentication required for time tracking request updates',
      },
    });
    mocks.sessionStorageRemove.mockResolvedValue({
      error: { message: 'new row violates row-level security policy' },
    });

    const { PUT } = await import(
      '@/app/api/v1/workspaces/[wsId]/time-tracking/requests/[id]/route'
    );

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/time-tracking/requests/request-1',
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            title: 'Updated request',
            description: '',
            startTime: '2026-04-15T07:00:00.000Z',
            endTime: '2026-04-15T08:00:00.000Z',
            removedImages: [],
            newImagePaths: ['request-1/cleanup.png'],
          }),
        }
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1', id: 'request-1' }),
      }
    );

    expect(response.status).toBe(500);
    expect(mocks.sessionStorageRemove).toHaveBeenCalledWith([
      'request-1/cleanup.png',
    ]);
    expect(mocks.adminStorageRemove).toHaveBeenCalledWith([
      'request-1/cleanup.png',
    ]);
  });
});
