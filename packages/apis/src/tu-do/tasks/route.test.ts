import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const mocks = vi.hoisted(() => {
  const adminQueues = new Map<string, QueryResult[]>();
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
      order: vi.fn((...args: unknown[]) => {
        query.calls.push(['order', args]);
        return query;
      }),
      range: vi.fn((...args: unknown[]) => {
        query.calls.push(['range', args]);
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

  const adminClient = {
    from: vi.fn((table: string) =>
      createQuery(table, dequeue(adminQueues, table))
    ),
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
  generateTaskEmbedding: vi.fn(),
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

function queuePersonalWorkspace() {
  queueResult(mocks.adminQueues, 'workspaces', {
    data: { personal: true },
    error: null,
  });
}

function queueSourceMembership() {
  queueResult(mocks.memberQueues, 'workspace_members', {
    data: [{ ws_id: SOURCE_WS_ID }],
    error: null,
  });
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

describe('workspace task route personal external loading', () => {
  beforeEach(() => {
    mocks.adminQueues.clear();
    mocks.memberQueues.clear();
    mocks.memberRpcQueues.clear();
    mocks.adminQueries.length = 0;
    mocks.adminClient.from.mockClear();
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
  });

  it('filters source tasks by requested task-list statuses', async () => {
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [],
      error: null,
      count: 0,
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/tasks?listStatuses=active,review&includeRelationshipSummary=false&includeCount=true'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    const taskQuery = mocks.adminQueries.find(
      (query) => query.table === 'tasks'
    );
    expect(taskQuery?.calls).toContainEqual([
      'in',
      ['task_lists.status', ['active', 'review']],
    ]);
    expect(taskQuery?.calls).toContainEqual([
      'is',
      ['task_lists.workspace_boards.archived_at', null],
    ]);
  });

  it('includes archived board tasks when requested', async () => {
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [],
      error: null,
      count: 0,
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/tasks?includeArchivedBoards=true&includeRelationshipSummary=false&includeCount=true'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    const taskQuery = mocks.adminQueries.find(
      (query) => query.table === 'tasks'
    );
    expect(taskQuery?.calls).not.toContainEqual([
      'is',
      ['task_lists.workspace_boards.archived_at', null],
    ]);
  });

  it('accepts a pre-authenticated app-session actor for personal workspace task reads', async () => {
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { id: PERSONAL_WS_ID },
      error: null,
    });
    queuePersonalWorkspace();
    queueResult(mocks.adminQueues, 'tasks', {
      data: [],
      error: null,
      count: 0,
    });

    const { handleTaskRouteGET } = await import('./route.js');
    const response = await handleTaskRouteGET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/tasks?includeRelationshipSummary=false&includeCount=true'
      ),
      { params: Promise.resolve({ wsId: 'personal' }) },
      {
        appSession: true,
        supabase: mocks.adminClient as never,
        user: { id: USER_ID } as never,
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 0,
      tasks: [],
    });
    expect(mocks.resolveAuthenticatedSessionUser).not.toHaveBeenCalled();
    expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: mocks.adminClient,
        userId: USER_ID,
        wsId: PERSONAL_WS_ID,
      })
    );
  });

  it('loads placed external tasks for a real personal list when boardId is present', async () => {
    queuePersonalWorkspace();
    queueResult(mocks.adminQueues, 'tasks', {
      data: [],
      error: null,
      count: 0,
    });
    queueResult(mocks.adminQueues, 'task_user_overrides', {
      data: [
        {
          task_id: PLACED_TASK_ID,
          personal_board_id: PERSONAL_BOARD_ID,
          personal_list_id: PERSONAL_LIST_ID,
          personal_sort_key: 1_500_000,
          personal_added_at: '2026-05-07T00:00:00.000Z',
          personal_placed_at: '2026-05-07T01:00:00.000Z',
        },
      ],
      error: null,
      count: 1,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [externalTask(PLACED_TASK_ID)],
      error: null,
    });
    queueSourceMembership();
    queueEmptyPersonalMetadata();

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/personal/tasks?boardId=${PERSONAL_BOARD_ID}&listId=${PERSONAL_LIST_ID}&includeRelationshipSummary=false`
      ),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.tasks).toHaveLength(1);
    expect(payload.tasks[0]).toEqual(
      expect.objectContaining({
        id: PLACED_TASK_ID,
        list_id: PERSONAL_LIST_ID,
        personal_board_id: PERSONAL_BOARD_ID,
        personal_list_id: PERSONAL_LIST_ID,
        personal_sort_key: 1_500_000,
        is_personal_external: true,
        is_personal_external_default: false,
      })
    );
  });

  it('uses RPC-backed external counts for personal list totals', async () => {
    queuePersonalWorkspace();
    queueRpcResult('get_personal_task_board_external_counts', {
      data: [{ list_id: PERSONAL_LIST_ID, task_count: 7 }],
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [],
      error: null,
      count: 2,
    });
    queueResult(mocks.adminQueues, 'task_user_overrides', {
      data: [
        {
          task_id: PLACED_TASK_ID,
          personal_board_id: PERSONAL_BOARD_ID,
          personal_list_id: PERSONAL_LIST_ID,
          personal_sort_key: 1_500_000,
          personal_added_at: '2026-05-07T00:00:00.000Z',
          personal_placed_at: '2026-05-07T01:00:00.000Z',
        },
      ],
      error: null,
      count: 1,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [externalTask(PLACED_TASK_ID)],
      error: null,
    });
    queueSourceMembership();
    queueEmptyPersonalMetadata();

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/personal/tasks?boardId=${PERSONAL_BOARD_ID}&listId=${PERSONAL_LIST_ID}&includeRelationshipSummary=false&includeCount=true`
      ),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.count).toBe(9);
    expect(mocks.memberClient.rpc).toHaveBeenCalledWith(
      'get_personal_task_board_external_counts',
      {
        p_personal_board_id: PERSONAL_BOARD_ID,
        p_include_documents: false,
        p_include_done_closed: false,
      }
    );
  });

  it('keeps placed external tasks out of the virtual external lane', async () => {
    queuePersonalWorkspace();
    queueResult(mocks.adminQueues, 'tasks', {
      data: [],
      error: null,
      count: 0,
    });
    queueResult(mocks.adminQueues, 'task_user_overrides', {
      data: [],
      error: null,
      count: 0,
    });
    queueResult(mocks.adminQueues, 'task_user_overrides', {
      data: [{ task_id: PLACED_TASK_ID }],
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [externalTask(PLACED_TASK_ID), externalTask(UNPLACED_TASK_ID)],
      error: null,
      count: 2,
    });
    queueSourceMembership();
    queueEmptyPersonalMetadata();

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/personal/tasks?boardId=${PERSONAL_BOARD_ID}&listId=personal-external-staging:${PERSONAL_BOARD_ID}&includeRelationshipSummary=false`
      ),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.tasks.map((task: { id: string }) => task.id)).toEqual([
      UNPLACED_TASK_ID,
    ]);
    expect(
      mocks.adminQueries
        .filter((query) => query.table === 'task_user_overrides')
        .some((query) =>
          query.calls.some(
            ([method, args]) =>
              method === 'not' &&
              args[0] === 'personal_list_id' &&
              args[1] === 'is' &&
              args[2] === null
          )
        )
    ).toBe(true);
  });

  it('uses RPC-backed external counts for the virtual external lane', async () => {
    const stagingListId = `personal-external-staging:${PERSONAL_BOARD_ID}`;

    queuePersonalWorkspace();
    queueRpcResult('get_personal_task_board_external_counts', {
      data: [{ list_id: stagingListId, task_count: 2 }],
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [],
      error: null,
      count: 0,
    });
    queueResult(mocks.adminQueues, 'task_user_overrides', {
      data: [],
      error: null,
      count: 0,
    });
    queueResult(mocks.adminQueues, 'task_user_overrides', {
      data: [],
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [externalTask(PLACED_TASK_ID), externalTask(UNPLACED_TASK_ID)],
      error: null,
      count: 25,
    });
    queueSourceMembership();
    queueEmptyPersonalMetadata();

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/personal/tasks?boardId=${PERSONAL_BOARD_ID}&listId=${stagingListId}&includeRelationshipSummary=false&includeCount=true`
      ),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.count).toBe(2);
  });
});
