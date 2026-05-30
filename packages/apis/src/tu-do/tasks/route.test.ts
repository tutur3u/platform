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

  it('uses the private RPC for current-board source filtering and hydrates rows by id', async () => {
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });
    queueAdminRpcResult('list_task_source_filter_ids', {
      data: [{ task_id: PLACED_TASK_ID, total_count: 1 }],
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [externalTask(PLACED_TASK_ID)],
      error: null,
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}&sourceScope=current_board&includeRelationshipSummary=false&includeCount=true`
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      tasks: [expect.objectContaining({ id: PLACED_TASK_ID })],
    });
    expect(mocks.adminClient.schema).toHaveBeenCalledWith('private');
    expect(mocks.adminSchemaClient.rpc).toHaveBeenCalledWith(
      'list_task_source_filter_ids',
      expect.objectContaining({
        p_actor_id: USER_ID,
        p_board_id: PERSONAL_BOARD_ID,
        p_source_scope: 'current_board',
        p_workspace_id: PERSONAL_WS_ID,
      })
    );
    expect(
      mocks.adminQueries.some((query) =>
        query.calls.some(
          ([method, args]) =>
            method === 'in' &&
            args[0] === 'id' &&
            Array.isArray(args[1]) &&
            args[1].includes(PLACED_TASK_ID)
        )
      )
    ).toBe(true);
  });

  it('avoids an unbounded external-specific query without selected sources', async () => {
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}&sourceScope=external_specific&includeRelationshipSummary=false&includeCount=true`
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 0,
      tasks: [],
    });
    expect(mocks.adminSchemaClient.rpc).not.toHaveBeenCalled();
  });

  it('passes specific source workspace and board filters to the private RPC', async () => {
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });
    queueAdminRpcResult('list_task_source_filter_ids', {
      data: [{ task_id: PLACED_TASK_ID, total_count: 1 }],
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [externalTask(PLACED_TASK_ID)],
      error: null,
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}&sourceScope=external_specific&sourceWorkspaceIds=${SOURCE_WS_ID}&sourceBoardIds=${SOURCE_BOARD_ID}&includeRelationshipSummary=false&includeCount=true`
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.count).toBe(1);
    expect(payload.tasks[0]).toEqual(
      expect.objectContaining({
        id: PLACED_TASK_ID,
        is_personal_external: false,
        source_board_id: SOURCE_BOARD_ID,
        source_workspace_id: SOURCE_WS_ID,
      })
    );
    expect(mocks.adminClient.schema).toHaveBeenCalledWith('private');
    expect(mocks.adminSchemaClient.rpc).toHaveBeenCalledWith(
      'list_task_source_filter_ids',
      expect.objectContaining({
        p_source_board_ids: [SOURCE_BOARD_ID],
        p_source_scope: 'external_specific',
        p_source_workspace_ids: [SOURCE_WS_ID],
      })
    );
  });

  it('uses the private RPC for current-workspace external source filters', async () => {
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });
    queueAdminRpcResult('list_task_source_filter_ids', {
      data: [],
      error: null,
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}&sourceScope=external_current_workspace&listStatuses=active,review&limit=25&offset=50&includeRelationshipSummary=false&includeCount=true`
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 0,
      tasks: [],
    });
    expect(mocks.adminClient.schema).toHaveBeenCalledWith('private');
    expect(mocks.adminSchemaClient.rpc).toHaveBeenCalledWith(
      'list_task_source_filter_ids',
      expect.objectContaining({
        p_board_id: PERSONAL_BOARD_ID,
        p_limit: 25,
        p_list_statuses: ['active', 'review'],
        p_offset: 50,
        p_source_scope: 'external_current_workspace',
      })
    );
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

  it('rejects external source filters for direct board guests', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });
    queueResult(mocks.adminQueues, 'workspace_boards', {
      data: { id: PERSONAL_BOARD_ID, ws_id: PERSONAL_WS_ID },
      error: null,
    });
    queueResult(mocks.adminQueues, 'task_board_shares', {
      data: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          board_id: PERSONAL_BOARD_ID,
          permission: 'view',
          shared_with_user_id: USER_ID,
          workspace_boards: {
            id: PERSONAL_BOARD_ID,
            ws_id: PERSONAL_WS_ID,
          },
        },
      ],
      error: null,
    });
    queueResult(mocks.adminQueues, 'task_board_shares', {
      data: [],
      error: null,
    });

    const { handleTaskRouteGET } = await import('./route.js');
    const response = await handleTaskRouteGET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}&sourceScope=current_board`
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) },
      {
        supabase: mocks.memberClient as never,
        user: {
          email: 'guest@example.com',
          id: USER_ID,
        } as never,
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.adminClient.from).not.toHaveBeenCalledWith('tasks');
  });

  it('rejects workspace-only resource assignment for direct board guest task creation', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });
    queueResult(mocks.adminQueues, 'task_lists', {
      data: {
        board_id: PERSONAL_BOARD_ID,
        deleted: false,
        id: PERSONAL_LIST_ID,
        status: 'active',
        workspace_boards: {
          ws_id: PERSONAL_WS_ID,
        },
      },
      error: null,
    });
    queueResult(mocks.adminQueues, 'task_lists', {
      data: {
        board_id: PERSONAL_BOARD_ID,
        id: PERSONAL_LIST_ID,
        workspace_boards: {
          id: PERSONAL_BOARD_ID,
          ws_id: PERSONAL_WS_ID,
        },
      },
      error: null,
    });
    queueResult(mocks.adminQueues, 'task_board_shares', {
      data: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          board_id: PERSONAL_BOARD_ID,
          permission: 'edit',
          shared_with_user_id: USER_ID,
          workspace_boards: {
            id: PERSONAL_BOARD_ID,
            ws_id: PERSONAL_WS_ID,
          },
        },
      ],
      error: null,
    });
    queueResult(mocks.adminQueues, 'task_board_shares', {
      data: [],
      error: null,
    });

    const { handleTaskRoutePOST } = await import('./route.js');
    const response = await handleTaskRoutePOST(
      new NextRequest('http://localhost/api/v1/workspaces/ws-1/tasks', {
        body: JSON.stringify({
          label_ids: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
          listId: PERSONAL_LIST_ID,
          name: 'Guest task',
        }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'ws-1' }) },
      {
        supabase: mocks.memberClient as never,
        user: {
          email: 'guest@example.com',
          id: USER_ID,
        } as never,
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Guests cannot assign workspace-only task resources',
    });
    expect(mocks.adminClient.from).not.toHaveBeenCalledWith('tasks');
  });
});
