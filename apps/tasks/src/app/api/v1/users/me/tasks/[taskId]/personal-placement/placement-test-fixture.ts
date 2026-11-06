import type { NextRequest } from 'next/server';
import { beforeEach, vi } from 'vitest';

export const TASK_ID = '11111111-1111-4111-8111-111111111111';
export const SOURCE_WS_ID = '22222222-2222-4222-8222-222222222222';
export const PERSONAL_WS_ID = '33333333-3333-4333-8333-333333333333';
export const PERSONAL_BOARD_ID = '44444444-4444-4444-8444-444444444444';
export const SOURCE_BOARD_ID = '66666666-6666-4666-8666-666666666666';
export const PERSONAL_SOURCE_BOARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const STALE_PERSONAL_BOARD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const PERSONAL_LIST_ID = '77777777-7777-4777-8777-777777777777';
export const PERSONAL_DONE_LIST_ID = '12121212-1212-4121-8121-121212121212';
export const PERSONAL_CLOSED_LIST_ID = '13131313-1313-4131-8131-131313131313';
export const SOURCE_DONE_LIST_ID = '14141414-1414-4141-8141-141414141414';
export const SOURCE_CLOSED_LIST_ID = '15151515-1515-4151-8151-151515151515';
export const PREVIOUS_TASK_ID = '88888888-8888-4888-8888-888888888888';
export const NEXT_TASK_ID = '99999999-9999-4999-8999-999999999999';
export const PRODUCTION_PERSONAL_BOARD_ID =
  '2ad6c068-c69d-4011-a3c8-46ac45c3cd05';
export const PRODUCTION_PERSONAL_LIST_ID =
  '16b3fb2f-49ce-4e2b-9d6d-04d9b6f6bc29';
export const PRODUCTION_PREVIOUS_TASK_ID =
  'fee133d5-45b3-4561-99ee-2c9b74753e5a';

const mocks = vi.hoisted(() => {
  const adminRpc = vi.fn();
  const sourceTaskMaybeSingle = vi.fn();
  const sourceAssignmentMaybeSingle = vi.fn();
  const targetBoardMaybeSingle = vi.fn();
  const targetListMaybeSingle = vi.fn();
  const taskListLimit = vi.fn();
  const userOverrideMaybeSingle = vi.fn();
  const resolveTaskBoardAccess = vi.fn();
  const withSessionAuth = vi.fn((handler: unknown) => handler);

  const adminClient = {
    rpc: adminRpc,
    from: vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: sourceTaskMaybeSingle,
              })),
            })),
          })),
        };
      }

      if (table === 'workspace_boards') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: targetBoardMaybeSingle,
            })),
          })),
        };
      }

      if (table === 'task_lists') {
        const taskListQuery = {
          eq: vi.fn(),
          limit: taskListLimit,
          maybeSingle: targetListMaybeSingle,
          order: vi.fn(),
          select: vi.fn(),
        };
        taskListQuery.select.mockReturnValue(taskListQuery);
        taskListQuery.eq.mockReturnValue(taskListQuery);
        taskListQuery.order.mockReturnValue(taskListQuery);
        return taskListQuery;
      }

      if (table === 'task_assignees') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: sourceAssignmentMaybeSingle,
              })),
            })),
          })),
        };
      }

      if (table === 'task_user_overrides') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: userOverrideMaybeSingle,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(),
            })),
          })),
        };
      }

      return {};
    }),
  };

  const verifyWorkspaceMembershipType = vi.fn();

  return {
    adminRpc,
    adminClient,
    sourceAssignmentMaybeSingle,
    sourceTaskMaybeSingle,
    targetBoardMaybeSingle,
    targetListMaybeSingle,
    taskListLimit,
    userOverrideMaybeSingle,
    resolveTaskBoardAccess,
    verifyWorkspaceMembershipType,
    withSessionAuth,
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminClient)),
}));

vi.mock('@tuturuuu/utils/task-helper', () => ({
  getPersonalExternalStagingListId: (boardId: string) =>
    `personal-external-staging:${boardId}`,
  isPersonalExternalStagingListId: (listId: string | null | undefined) =>
    typeof listId === 'string' &&
    listId.startsWith('personal-external-staging:'),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@tuturuuu/tasks-api/server/board-access', () => ({
  resolveTaskBoardAccess: (
    ...args: Parameters<typeof mocks.resolveTaskBoardAccess>
  ) => mocks.resolveTaskBoardAccess(...args),
}));

export type PlacementRouteHandler = (
  request: NextRequest,
  context: unknown,
  params: { taskId: string }
) => Promise<Response>;

export function sourceTaskRow({
  closedAt = null,
  completed = false,
  completedAt = null,
  listId = '55555555-5555-4555-8555-555555555555',
  listName = 'Source List',
  listStatus = 'active',
  sourceBoardId = SOURCE_BOARD_ID,
  sourceWorkspaceId = SOURCE_WS_ID,
  sourceWorkspacePersonal = false,
}: {
  closedAt?: string | null;
  completed?: boolean | null;
  completedAt?: string | null;
  listId?: string;
  listName?: string | null;
  listStatus?: string | null;
  sourceBoardId?: string;
  sourceWorkspaceId?: string;
  sourceWorkspacePersonal?: boolean;
} = {}) {
  return {
    id: TASK_ID,
    display_number: 7,
    name: 'External source task',
    description: null,
    priority: 'normal',
    completed,
    completed_at: completedAt,
    sort_key: 100,
    start_date: null,
    end_date: null,
    estimation_points: null,
    created_at: '2026-05-06T00:00:00.000Z',
    list_id: listId,
    closed_at: closedAt,
    deleted_at: null,
    task_lists: {
      id: listId,
      name: listName,
      status: listStatus,
      color: 'BLUE',
      deleted: false,
      board_id: sourceBoardId,
      workspace_boards: {
        id: sourceBoardId,
        name: 'Source Board',
        ticket_prefix: 'SRC',
        ws_id: sourceWorkspaceId,
        deleted_at: null,
        archived_at: null,
        workspaces: {
          id: sourceWorkspaceId,
          name: 'Source Workspace',
          personal: sourceWorkspacePersonal,
        },
      },
    },
  };
}

export function targetBoardRow({
  boardId = PERSONAL_BOARD_ID,
  workspaceId = PERSONAL_WS_ID,
  personal = true,
}: {
  boardId?: string;
  workspaceId?: string;
  personal?: boolean;
} = {}) {
  return {
    id: boardId,
    ws_id: workspaceId,
    deleted_at: null,
    archived_at: null,
    workspaces: {
      id: workspaceId,
      personal,
    },
  };
}

export function targetListRow({
  boardId = PERSONAL_BOARD_ID,
  listId = PERSONAL_LIST_ID,
  listName = 'Personal List',
  listStatus = 'active',
  workspaceId = PERSONAL_WS_ID,
  personal = true,
}: {
  boardId?: string;
  listId?: string;
  listName?: string | null;
  listStatus?: string | null;
  workspaceId?: string;
  personal?: boolean;
} = {}) {
  return {
    id: listId,
    board_id: boardId,
    color: 'GREEN',
    created_at: '2026-05-05T00:00:00.000Z',
    deleted: false,
    name: listName,
    position: 1,
    status: listStatus,
    workspace_boards: targetBoardRow({
      boardId,
      workspaceId,
      personal,
    }),
  };
}

export function terminalListRow({
  boardId,
  listId,
  name,
  status,
}: {
  boardId: string;
  listId: string;
  name: string;
  status: 'closed' | 'done';
}) {
  return {
    id: listId,
    board_id: boardId,
    color: status === 'done' ? 'GREEN' : 'PURPLE',
    created_at: '2026-05-05T00:00:00.000Z',
    deleted: false,
    name,
    position: 1,
    status,
  };
}

beforeEach(() => {
  vi.resetModules();
  mocks.adminClient.from.mockClear();
  mocks.adminRpc.mockReset();
  mocks.sourceAssignmentMaybeSingle.mockReset();
  mocks.sourceTaskMaybeSingle.mockReset();
  mocks.targetBoardMaybeSingle.mockReset();
  mocks.targetListMaybeSingle.mockReset();
  mocks.taskListLimit.mockReset();
  mocks.userOverrideMaybeSingle.mockReset();
  mocks.verifyWorkspaceMembershipType.mockReset();
  mocks.withSessionAuth.mockReset();
  mocks.withSessionAuth.mockImplementation((handler: unknown) => handler);
  mocks.resolveTaskBoardAccess.mockReset();
  mocks.resolveTaskBoardAccess.mockResolvedValue({
    access: { mode: 'member', permission: 'edit' },
    board: { id: PERSONAL_BOARD_ID, ws_id: PERSONAL_WS_ID },
    boardId: PERSONAL_BOARD_ID,
    sbAdmin: mocks.adminClient,
    supabase: {},
    user: { id: 'user-1' },
    wsId: PERSONAL_WS_ID,
  });
});

export { mocks };
