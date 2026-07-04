import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = {
  data: unknown;
  error: unknown;
};

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  isPersonalWorkspace: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  sessionSupabase: {},
  verifyWorkspaceMembershipType: vi.fn(),
}));

const OTHER_WORKSPACE_TASK_ID = '00000000-0000-4000-8000-000000000123';

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: unknown) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> }
    ) =>
      (
        handler as (
          request: NextRequest,
          sessionContext: {
            user: { id: string };
            supabase: typeof mocks.sessionSupabase;
          },
          params: { wsId: string }
        ) => Promise<Response>
      )(
        request,
        {
          user: { id: 'user-1' },
          supabase: mocks.sessionSupabase,
        },
        (await routeContext?.params) as { wsId: string }
      ),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
      mocks.getPermissions(...args),
    verifyWorkspaceMembershipType: (
      ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
    ) => mocks.verifyWorkspaceMembershipType(...args),
  };
});

vi.mock('@/lib/workspace-helper', () => ({
  getWorkspaceConfig: (...args: Parameters<typeof mocks.getWorkspaceConfig>) =>
    mocks.getWorkspaceConfig(...args),
  isPersonalWorkspace: (
    ...args: Parameters<typeof mocks.isPersonalWorkspace>
  ) => mocks.isPersonalWorkspace(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

function createQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(() => query),
    insert: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => query),
    single: vi.fn(async () => result),
  };

  return query;
}

function createAdminClient(
  tableQueries: Record<string, ReturnType<typeof createQuery>[]>
) {
  const queues = new Map(
    Object.entries(tableQueries).map(([table, queries]) => [
      table,
      [...queries],
    ])
  );

  return {
    from: vi.fn((table: string) => {
      const queue = queues.get(table);
      if (!queue?.length) {
        throw new Error(`Unexpected table query: ${table}`);
      }

      return queue.length > 1 ? queue.shift() : queue[0];
    }),
  };
}

describe('time tracking sessions route task workspace binding', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getWorkspaceConfig.mockResolvedValue('false');
    mocks.isPersonalWorkspace.mockResolvedValue(false);
  });

  it('does not return a cross-workspace task summary for a running session', async () => {
    const sessionQuery = createQuery({
      data: {
        id: 'session-1',
        is_running: true,
        task: {
          id: OTHER_WORKSPACE_TASK_ID,
          name: 'Other workspace roadmap',
        },
        task_id: OTHER_WORKSPACE_TASK_ID,
        user_id: 'user-1',
        ws_id: 'ws-1',
      },
      error: null,
    });
    const taskQuery = createQuery({ data: null, error: null });
    const adminClient = createAdminClient({
      tasks: [taskQuery],
      time_tracking_sessions: [sessionQuery],
    });
    mocks.createAdminClient.mockResolvedValue(adminClient);

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/time-tracking/sessions/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/time-tracking/sessions?type=running'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      session: {
        id: 'session-1',
        task: null,
        task_id: OTHER_WORKSPACE_TASK_ID,
      },
    });
    expect(sessionQuery.select).toHaveBeenCalledWith(
      expect.not.stringContaining('task:tasks')
    );
    expect(taskQuery.eq).toHaveBeenCalledWith('id', OTHER_WORKSPACE_TASK_ID);
    expect(taskQuery.eq).toHaveBeenCalledWith('list.board.ws_id', 'ws-1');
  });

  it('rejects running session creation with a task outside the workspace', async () => {
    const taskQuery = createQuery({ data: null, error: null });
    const adminClient = createAdminClient({
      tasks: [taskQuery],
    });
    mocks.createAdminClient.mockResolvedValue(adminClient);

    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/time-tracking/sessions/route'
    );

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/time-tracking/sessions',
        {
          body: JSON.stringify({
            taskId: OTHER_WORKSPACE_TASK_ID,
            title: 'Investigate external task',
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Task not found',
    });
    expect(taskQuery.eq).toHaveBeenCalledWith('id', OTHER_WORKSPACE_TASK_ID);
  });
});
