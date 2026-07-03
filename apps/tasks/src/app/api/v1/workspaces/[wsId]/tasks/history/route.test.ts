import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceId = '33333333-3333-4333-8333-333333333333';
const boardId = '44444444-4444-4444-8444-444444444444';
const oldListId = '11111111-1111-4111-8111-111111111111';
const newListId = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  listIn: vi.fn(),
  listSelect: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
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

    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: 'user-1' },
    });
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
    mocks.createClient.mockResolvedValue({
      from: mocks.from,
      rpc: mocks.rpc,
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
});
