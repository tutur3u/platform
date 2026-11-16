import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  coMemberTables,
  createFakeAdmin,
  type FakeTables,
} from '@/test/co-member-admin-fake';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const taskId = '22222222-2222-4222-8222-222222222222';
const historyId = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getAppSessionTokenFromRequest: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: mocks.getAppSessionTokenFromRequest,
}));

vi.mock('@tuturuuu/auth/cli-session', () => ({
  CLI_APP_TARGET_APP: 'platform',
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.resolveSessionAuthContext,
}));

function createRequest() {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${workspaceId}/tasks/${taskId}/snapshot/${historyId}`
  );
}

function createContext() {
  return {
    params: Promise.resolve({
      workspaceId,
      wsId: workspaceId,
      taskId,
      historyId,
    }),
  };
}

describe('task snapshot route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppSessionTokenFromRequest.mockReturnValue('app-session-token');
    mocks.normalizeWorkspaceId.mockResolvedValue(workspaceId);
    mocks.single.mockResolvedValue({
      data: {
        id: historyId,
        changed_at: '2026-08-23T00:00:00.000Z',
        change_type: 'field_updated',
        field_name: 'list_id',
        changed_by: 'user-1',
        old_value: 'list-before',
        new_value: 'list-after',
        metadata: {
          old_list_name: 'Backlog',
          new_list_name: 'Review',
        },
      },
      error: null,
    });

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single: mocks.single })),
        })),
      })),
      rpc: mocks.rpc,
    };

    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase,
      user: { id: '44444444-4444-4444-8444-444444444444' },
    });
    mocks.rpc.mockImplementation((name: string) => {
      if (
        name === 'get_task_snapshot_at_history_for_actor' ||
        name === 'get_task_snapshot_at_history'
      ) {
        return Promise.resolve({
          data: {
            id: taskId,
            name: 'Historical task',
            list_id: 'list-after',
            list_name: 'Review',
          },
          error: null,
        });
      }

      if (
        name === 'get_task_relationships_at_snapshot_for_actor' ||
        name === 'get_task_relationships_at_snapshot'
      ) {
        return Promise.resolve({
          data: { assignees: [], labels: [], projects: [] },
          error: null,
        });
      }

      return Promise.resolve({
        data: null,
        error: new Error('Unexpected RPC'),
      });
    });
  });

  it('uses actor-scoped snapshot RPCs for Tasks app sessions', async () => {
    const { GET } = await import('./route');

    const response = await GET(createRequest(), createContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      snapshot: {
        id: taskId,
        name: 'Historical task',
        list_id: 'list-before',
        list_name: 'Backlog',
        assignees: [],
        labels: [],
        projects: [],
      },
      historyEntry: { id: historyId, field_name: 'list_id' },
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      'get_task_snapshot_at_history_for_actor',
      expect.objectContaining({
        p_actor_user_id: '44444444-4444-4444-8444-444444444444',
        p_ws_id: workspaceId,
        p_task_id: taskId,
        p_history_id: historyId,
      })
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      'get_task_relationships_at_snapshot_for_actor',
      expect.objectContaining({
        p_actor_user_id: '44444444-4444-4444-8444-444444444444',
      })
    );
  });

  it('preserves the caller-scoped RPCs for Supabase sessions', async () => {
    mocks.getAppSessionTokenFromRequest.mockReturnValue(null);
    const { GET } = await import('./route');

    const response = await GET(createRequest(), createContext());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      'get_task_snapshot_at_history',
      expect.not.objectContaining({ p_actor_user_id: expect.anything() })
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      'get_task_relationships_at_snapshot',
      expect.not.objectContaining({ p_actor_user_id: expect.anything() })
    );
  });

  it('preserves actor-scoped workspace denials', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: new Error('Access denied to workspace'),
    });
    const { GET } = await import('./route');

    const response = await GET(createRequest(), createContext());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Access denied to workspace',
    });
  });
});

describe('task snapshot assignee names (D246)', () => {
  const viewerId = '44444444-4444-4444-8444-444444444444';
  const members = [
    { user_id: viewerId, type: 'MEMBER' as const },
    { user_id: 'nameless', type: 'MEMBER' as const },
  ];
  const emails = [{ user_id: 'nameless', email: 'nameless@example.com' }];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppSessionTokenFromRequest.mockReturnValue(null);
    mocks.normalizeWorkspaceId.mockResolvedValue(workspaceId);
    mocks.single.mockResolvedValue({
      data: {
        id: historyId,
        changed_at: '2026-08-23T00:00:00.000Z',
        change_type: 'field_updated',
        field_name: 'name',
        changed_by: viewerId,
        old_value: 'Before',
        new_value: 'Historical task',
        metadata: {},
      },
      error: null,
    });
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: mocks.single })),
          })),
        })),
        rpc: mocks.rpc,
      },
      user: { id: viewerId },
    });
    mocks.rpc.mockImplementation((name: string) =>
      Promise.resolve({
        data: name.startsWith('get_task_relationships_at_snapshot')
          ? {
              assignees: [
                {
                  id: 'nameless',
                  user_id: 'nameless',
                  display_name: null,
                  avatar_url: null,
                },
                {
                  id: 'named',
                  user_id: 'named',
                  display_name: 'Named',
                  avatar_url: null,
                },
              ],
              labels: [],
              projects: [],
            }
          : { id: taskId, name: 'Historical task' },
        error: null,
      })
    );
  });

  async function assigneesFor(tables: FakeTables) {
    const admin = createFakeAdmin({
      ...tables,
      users: [{ id: 'nameless', handle: 'nameless-handle' }],
    });
    mocks.createAdminClient.mockResolvedValue(admin);
    const { GET } = await import('./route');
    const response = await GET(createRequest(), createContext());
    const body = (await response.json()) as {
      snapshot: { assignees: Record<string, unknown>[] };
    };
    return { admin, assignees: body.snapshot.assignees };
  }

  it('shows a nameless co-member by email to a member viewer', async () => {
    const { assignees } = await assigneesFor(
      coMemberTables({ wsId: workspaceId, members, emails })
    );

    expect(assignees).toEqual([
      {
        id: 'nameless',
        user_id: 'nameless',
        display_name: 'nameless@example.com',
        avatar_url: null,
      },
      {
        id: 'named',
        user_id: 'named',
        display_name: 'Named',
        avatar_url: null,
      },
    ]);
  });

  it('falls back to the handle when the workspace hides member emails', async () => {
    const { admin, assignees } = await assigneesFor(
      coMemberTables({ wsId: workspaceId, hideEmail: true, members, emails })
    );

    expect(assignees[0]?.display_name).toBe('nameless-handle');
    expect(JSON.stringify(assignees)).not.toContain('@example.com');
    expect(admin.calls).toContainEqual({
      table: 'users',
      columns: 'id, handle',
    });
  });

  it('never shows the email to a guest viewer', async () => {
    const { assignees } = await assigneesFor(
      coMemberTables({
        wsId: workspaceId,
        members: [{ user_id: viewerId, type: 'GUEST' }, members[1]!],
        emails,
      })
    );

    expect(assignees[0]?.display_name).toBe('nameless-handle');
  });
});
