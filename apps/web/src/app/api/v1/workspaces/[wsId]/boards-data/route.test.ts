import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  ensureDefaultPersonalTaskBoard: vi.fn(),
  getPermissions: vi.fn(),
  loadTaskBoardGuestSharesForWorkspace: vi.fn(),
  serverLogger: { error: vi.fn() },
  summarizeTaskBoardGuestShares: vi.fn(),
  supabase: { from: vi.fn() },
  user: {
    email: 'member@example.com',
    id: '00000000-0000-4000-8000-000000000999',
  },
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/apis/tu-do/board-access', () => ({
  loadTaskBoardGuestSharesForWorkspace: (
    ...args: Parameters<typeof mocks.loadTaskBoardGuestSharesForWorkspace>
  ) => mocks.loadTaskBoardGuestSharesForWorkspace(...args),
  summarizeTaskBoardGuestShares: (
    ...args: Parameters<typeof mocks.summarizeTaskBoardGuestShares>
  ) => mocks.summarizeTaskBoardGuestShares(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    <T>(
      handler: (
        request: NextRequest,
        auth: { supabase: typeof mocks.supabase; user: typeof mocks.user },
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
        { supabase: mocks.supabase, user: mocks.user },
        params
      );
    },
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@/lib/tasks/default-personal-task-board', () => ({
  ensureDefaultPersonalTaskBoard: (
    ...args: Parameters<typeof mocks.ensureDefaultPersonalTaskBoard>
  ) => mocks.ensureDefaultPersonalTaskBoard(...args),
}));

import { GET } from './route';

const WS_ID = '00000000-0000-4000-8000-000000000123';
const BOARD_ID = '00000000-0000-4000-8000-000000000456';

type QueryResult = {
  count?: number | null;
  data: unknown;
  error: unknown;
};

function createQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(() => query),
    ilike: vi.fn(() => query),
    in: vi.fn(() => query),
    is: vi.fn(() => query),
    limit: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    select: vi.fn(() => query),
  };

  Object.defineProperty(query, 'then', {
    value: (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  });

  return query;
}

function buildRequest() {
  return new NextRequest(
    `https://app.tuturuuu.com/api/v1/workspaces/${WS_ID}/boards-data`
  );
}

function routeContext() {
  return { params: Promise.resolve({ wsId: WS_ID }) };
}

describe('workspace boards-data route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureDefaultPersonalTaskBoard.mockResolvedValue(null);
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.loadTaskBoardGuestSharesForWorkspace.mockResolvedValue([]);
    mocks.summarizeTaskBoardGuestShares.mockReturnValue({
      boardCount: 0,
      boardIds: [],
      highestPermission: null,
    });
  });

  it('rejects workspace members without manage_projects before admin board queries', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(
        (permission: string) => permission === 'manage_projects'
      ),
    });

    const response = await GET(buildRequest(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("You don't have permission to view task boards");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.ensureDefaultPersonalTaskBoard).not.toHaveBeenCalled();
  });

  it('keeps explicitly shared guest boards readable for non-members', async () => {
    const boardsQuery = createQuery({
      count: 1,
      data: [
        {
          archived_at: null,
          created_at: '2026-05-01T00:00:00+00:00',
          deleted_at: null,
          id: BOARD_ID,
          name: 'Shared Board',
          ws_id: WS_ID,
        },
      ],
      error: null,
    });
    const listsQuery = createQuery({
      data: [
        {
          archived: false,
          board_id: BOARD_ID,
          color: 'BLUE',
          id: 'list-1',
          name: 'Open',
          position: 1,
          status: 'not_started',
        },
      ],
      error: null,
    });
    const tasksQuery = createQuery({
      data: [
        {
          closed_at: null,
          created_at: '2026-05-02T00:00:00+00:00',
          description: 'Shared task',
          end_date: null,
          id: 'task-1',
          list_id: 'list-1',
          name: 'Task',
          priority: null,
          start_date: null,
        },
      ],
      error: null,
    });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === 'workspace_boards') return boardsQuery;
        if (table === 'task_lists') return listsQuery;
        if (table === 'tasks') return tasksQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.loadTaskBoardGuestSharesForWorkspace.mockResolvedValue([
      { board_id: BOARD_ID, permission: 'view' },
    ]);
    mocks.summarizeTaskBoardGuestShares.mockReturnValue({
      boardCount: 1,
      boardIds: [BOARD_ID],
      highestPermission: 'view',
    });

    const response = await GET(buildRequest(), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(boardsQuery.in).toHaveBeenCalledWith('id', [BOARD_ID]);
    expect(body.access_type).toBe('guest');
    expect(body.data[0]).toMatchObject({
      access_type: 'guest',
      guest_permission: 'view',
      id: BOARD_ID,
    });
  });
});
