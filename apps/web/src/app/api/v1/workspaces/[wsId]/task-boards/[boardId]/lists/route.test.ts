import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBoardAccessMock = vi.fn();
const rpcMock = vi.fn();
const sessionSupabase = { from: vi.fn() };
const sessionUser = { id: 'user-1' };

vi.mock('@tuturuuu/types/primitives/SupportedColors', () => ({
  SUPPORTED_COLORS: [
    'GRAY',
    'RED',
    'BLUE',
    'GREEN',
    'YELLOW',
    'ORANGE',
    'PURPLE',
    'PINK',
    'INDIGO',
    'CYAN',
  ],
}));

vi.mock('@tuturuuu/auth/cli-session', () => ({
  CLI_APP_TARGET_APP: 'platform',
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    <T>(
      handler: (
        request: NextRequest,
        context: { supabase: typeof sessionSupabase; user: typeof sessionUser },
        params: T
      ) => Promise<Response> | Response
    ) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<T> | T }
    ) => {
      const params = routeContext?.params
        ? await Promise.resolve(routeContext.params)
        : ({} as T);
      return handler(
        request,
        { supabase: sessionSupabase, user: sessionUser },
        params
      );
    },
}));

vi.mock('./access', () => ({
  requireBoardAccess: (...args: Parameters<typeof requireBoardAccessMock>) =>
    requireBoardAccessMock(...args),
}));

import { GET, POST } from './route';

describe('task board lists route GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns task counts for each list', async () => {
    const listRows = [
      {
        id: 'list-1',
        board_id: 'board-1',
        name: 'To Do',
        status: 'not_started',
        color: 'GRAY',
        position: 1,
        archived: false,
      },
      {
        id: 'list-2',
        board_id: 'board-1',
        name: 'Done',
        status: 'done',
        color: 'GREEN',
        position: 2,
        archived: false,
      },
    ];
    const listOrderMock = vi.fn();
    const listQuery = {
      select: vi.fn(() => listQuery),
      eq: vi.fn(() => listQuery),
      order: listOrderMock,
    };
    listOrderMock.mockReturnValueOnce(listQuery).mockResolvedValueOnce({
      data: listRows,
      error: null,
    });

    const fromMock = vi.fn((table: string) => {
      if (table === 'task_lists') return listQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    const taskCountRpcMock = vi.fn().mockResolvedValue({
      data: [{ list_id: 'list-1', task_count: 2 }],
      error: null,
    });
    const schemaMock = vi.fn((schema: string) => {
      if (schema === 'private') {
        return {
          rpc: taskCountRpcMock,
        };
      }

      throw new Error(`Unexpected schema ${schema}`);
    });

    requireBoardAccessMock.mockResolvedValue({
      supabase: {
        from: fromMock,
      },
      sbAdmin: {
        from: fromMock,
        schema: schemaMock,
      },
      boardId: 'board-1',
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/board-1/lists'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: 'board-1',
        }),
      }
    );

    expect(response).toBeDefined();
    if (!response) {
      throw new Error('Expected GET to return a response');
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      lists: [
        {
          ...listRows[0],
          task_count: 2,
        },
        {
          ...listRows[1],
          task_count: 0,
        },
      ],
    });
    expect(requireBoardAccessMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { boardId: 'board-1', wsId: 'ws-1' },
      { supabase: sessionSupabase, user: sessionUser }
    );
    expect(schemaMock).toHaveBeenCalledWith('private');
    expect(taskCountRpcMock).toHaveBeenCalledWith(
      'get_task_board_list_task_counts',
      {
        p_board_id: 'board-1',
      }
    );
    expect(fromMock).not.toHaveBeenCalledWith('tasks');
  });
});

describe('task board lists route POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireBoardAccessMock.mockResolvedValue({
      sbAdmin: {
        rpc: rpcMock,
      },
      boardId: 'board-1',
    });
  });

  it('creates a closed list even when another closed list already exists', async () => {
    rpcMock.mockResolvedValue({
      data: {
        id: 'list-2',
        board_id: 'board-1',
        name: 'Not Planned',
        status: 'closed',
        color: 'PURPLE',
        position: 4,
        archived: false,
      },
      error: null,
    });

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/board-1/lists',
        {
          method: 'POST',
          body: JSON.stringify({
            name: 'Not Planned',
            status: 'closed',
            color: 'PURPLE',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: 'board-1',
        }),
      }
    );

    expect(response).toBeDefined();
    if (!response) {
      throw new Error('Expected POST to return a response');
    }

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      list: {
        id: 'list-2',
        board_id: 'board-1',
        name: 'Not Planned',
        status: 'closed',
        color: 'PURPLE',
        position: 4,
        archived: false,
      },
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'create_task_list_with_next_position',
      {
        p_board_id: 'board-1',
        p_name: 'Not Planned',
        p_status: 'closed',
        p_color: 'PURPLE',
      }
    );
    expect(requireBoardAccessMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { boardId: 'board-1', wsId: 'ws-1' },
      { supabase: sessionSupabase, user: sessionUser },
      { requiredPermission: 'edit' }
    );
  });

  it('returns the backend error message instead of a generic create failure', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Only one closed list is allowed per board',
      },
    });

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/board-1/lists',
        {
          method: 'POST',
          body: JSON.stringify({
            name: 'Abandoned',
            status: 'closed',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: 'board-1',
        }),
      }
    );

    expect(response).toBeDefined();
    if (!response) {
      throw new Error('Expected POST to return a response');
    }

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Only one closed list is allowed per board',
    });
  });

  it('returns a stable duplicate-name error when creating an existing list name', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "idx_task_lists_unique_active_name"',
      },
    });

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/board-1/lists',
        {
          method: 'POST',
          body: JSON.stringify({
            name: ' Backlog ',
            status: 'not_started',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: 'board-1',
        }),
      }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'TASK_LIST_NAME_EXISTS',
      error: 'A task list with this name already exists on this board',
    });
  });
});
