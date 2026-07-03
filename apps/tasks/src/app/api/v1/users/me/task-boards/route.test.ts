import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();

const sessionUser = {
  email: 'guest@example.com',
  id: 'user-1',
};

const memberWorkspaceRows = [
  {
    ws_id: 'ws-manager',
    workspaces: {
      avatar_url: null,
      creator_id: 'user-1',
      id: 'ws-manager',
      logo_url: null,
      name: 'Current Workspace',
      personal: false,
    },
  },
  {
    ws_id: 'ws-member',
    workspaces: {
      avatar_url: null,
      creator_id: 'user-2',
      id: 'ws-member',
      logo_url: null,
      name: 'Member Workspace',
      personal: false,
    },
  },
];

const memberBoardRows = [
  {
    archived_at: null,
    created_at: '2026-06-25T00:00:00.000Z',
    deleted_at: null,
    icon: null,
    id: 'board-manager',
    name: 'Manager Board',
    ticket_prefix: 'MB',
    workspaces: memberWorkspaceRows[0]?.workspaces,
    ws_id: 'ws-manager',
  },
  {
    archived_at: '2026-06-25T00:00:00.000Z',
    created_at: '2026-06-25T00:00:00.000Z',
    deleted_at: null,
    icon: null,
    id: 'board-archived',
    name: 'Archived Board',
    ticket_prefix: null,
    workspaces: memberWorkspaceRows[0]?.workspaces,
    ws_id: 'ws-manager',
  },
];

const guestBoardRow = {
  archived_at: null,
  created_at: '2026-06-25T00:00:00.000Z',
  deleted_at: null,
  icon: null,
  id: 'board-guest',
  name: 'Guest Board',
  ticket_prefix: 'GB',
  workspaces: {
    avatar_url: null,
    creator_id: 'user-3',
    id: 'ws-guest',
    logo_url: null,
    name: 'Guest Workspace',
    personal: true,
  },
  ws_id: 'ws-guest',
};

const archivedGuestBoardRow = {
  ...guestBoardRow,
  archived_at: '2026-06-25T00:00:00.000Z',
  id: 'board-guest-archived',
  name: 'Archived Guest Board',
};

const userShareRows = [
  {
    board_id: 'board-guest',
    permission: 'view',
    workspace_boards: guestBoardRow,
  },
  {
    board_id: 'board-guest-archived',
    permission: 'edit',
    workspace_boards: archivedGuestBoardRow,
  },
];

const emailShareRows = [
  {
    board_id: 'board-guest',
    permission: 'edit',
    workspace_boards: guestBoardRow,
  },
];

type QueryFilter = {
  column: string;
  type: 'eq' | 'in' | 'is';
  value: unknown;
};

const queryCalls: Array<{
  filters: QueryFilter[];
  select?: string;
  table: string;
}> = [];

function createQuery(table: string) {
  const filters: QueryFilter[] = [];
  const query = {
    eq(column: string, value: unknown) {
      filters.push({ column, type: 'eq', value });
      return Promise.resolve(resolveQuery(table, filters));
    },
    in(column: string, value: unknown) {
      filters.push({ column, type: 'in', value });
      return query;
    },
    is(column: string, value: unknown) {
      filters.push({ column, type: 'is', value });
      if (
        table === 'workspace_boards' &&
        filters.filter((filter) => filter.type === 'is').length >= 2
      ) {
        return Promise.resolve(resolveQuery(table, filters));
      }
      return query;
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    select(select: string) {
      queryCalls.push({ filters, select, table });
      return query;
    },
  };

  return query;
}

function activeBoardFilter<
  T extends { archived_at: string | null; deleted_at: string | null },
>(row: T) {
  return row.archived_at === null && row.deleted_at === null;
}

function resolveQuery(table: string, filters: QueryFilter[]) {
  if (table === 'workspace_members') {
    return { data: memberWorkspaceRows, error: null };
  }

  if (table === 'workspace_boards') {
    const workspaceFilter = filters.find(
      (filter) => filter.type === 'in' && filter.column === 'ws_id'
    );
    const workspaceIds = Array.isArray(workspaceFilter?.value)
      ? (workspaceFilter.value as string[])
      : [];
    return {
      data: memberBoardRows
        .filter((row) => workspaceIds.includes(row.ws_id))
        .filter(activeBoardFilter),
      error: null,
    };
  }

  if (table === 'task_board_shares') {
    const isEmailShare = filters.some(
      (filter) => filter.type === 'eq' && filter.column === 'shared_with_email'
    );
    const rows = isEmailShare ? emailShareRows : userShareRows;
    return {
      data: rows.filter((row) => activeBoardFilter(row.workspace_boards)),
      error: null,
    };
  }

  return { data: [], error: null };
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: { user: typeof sessionUser }
      ) => Promise<Response> | Response
    ) =>
    (request: NextRequest) =>
      handler(request, { user: sessionUser }),
}));

import { GET } from './route';

describe('current user accessible task boards route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryCalls.length = 0;
    createAdminClientMock.mockResolvedValue({
      from: (table: string) => createQuery(table),
    });
    getPermissionsMock.mockImplementation(({ wsId }: { wsId: string }) => ({
      containsPermission: (permission: string) =>
        permission === 'manage_projects' && wsId === 'ws-manager',
    }));
  });

  it('returns active manager boards and direct guest boards with strongest guest permission', async () => {
    const response = await GET(
      new NextRequest('https://app.tuturuuu.com/api/v1/users/me/task-boards')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.boards).toEqual([
      expect.objectContaining({
        access_type: 'member',
        guest_permission: null,
        id: 'board-manager',
        workspace: expect.objectContaining({
          access_type: 'member',
          id: 'ws-manager',
          name: 'Current Workspace',
        }),
        ws_id: 'ws-manager',
      }),
      expect.objectContaining({
        access_type: 'guest',
        guest_permission: 'edit',
        id: 'board-guest',
        workspace: expect.objectContaining({
          access_type: 'guest',
          guest_products: ['tasks'],
          id: 'ws-guest',
          name: 'Guest Workspace',
        }),
        ws_id: 'ws-guest',
      }),
    ]);
    expect(body.boards.map((board: { id: string }) => board.id)).not.toContain(
      'board-archived'
    );
    expect(body.boards.map((board: { id: string }) => board.id)).not.toContain(
      'board-guest-archived'
    );
    expect(queryCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'task_board_shares',
          filters: expect.arrayContaining([
            {
              column: 'workspace_boards.archived_at',
              type: 'is',
              value: null,
            },
          ]),
        }),
      ])
    );
  });
});
