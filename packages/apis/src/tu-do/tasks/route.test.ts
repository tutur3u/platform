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
const LOCAL_TASK_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

function queueSourceMembership() {
  queueResult(mocks.memberQueues, 'workspace_members', {
    data: [{ ws_id: SOURCE_WS_ID }],
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

  it('uses the direct board query for due-dated task filtering', async () => {
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
        `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}&hasDueDate=true&includeRelationshipSummary=false&includeCount=true`
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 0,
      tasks: [],
    });
    expect(mocks.adminSchemaClient.rpc).not.toHaveBeenCalledWith(
      'list_task_source_filter_ids',
      expect.anything()
    );
    const taskQuery = mocks.adminQueries.find(
      (query) => query.table === 'tasks'
    );
    expect(taskQuery?.calls).toContainEqual([
      'eq',
      ['task_lists.board_id', PERSONAL_BOARD_ID],
    ]);
    expect(taskQuery?.calls).toContainEqual([
      'is',
      ['task_lists.workspace_boards.deleted_at', null],
    ]);
    expect(taskQuery?.calls).toContainEqual(['not', ['end_date', 'is', null]]);
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

  it('uses the direct board query for all-visible board search', async () => {
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [boardTask(PLACED_TASK_ID)],
      error: null,
      count: 1,
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}&sourceScope=all_visible&q=cms&limit=200&includeRelationshipSummary=false`
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tasks: [expect.objectContaining({ id: PLACED_TASK_ID })],
    });
    expect(mocks.adminSchemaClient.rpc).not.toHaveBeenCalledWith(
      'list_task_source_filter_ids',
      expect.anything()
    );

    const taskQuery = mocks.adminQueries.find(
      (query) => query.table === 'tasks'
    );
    expect(taskQuery?.calls).toContainEqual([
      'eq',
      ['task_lists.board_id', PERSONAL_BOARD_ID],
    ]);
    expect(taskQuery?.calls).toContainEqual([
      'is',
      ['task_lists.workspace_boards.deleted_at', null],
    ]);
    expect(taskQuery?.calls).toContainEqual(['ilike', ['name', '%cms%']]);
  });

  it('keeps board task reads available when relationship summaries fail', async () => {
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [boardTask(PLACED_TASK_ID)],
      error: null,
      count: 1,
    });
    queueResult(mocks.adminQueues, 'task_relationships', {
      data: null,
      error: { message: 'relationship query failed' },
    });
    queueResult(mocks.adminQueues, 'task_relationships', {
      data: [],
      error: null,
    });
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}`
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tasks: [
        expect.objectContaining({
          id: PLACED_TASK_ID,
          relationship_summary: {
            blocked_by_count: 0,
            blocking_count: 0,
            child_count: 0,
            completed_child_count: 0,
            parent_task: null,
            parent_task_id: null,
            related_count: 0,
          },
        }),
      ],
    });
    expect(
      mocks.adminQueries.some((query) => query.table === 'task_relationships')
    ).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to load task relationship summaries:',
      expect.any(Error)
    );
  });

  it('skips relationship summary queries when the client opts out', async () => {
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [boardTask(PLACED_TASK_ID)],
      error: null,
      count: 1,
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}&includeRelationshipSummary=false`
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tasks: [expect.objectContaining({ id: PLACED_TASK_ID })],
    });
    expect(
      mocks.adminQueries.some((query) => query.table === 'task_relationships')
    ).toBe(false);
  });

  it('hydrates per-user scheduling settings for returned board tasks', async () => {
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [boardTask(PLACED_TASK_ID), boardTask(UNPLACED_TASK_ID)],
      error: null,
      count: 2,
    });
    queueResult(mocks.memberQueues, 'task_user_scheduling_settings', {
      data: [
        {
          auto_schedule: true,
          calendar_hours: 'work_hours',
          is_splittable: true,
          max_split_duration_minutes: 90,
          min_split_duration_minutes: 30,
          task_id: PLACED_TASK_ID,
          total_duration: 2,
        },
      ],
      error: null,
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}&includeRelationshipSummary=false&includeCount=true`
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    const scheduledTask = payload.tasks.find(
      (task: { id: string }) => task.id === PLACED_TASK_ID
    );
    const unscheduledTask = payload.tasks.find(
      (task: { id: string }) => task.id === UNPLACED_TASK_ID
    );

    expect(scheduledTask).toEqual(
      expect.objectContaining({
        auto_schedule: true,
        calendar_hours: 'work_hours',
        is_splittable: true,
        max_split_duration_minutes: 90,
        min_split_duration_minutes: 30,
        total_duration: 2,
      })
    );
    expect(unscheduledTask).toBeDefined();
    expect(unscheduledTask?.total_duration).toBeUndefined();
    expect(
      mocks.adminQueries
        .filter((query) => query.table === 'task_user_scheduling_settings')
        .some(
          (query) =>
            query.calls.some(
              ([method, args]) =>
                method === 'eq' && args[0] === 'user_id' && args[1] === USER_ID
            ) &&
            query.calls.some(
              ([method, args]) =>
                method === 'in' &&
                args[0] === 'task_id' &&
                Array.isArray(args[1]) &&
                args[1].includes(PLACED_TASK_ID) &&
                args[1].includes(UNPLACED_TASK_ID)
            )
        )
    ).toBe(true);
  });

  it('uses the private RPC for all-visible relation filters', async () => {
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
        `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}&sourceScope=all_visible&labelIds=${SOURCE_LIST_ID}&includeRelationshipSummary=false&includeCount=true`
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
        p_label_ids: [SOURCE_LIST_ID],
        p_source_scope: 'all_visible',
      })
    );
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

  it('uses the private RPC for board search and relation filters', async () => {
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });
    queueAdminRpcResult('list_task_source_filter_ids', {
      data: [
        {
          list_id: PERSONAL_LIST_ID,
          task_id: PLACED_TASK_ID,
          total_count: 1,
        },
      ],
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [externalTask(PLACED_TASK_ID)],
      error: null,
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}&q=LAUNCH&labelIds=${SOURCE_LIST_ID}&assigneeIds=${USER_ID}&projectIds=${SOURCE_BOARD_ID}&priorities=critical,high&estimationMin=2&estimationMax=5&dueDateFrom=2026-06-01&dueDateTo=2026-06-30&includeUnassigned=true&sortBy=name-asc&includeRelationshipSummary=false&includeCount=true`
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
        p_assignee_ids: [USER_ID],
        p_due_date_from: '2026-06-01',
        p_due_date_to: '2026-06-30',
        p_estimation_max: 5,
        p_estimation_min: 2,
        p_has_due_date: false,
        p_include_unassigned: true,
        p_label_ids: [SOURCE_LIST_ID],
        p_priorities: ['critical', 'high'],
        p_project_ids: [SOURCE_BOARD_ID],
        p_search: 'LAUNCH',
        p_sort_by: 'name-asc',
      })
    );
  });

  it('returns server-side filtered list counts from the private count RPC', async () => {
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });
    queueAdminRpcResult('count_task_source_filter_lists', {
      data: [{ list_id: PERSONAL_LIST_ID, total_count: 2 }],
      error: null,
    });
    queueAdminRpcResult('list_task_source_filter_ids', {
      data: [],
      error: null,
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}&q=launch&hasDueDate=true&estimationMin=1&estimationMax=8&limit=0&includeListCounts=true&includeRelationshipSummary=false`
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      listCounts: [{ count: 2, list_id: PERSONAL_LIST_ID }],
      tasks: [],
    });
    expect(mocks.adminSchemaClient.rpc).toHaveBeenCalledWith(
      'count_task_source_filter_lists',
      expect.objectContaining({
        p_board_id: PERSONAL_BOARD_ID,
        p_estimation_max: 8,
        p_estimation_min: 1,
        p_has_due_date: true,
        p_search: 'launch',
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
    queueResult(mocks.memberQueues, 'task_user_scheduling_settings', {
      data: [
        {
          auto_schedule: false,
          calendar_hours: 'personal_hours',
          is_splittable: false,
          max_split_duration_minutes: null,
          min_split_duration_minutes: null,
          task_id: PLACED_TASK_ID,
          total_duration: 1.5,
        },
      ],
      error: null,
    });

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
        total_duration: 1.5,
        calendar_hours: 'personal_hours',
      })
    );
    expectSourceMembershipQueriesRequireMemberAccess();
  });

  it('serves the production personal board due-date query without duplicating external tasks', async () => {
    const dueLocalTask = {
      ...boardTask(LOCAL_TASK_ID),
      end_date: '2026-07-04T08:00:00.000Z',
    };
    const duePlacedTask = {
      ...externalTask(PLACED_TASK_ID),
      end_date: '2026-07-04T09:00:00.000Z',
    };
    const dueDefaultTask = {
      ...externalTask(UNPLACED_TASK_ID),
      end_date: '2026-07-05T09:00:00.000Z',
    };

    queuePersonalWorkspace();
    queueResult(mocks.adminQueues, 'tasks', {
      data: [dueLocalTask],
      error: null,
      count: 1,
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
      data: [duePlacedTask],
      error: null,
    });
    queueSourceMembership();
    queueResult(mocks.adminQueues, 'tasks', {
      data: [duePlacedTask, dueDefaultTask],
      error: null,
      count: 2,
    });
    queueSourceMembership();
    queueEmptyPersonalMetadata();
    queueResult(mocks.memberQueues, 'task_user_scheduling_settings', {
      data: [],
      error: null,
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${PERSONAL_WS_ID}/tasks?boardId=${PERSONAL_BOARD_ID}&sourceScope=all_visible&listStatuses=not_started,active&limit=200&offset=0&completed=exclude&closed=exclude&hasDueDate=true&externalSortBy=due-asc&includeRelationshipSummary=false`
      ),
      { params: Promise.resolve({ wsId: PERSONAL_WS_ID }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    const taskIds = payload.tasks.map((task: { id: string }) => task.id);

    expect(taskIds).toEqual([LOCAL_TASK_ID, PLACED_TASK_ID, UNPLACED_TASK_ID]);
    expect(new Set(taskIds).size).toBe(taskIds.length);
    expect(mocks.adminSchemaClient.rpc).not.toHaveBeenCalledWith(
      'list_task_source_filter_ids',
      expect.anything()
    );

    const placedExternalQuery = mocks.adminQueries.find(
      (query) =>
        query.table === 'tasks' &&
        query.calls.some(
          ([method, args]) =>
            method === 'in' &&
            args[0] === 'id' &&
            Array.isArray(args[1]) &&
            args[1].includes(PLACED_TASK_ID)
        )
    );
    const defaultExternalQuery = mocks.adminQueries.find(
      (query) =>
        query.table === 'tasks' &&
        query.calls.some(
          ([method, args]) =>
            method === 'neq' &&
            args[0] === 'task_lists.workspace_boards.ws_id' &&
            args[1] === PERSONAL_WS_ID
        )
    );

    for (const query of [placedExternalQuery, defaultExternalQuery]) {
      expect(query?.calls).toContainEqual([
        'in',
        ['task_lists.status', ['not_started', 'active']],
      ]);
      expect(query?.calls).toContainEqual(['is', ['completed_at', null]]);
      expect(query?.calls).toContainEqual(['is', ['closed_at', null]]);
      expect(query?.calls).toContainEqual(['not', ['end_date', 'is', null]]);
    }

    expect(defaultExternalQuery?.calls).toContainEqual([
      'order',
      ['end_date', { ascending: true, nullsFirst: false }],
    ]);
    expect(defaultExternalQuery?.calls).toContainEqual(['range', [0, 199]]);
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
    expectSourceMembershipQueriesRequireMemberAccess();
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
    expectSourceMembershipQueriesRequireMemberAccess();
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

  it('filters default external tasks without member access to the source workspace', async () => {
    const stagingListId = `personal-external-staging:${PERSONAL_BOARD_ID}`;

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
      data: [],
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [externalTask(UNPLACED_TASK_ID)],
      error: null,
      count: 1,
    });
    queueNoSourceMembership();

    const { GET } = await import('./route.js');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/personal/tasks?boardId=${PERSONAL_BOARD_ID}&listId=${stagingListId}&includeRelationshipSummary=false&includeCount=true`
      ),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 0,
      tasks: [],
    });
    expectSourceMembershipQueriesRequireMemberAccess();
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
    expectSourceMembershipQueriesRequireMemberAccess();
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

  it('renormalizes exhausted list sort keys before creating a task', async () => {
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
    queueResult(mocks.adminQueues, 'tasks', {
      data: { sort_key: 1 },
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [
        {
          created_at: '2026-05-07T00:00:00.000Z',
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          sort_key: 1,
        },
        {
          created_at: '2026-05-08T00:00:00.000Z',
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          sort_key: 2,
        },
      ],
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', { data: null, error: null });
    queueResult(mocks.adminQueues, 'tasks', { data: null, error: null });
    queueResult(mocks.adminQueues, 'tasks', {
      data: { sort_key: 1_000_000 },
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: {
        completed: false,
        created_at: '2026-05-09T00:00:00.000Z',
        description: null,
        display_number: 45,
        end_date: null,
        estimation_points: null,
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        list_id: PERSONAL_LIST_ID,
        name: 'Created task',
        priority: null,
        sort_key: 500_001,
        start_date: null,
        task_lists: {
          name: 'To Do',
          workspace_boards: {
            name: 'Board',
            ticket_prefix: 'TASK',
          },
        },
      },
      error: null,
    });

    const { handleTaskRoutePOST } = await import('./route.js');
    const response = await handleTaskRoutePOST(
      new NextRequest('http://localhost/api/v1/workspaces/ws-1/tasks', {
        body: JSON.stringify({
          listId: PERSONAL_LIST_ID,
          name: 'Created task',
        }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'ws-1' }) },
      {
        supabase: mocks.memberClient as never,
        user: {
          email: 'member@example.com',
          id: USER_ID,
        } as never,
      }
    );

    expect(response.status).toBe(201);

    const taskQueries = mocks.adminQueries.filter(
      (query) => query.table === 'tasks'
    );
    const updateCalls = taskQueries
      .map((query) => query.calls.find(([method]) => method === 'update'))
      .filter((call): call is [string, unknown[]] => Boolean(call));
    expect(updateCalls).toEqual([
      ['update', [{ sort_key: 1_000_000 }]],
      ['update', [{ sort_key: 2_000_000 }]],
    ]);

    const insertCall = taskQueries
      .flatMap((query) => query.calls)
      .find(([method]) => method === 'insert');
    const [insertPayload] = insertCall?.[1] ?? [];
    expect(insertPayload).toEqual(
      expect.objectContaining({
        list_id: PERSONAL_LIST_ID,
        name: 'Created task',
        sort_key: expect.any(Number),
      })
    );
    expect((insertPayload as { sort_key: number }).sort_key).toBeGreaterThan(0);
    expect((insertPayload as { sort_key: number }).sort_key).toBeLessThan(
      1_000_000
    );
  });
});
