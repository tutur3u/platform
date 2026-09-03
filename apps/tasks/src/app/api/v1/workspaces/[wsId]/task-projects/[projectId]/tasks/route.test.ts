import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  rpc: vi.fn(),
  sessionClient: { from: vi.fn() },
  sessionUser: { email: 'manager@example.com', id: 'user-1' },
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => mocks.getPermissions(...args),
  normalizeWorkspaceId: (...args: unknown[]) =>
    mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: {
          supabase: typeof mocks.sessionClient;
          user: typeof mocks.sessionUser;
        },
        params: Record<string, string>
      ) => Promise<Response>
    ) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<Record<string, string>> }
    ) =>
      handler(
        request,
        { supabase: mocks.sessionClient, user: mocks.sessionUser },
        await Promise.resolve(routeContext?.params ?? {})
      ),
}));

import { POST } from './route';

const WS_ID = '00000000-0000-4000-8000-000000000001';
const PROJECT_ID = '00000000-0000-4000-8000-000000000002';
const TASK_ID = '00000000-0000-4000-8000-000000000003';
const USER = mocks.sessionUser;

function request(body = JSON.stringify({ taskId: TASK_ID })) {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${WS_ID}/task-projects/${PROJECT_ID}/tasks`,
    { body, method: 'POST' }
  );
}

const context = {
  params: Promise.resolve({ projectId: PROJECT_ID, wsId: WS_ID }),
};

function adminClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'task_projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { ws_id: WS_ID },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  closed_at: null,
                  completed: false,
                  completed_at: null,
                  id: TASK_ID,
                  name: 'Task',
                  priority: null,
                  task_lists: {
                    name: 'List',
                    status: 'active',
                    workspace_boards: { ws_id: WS_ID },
                  },
                },
              }),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: mocks.rpc,
  };
}

describe('POST project task link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_projects',
    });
    mocks.createAdminClient.mockResolvedValue(adminClient());
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it('returns 500 when membership lookup fails', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_lookup_failed',
      ok: false,
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(500);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects nonmembers before permission lookup', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_missing',
      ok: false,
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects members without manage_projects before parsing or admin work', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
    });

    const response = await POST(request('{'), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "You don't have permission to perform this operation",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('surfaces permission-resolution failures', async () => {
    mocks.getPermissions.mockResolvedValue(null);

    const response = await POST(request('{'), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to resolve workspace permissions',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('uses the resolved app-session actor for permission lookup and linking', async () => {
    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: USER,
      wsId: WS_ID,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('link_task_project_with_actor', {
      p_actor_user_id: USER.id,
      p_project_id: PROJECT_ID,
      p_task_id: TASK_ID,
    });
  });

  it('preserves duplicate-link conflicts', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: '23505' } });

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
  });
});
