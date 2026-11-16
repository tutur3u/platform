import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceId = '33333333-3333-4333-8333-333333333333';
const boardId = '44444444-4444-4444-8444-444444444444';
const oldListId = '11111111-1111-4111-8111-111111111111';
const newListId = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  from: vi.fn(),
  listIn: vi.fn(),
  listSelect: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveCoMemberNames: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  rpc: vi.fn(),
  usersIn: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/utils/co-member-names', () => ({
  resolveCoMemberNames: (
    ...args: Parameters<typeof mocks.resolveCoMemberNames>
  ) => mocks.resolveCoMemberNames(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (
    ...args: Parameters<typeof mocks.resolveSessionAuthContext>
  ) => mocks.resolveSessionAuthContext(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

function createRequest() {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${workspaceId}/tasks/history?board_id=${boardId}&page=1&pageSize=20`
  );
}

function createContext() {
  return {
    params: Promise.resolve({ wsId: workspaceId }),
  };
}

describe('workspace task history route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mocks.rpc.mockResolvedValue({
      data: [
        {
          board_id: boardId,
          board_name: 'Roadmap',
          change_type: 'field_updated',
          changed_at: '2026-06-22T08:00:00.000Z',
          changed_by: 'user-1',
          field_name: 'list_id',
          id: 'history-1',
          metadata: { new_list_name: 'Doing from metadata' },
          new_value: newListId,
          old_value: oldListId,
          task_deleted_at: null,
          task_id: 'task-1',
          task_name: 'Move task',
          task_permanently_deleted: false,
          total_count: 1,
          user_avatar_url: null,
          user_display_name: 'Alex Nguyen',
          user_id: 'user-1',
        },
      ],
      error: null,
    });
    mocks.listIn.mockResolvedValue({
      data: [
        { id: oldListId, name: 'Backlog' },
        { id: newListId, name: 'Doing' },
      ],
      error: null,
    });
    mocks.listSelect.mockReturnValue({ in: mocks.listIn });
    mocks.from.mockReturnValue({ select: mocks.listSelect });
    mocks.usersIn.mockResolvedValue({
      data: [{ id: 'user-1', display_name: 'Alex Nguyen', handle: 'alex' }],
      error: null,
    });
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        expect(table).toBe('users');
        return { select: vi.fn(() => ({ in: mocks.usersIn })) };
      }),
    });
    mocks.resolveCoMemberNames.mockImplementation(
      async ({
        users,
      }: {
        users: { id: string; display_name?: string | null }[];
      }) => new Map(users.map((u) => [u.id, u.display_name ?? '']))
    );
    mocks.normalizeWorkspaceId.mockResolvedValue(workspaceId);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      ok: true,
    });
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: {
        from: mocks.from,
        rpc: mocks.rpc,
      },
      user: { id: 'user-1' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns list names for list_id changes without exposing raw ids as display values', async () => {
    const { GET } = await import('./route');

    const response = await GET(createRequest(), createContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      data: [
        {
          field_name: 'list_id',
          new_value: {
            id: newListId,
            name: 'Doing from metadata',
          },
          old_value: {
            id: oldListId,
            name: 'Backlog',
          },
        },
      ],
      page: 1,
      pageSize: 20,
    });
    expect(mocks.from).toHaveBeenCalledWith('task_lists');
    expect(mocks.listIn).toHaveBeenCalledWith('id', [oldListId, newListId]);
  });
  it('names a nameless co-member by email via the server resolver (D246)', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          change_type: 'field_updated',
          changed_at: '2026-06-22T08:00:00.000Z',
          changed_by: 'user-2',
          field_name: 'priority',
          id: 'history-2',
          metadata: {},
          new_value: 'high',
          old_value: null,
          task_id: 'task-1',
          task_name: 'Task',
          total_count: 1,
          user_avatar_url: null,
          user_display_name: 'rpc-private@example.com',
          user_id: 'user-2',
        },
      ],
      error: null,
    });
    mocks.usersIn.mockResolvedValue({
      data: [{ id: 'user-2', display_name: null, handle: 'nameless' }],
      error: null,
    });
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([['user-2', 'nameless@example.com']])
    );
    const { GET } = await import('./route');

    const response = await GET(createRequest(), createContext());

    expect(response.status).toBe(200);
    expect(mocks.usersIn).toHaveBeenCalledWith('id', ['user-2']);
    expect(mocks.resolveCoMemberNames).toHaveBeenCalledWith(
      expect.objectContaining({
        users: [{ id: 'user-2', display_name: null, handle: 'nameless' }],
        viewerUserId: 'user-1',
        wsId: workspaceId,
      })
    );
    const body = await response.json();
    expect(body.data[0].user).toEqual({
      avatar_url: null,
      id: 'user-2',
      name: 'nameless@example.com',
    });
  });

  it('never sends the RPC email fallback when HIDE_MEMBER_EMAIL withholds it', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          change_type: 'field_updated',
          changed_at: '2026-06-22T08:00:00.000Z',
          changed_by: 'user-2',
          field_name: 'priority',
          id: 'history-2',
          metadata: {},
          new_value: 'high',
          old_value: null,
          task_id: 'task-1',
          task_name: 'Task',
          total_count: 1,
          user_avatar_url: null,
          user_display_name: 'rpc-private@example.com',
          user_id: 'user-2',
        },
      ],
      error: null,
    });
    mocks.usersIn.mockResolvedValue({
      data: [{ id: 'user-2', display_name: null, handle: 'nameless' }],
      error: null,
    });
    // The resolver enforces HIDE_MEMBER_EMAIL / membership and returns the handle.
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([['user-2', 'nameless']])
    );
    const { GET } = await import('./route');

    const response = await GET(createRequest(), createContext());
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain('@example.com');
    expect(JSON.parse(text).data[0].user.name).toBe('nameless');
  });
});
