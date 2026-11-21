import { expect, vi } from 'vitest';

type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PERSONAL_WS_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_WS_ID = '33333333-3333-4333-8333-333333333333';
const PERSONAL_BOARD_ID = '44444444-4444-4444-8444-444444444444';
const PERSONAL_LIST_ID = '55555555-5555-4555-8555-555555555555';
const SOURCE_BOARD_ID = '66666666-6666-4666-8666-666666666666';
const SOURCE_LIST_ID = '77777777-7777-4777-8777-777777777777';
const PLACED_TASK_ID = '88888888-8888-4888-8888-888888888888';
const UNPLACED_TASK_ID = '99999999-9999-4999-8999-999999999999';
const LOCAL_TASK_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERSONAL_SOURCE_BOARD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const mocks = vi.hoisted(() => {
  const adminQueues = new Map<string, QueryResult[]>();
  const adminRpcQueues = new Map<string, QueryResult[]>();
  const memberQueues = new Map<string, QueryResult[]>();
  const memberRpcQueues = new Map<string, QueryResult[]>();
  const adminQueries: { table: string; calls: [string, unknown[]][] }[] = [];

  function createQuery(table: string, result: QueryResult) {
    const query = {
      calls: [] as [string, unknown[]][],
      select: vi.fn((...args: unknown[]) => {
        query.calls.push(['select', args]);
        return query;
      }),
      eq: vi.fn((...args: unknown[]) => {
        query.calls.push(['eq', args]);
        return query;
      }),
      neq: vi.fn((...args: unknown[]) => {
        query.calls.push(['neq', args]);
        return query;
      }),
      is: vi.fn((...args: unknown[]) => {
        query.calls.push(['is', args]);
        return query;
      }),
      not: vi.fn((...args: unknown[]) => {
        query.calls.push(['not', args]);
        return query;
      }),
      in: vi.fn((...args: unknown[]) => {
        query.calls.push(['in', args]);
        return query;
      }),
      ilike: vi.fn((...args: unknown[]) => {
        query.calls.push(['ilike', args]);
        return query;
      }),
      or: vi.fn((...args: unknown[]) => {
        query.calls.push(['or', args]);
        return query;
      }),
      gt: vi.fn((...args: unknown[]) => {
        query.calls.push(['gt', args]);
        return query;
      }),
      gte: vi.fn((...args: unknown[]) => {
        query.calls.push(['gte', args]);
        return query;
      }),
      lte: vi.fn((...args: unknown[]) => {
        query.calls.push(['lte', args]);
        return query;
      }),
      limit: vi.fn((...args: unknown[]) => {
        query.calls.push(['limit', args]);
        return query;
      }),
      order: vi.fn((...args: unknown[]) => {
        query.calls.push(['order', args]);
        return query;
      }),
      range: vi.fn((...args: unknown[]) => {
        query.calls.push(['range', args]);
        return query;
      }),
      insert: vi.fn((...args: unknown[]) => {
        query.calls.push(['insert', args]);
        return query;
      }),
      update: vi.fn((...args: unknown[]) => {
        query.calls.push(['update', args]);
        return query;
      }),
      maybeSingle: vi.fn(async () => result),
    };
    Object.defineProperty(query, 'then', {
      value: (
        resolve: (value: QueryResult) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject),
    });

    adminQueries.push({ table, calls: query.calls });
    return query;
  }

  function dequeue(queues: Map<string, QueryResult[]>, table: string) {
    return queues.get(table)?.shift() ?? { data: [], error: null };
  }

  const adminSchemaClient = {
    rpc: vi.fn((name: string) =>
      Promise.resolve(dequeue(adminRpcQueues, name))
    ),
  };
  const adminClient = {
    from: vi.fn((table: string) =>
      createQuery(table, dequeue(adminQueues, table))
    ),
    schema: vi.fn(() => adminSchemaClient),
    auth: {
      admin: {
        // Board access resolves guest mailbox authority from verified Auth.
        getUserById: vi.fn(async (id: string) => ({
          data: {
            user: {
              id,
              email: 'guest@example.com',
              email_confirmed_at: '2026-01-01T00:00:00.000Z',
            },
          },
          error: null,
        })),
      },
    },
  };
  const memberClient = {
    from: vi.fn((table: string) =>
      createQuery(table, dequeue(memberQueues, table))
    ),
    rpc: vi.fn((name: string) =>
      Promise.resolve(dequeue(memberRpcQueues, name))
    ),
  };

  return {
    adminClient,
    adminQueries,
    adminRpcQueues,
    adminSchemaClient,
    adminQueues,
    memberClient,
    memberQueues,
    memberRpcQueues,
    normalizeWorkspaceId: vi.fn(),
    resolveAuthenticatedSessionUser: vi.fn(),
    verifyWorkspaceMembershipType: vi.fn(),
  };
});

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => mocks.adminClient),
  createClient: vi.fn(async () => mocks.memberClient),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

vi.mock('./generate-task-embedding', () => ({
  generateTaskEmbedding: vi.fn(() => Promise.resolve()),
}));

function queueResult(
  queues: Map<string, QueryResult[]>,
  table: string,
  result: QueryResult
) {
  queues.set(table, [...(queues.get(table) ?? []), result]);
}

function queueRpcResult(name: string, result: QueryResult) {
  queueResult(mocks.memberRpcQueues, name, result);
}

function queueAdminRpcResult(name: string, result: QueryResult) {
  queueResult(mocks.adminRpcQueues, name, result);
}

function externalTask(id: string) {
  return {
    id,
    display_number: id === PLACED_TASK_ID ? 43 : 44,
    name: id === PLACED_TASK_ID ? 'Placed external task' : 'Unplaced task',
    description: null,
    priority: 'low',
    completed: false,
    completed_at: null,
    sort_key: 1_000_000,
    start_date: null,
    end_date: null,
    estimation_points: null,
    created_at: '2026-05-07T00:00:00.000Z',
    list_id: SOURCE_LIST_ID,
    closed_at: null,
    deleted_at: null,
    assignees: [],
    labels: [],
    projects: [],
    task_lists: {
      id: SOURCE_LIST_ID,
      name: 'Source To Do',
      color: 'GRAY',
      status: 'active',
      deleted: false,
      board_id: SOURCE_BOARD_ID,
      workspace_boards: {
        id: SOURCE_BOARD_ID,
        name: 'Source board',
        ws_id: SOURCE_WS_ID,
        deleted_at: null,
        archived_at: null,
        ticket_prefix: 'SRC',
        workspaces: {
          id: SOURCE_WS_ID,
          name: 'Source workspace',
          personal: false,
        },
      },
    },
  };
}

function personalBoardExternalTask(id: string) {
  const task = externalTask(id);

  return {
    ...task,
    name: 'Placed board-external personal task',
    task_lists: {
      ...task.task_lists,
      board_id: PERSONAL_SOURCE_BOARD_ID,
      workspace_boards: {
        ...task.task_lists.workspace_boards,
        id: PERSONAL_SOURCE_BOARD_ID,
        name: 'Personal source board',
        ws_id: PERSONAL_WS_ID,
        workspaces: {
          id: PERSONAL_WS_ID,
          name: 'Personal workspace',
          personal: true,
        },
      },
    },
  };
}

function boardTask(id: string) {
  const task = externalTask(id);

  return {
    ...task,
    name: 'CMS requirements task',
    list_id: PERSONAL_LIST_ID,
    task_lists: {
      ...task.task_lists,
      id: PERSONAL_LIST_ID,
      board_id: PERSONAL_BOARD_ID,
      workspace_boards: {
        ...task.task_lists.workspace_boards,
        id: PERSONAL_BOARD_ID,
        ws_id: PERSONAL_WS_ID,
        workspaces: {
          id: PERSONAL_WS_ID,
          name: 'Personal workspace',
          personal: false,
        },
      },
    },
  };
}

function queuePersonalWorkspace() {
  queueResult(mocks.adminQueues, 'workspaces', {
    data: { personal: true },
    error: null,
  });
}

function queueSourceMembership(workspaceId = SOURCE_WS_ID) {
  queueResult(mocks.memberQueues, 'workspace_members', {
    data: [{ ws_id: workspaceId }],
    error: null,
  });
}

function queueNoSourceMembership() {
  queueResult(mocks.memberQueues, 'workspace_members', {
    data: [],
    error: null,
  });
}

function expectSourceMembershipQueriesRequireMemberAccess() {
  const sourceMembershipQueries = mocks.adminQueries.filter(
    (query) => query.table === 'workspace_members'
  );

  expect(sourceMembershipQueries.length).toBeGreaterThan(0);
  expect(
    sourceMembershipQueries.every((query) =>
      query.calls.some(
        ([method, args]) =>
          method === 'eq' && args[0] === 'type' && args[1] === 'MEMBER'
      )
    )
  ).toBe(true);
}

function queueEmptyPersonalMetadata() {
  queueResult(mocks.adminQueues, 'task_user_override_labels', {
    data: [],
    error: null,
  });
  queueResult(mocks.adminQueues, 'task_user_override_projects', {
    data: [],
    error: null,
  });
}

export function resetTaskRouteFixtures() {
  vi.resetModules();
  mocks.adminQueues.clear();
  mocks.adminRpcQueues.clear();
  mocks.memberQueues.clear();
  mocks.memberRpcQueues.clear();
  mocks.adminQueries.length = 0;
  mocks.adminClient.from.mockClear();
  mocks.adminClient.schema.mockClear();
  mocks.adminSchemaClient.rpc.mockClear();
  mocks.memberClient.from.mockClear();
  mocks.memberClient.rpc.mockClear();
  mocks.normalizeWorkspaceId.mockClear();
  mocks.normalizeWorkspaceId.mockResolvedValue(PERSONAL_WS_ID);
  mocks.resolveAuthenticatedSessionUser.mockClear();
  mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
    user: { id: USER_ID },
    authError: null,
  });
  mocks.verifyWorkspaceMembershipType.mockClear();
  mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
}

export {
  USER_ID,
  PERSONAL_WS_ID,
  SOURCE_WS_ID,
  PERSONAL_BOARD_ID,
  PERSONAL_LIST_ID,
  SOURCE_BOARD_ID,
  SOURCE_LIST_ID,
  PLACED_TASK_ID,
  UNPLACED_TASK_ID,
  LOCAL_TASK_ID,
  PERSONAL_SOURCE_BOARD_ID,
  mocks,
  queueResult,
  queueRpcResult,
  queueAdminRpcResult,
  externalTask,
  personalBoardExternalTask,
  boardTask,
  queuePersonalWorkspace,
  queueSourceMembership,
  queueNoSourceMembership,
  expectSourceMembershipQueriesRequireMemberAccess,
  queueEmptyPersonalMetadata,
};
