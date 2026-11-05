import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  upsert: vi.fn(),
  rpc: vi.fn(),
  deleteEq: vi.fn(),
  cycle: null as {
    ws_id: string;
    board_id?: string | null;
    deleted?: boolean | null;
  } | null,
  task: null as Record<string, unknown> | null,
  listCalls: [] as Array<[string, ...unknown[]]>,
  listResult: { data: [] as unknown[], error: null as unknown },
  sessionUser: { email: 'member@example.com', id: 'user-1' },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => mocks.getPermissions(...args),
  normalizeWorkspaceId: (...args: unknown[]) =>
    mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: { supabase: unknown; user: unknown },
        params: Record<string, string>
      ) => Promise<Response>
    ) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<Record<string, string>> }
    ) =>
      handler(
        request,
        { supabase: {}, user: mocks.sessionUser },
        await Promise.resolve(routeContext?.params ?? {})
      ),
}));

import { DELETE, GET, POST } from './route';

const WS_ID = '00000000-0000-4000-8000-000000000001';
const FOREIGN_WS_ID = '00000000-0000-4000-8000-000000000009';
const CYCLE_ID = '00000000-0000-4000-8000-000000000002';
const TASK_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_CYCLE_ID = '00000000-0000-4000-8000-000000000004';
const SPRINT_ID = '00000000-0000-4000-8000-000000000005';
const BOARD_ID = '00000000-0000-4000-8000-000000000006';
const URL = `http://localhost/api/v1/workspaces/${WS_ID}/task-cycles/${CYCLE_ID}/tasks`;

function single(data: () => unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: data(), error: null })),
      })),
    })),
  };
}

function listQuery() {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'in', 'not', 'order']) {
    builder[method] = (...args: unknown[]) => {
      mocks.listCalls.push([method, ...args]);
      return builder;
    };
  }
  builder.limit = async () => mocks.listResult;
  return builder;
}

const admin = {
  rpc: (...args: unknown[]) => mocks.rpc(...args),
  from: vi.fn((table: string) => {
    if (table === 'task_cycles') return single(() => mocks.cycle);
    if (table === 'tasks')
      return mocks.task ? single(() => mocks.task) : listQuery();
    if (table === 'task_cycle_tasks')
      return {
        upsert: mocks.upsert,
        delete: () => ({ eq: () => ({ eq: mocks.deleteEq }) }),
      };
    throw new Error(`Unexpected table: ${table}`);
  }),
};

function request(method: string, body = JSON.stringify({ taskId: TASK_ID })) {
  return new NextRequest(URL, method === 'GET' ? {} : { body, method });
}

const context = { params: Promise.resolve({ cycleId: CYCLE_ID, wsId: WS_ID }) };

function taskIn(wsId: string, status = 'active') {
  return {
    id: TASK_ID,
    deleted_at: null,
    task_lists: { status, workspace_boards: { ws_id: wsId } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listCalls = [];
  mocks.listResult = { data: [], error: null };
  mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
  mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  mocks.getPermissions.mockResolvedValue({
    containsPermission: (permission: string) =>
      permission === 'manage_projects',
  });
  mocks.createAdminClient.mockResolvedValue(admin);
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.deleteEq.mockResolvedValue({ error: null });
  mocks.cycle = { ws_id: WS_ID, board_id: null, deleted: false };
  mocks.task = taskIn(WS_ID);
});

const BOARD_SPRINT_ERROR = {
  code: 'board_sprint',
  error: "This cycle is a board sprint; plan it from the board's sprint view",
};

describe('board sprints and deleted cycles are out of scope', () => {
  it('refuses to assign into a board sprint without writing', async () => {
    mocks.cycle = { ws_id: WS_ID, board_id: BOARD_ID, deleted: false };

    const response = await POST(request('POST'), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(BOARD_SPRINT_ERROR);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses to remove a task from a board sprint (its rows are history)', async () => {
    mocks.cycle = { ws_id: WS_ID, board_id: BOARD_ID, deleted: false };

    const response = await DELETE(request('DELETE'), context);

    expect(response.status).toBe(400);
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });

  it('refuses to list a board sprint as a planning cycle', async () => {
    mocks.cycle = { ws_id: WS_ID, board_id: BOARD_ID, deleted: false };
    mocks.task = null;

    const response = await GET(request('GET'), context);

    expect(response.status).toBe(400);
    expect(mocks.listCalls).toEqual([]);
  });

  it('treats a deleted cycle as not found', async () => {
    mocks.cycle = { ws_id: WS_ID, board_id: null, deleted: true };

    expect((await POST(request('POST'), context)).status).toBe(404);
    expect((await DELETE(request('DELETE'), context)).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });

  it('maps a board-sprint refusal from the rpc (cycle changed in between) to 400', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: '22023',
        message: 'Board sprints are managed by the board sprint functions',
      },
    });

    const response = await POST(request('POST'), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(BOARD_SPRINT_ERROR);
  });
});

describe('POST assign task to cycle', () => {
  it('rejects nonmembers before any service-role access', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_missing',
      ok: false,
    });

    const response = await POST(request('POST'), context);

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('requires manage_projects', async () => {
    mocks.getPermissions.mockResolvedValue({ containsPermission: () => false });

    const response = await POST(request('POST'), context);

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a task from another workspace without writing', async () => {
    mocks.task = taskIn(FOREIGN_WS_ID);

    const response = await POST(request('POST'), context);

    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects a cycle from another workspace without writing', async () => {
    mocks.cycle = { ws_id: FOREIGN_WS_ID };

    const response = await POST(request('POST'), context);

    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects document-list tasks and invalid ids', async () => {
    mocks.task = taskIn(WS_ID, 'documents');
    expect((await POST(request('POST'), context)).status).toBe(400);
    mocks.task = taskIn(WS_ID);
    expect(
      (await POST(request('POST', JSON.stringify({ taskId: 'x' })), context))
        .status
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('moves a same-workspace task through the assign_task_cycle rpc', async () => {
    const response = await POST(request('POST'), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      taskId: TASK_ID,
      cycleId: CYCLE_ID,
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('assign_task_cycle', {
      p_task_id: TASK_ID,
      p_cycle_id: CYCLE_ID,
    });
    // ON CONFLICT (task_id) needs a unique index this PR no longer adds.
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 when the database refuses a cross-workspace link', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'Task and cycle must belong to the same workspace',
      },
    });

    const response = await POST(request('POST'), context);

    expect(response.status).toBe(404);
  });

  it('returns 404 when the task or cycle disappears before the write', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0002', message: 'Task not found' },
    });

    const response = await POST(request('POST'), context);

    expect(response.status).toBe(404);
  });

  it('returns a retryable 409 when a concurrent assign holds the task', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: '55P03',
        message: 'canceling statement due to lock timeout',
      },
    });

    const response = await POST(request('POST'), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Task is being moved by another request; retry',
    });
  });

  it('returns a retryable 409 on a deadlock', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '40P01', message: 'deadlock detected' },
    });

    const response = await POST(request('POST'), context);

    expect(response.status).toBe(409);
  });

  it('returns 500, not 404, when the rpc EXECUTE grant is missing', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'permission denied for function assign_task_cycle',
      },
    });

    const response = await POST(request('POST'), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to assign task to cycle',
    });
  });

  it('returns 500 for other assign failures', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'boom' },
    });

    const response = await POST(request('POST'), context);

    expect(response.status).toBe(500);
  });
});

describe('malformed route params', () => {
  it('returns 404 for a malformed cycle id without querying', async () => {
    const response = await POST(request('POST'), {
      params: Promise.resolve({ cycleId: 'not-a-uuid', wsId: WS_ID }),
    });

    expect(response.status).toBe(404);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('returns 404 when the workspace does not normalize to a uuid', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValue('not-a-uuid');

    const response = await GET(request('GET'), context);

    expect(response.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});

describe('DELETE unassign task from cycle', () => {
  it('rejects a foreign cycle without deleting', async () => {
    mocks.cycle = { ws_id: FOREIGN_WS_ID };

    const response = await DELETE(request('DELETE'), context);

    expect(response.status).toBe(404);
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });

  it('removes the link scoped to this cycle and task', async () => {
    const response = await DELETE(request('DELETE'), context);

    expect(response.status).toBe(200);
    expect(mocks.deleteEq).toHaveBeenCalledWith('task_id', TASK_ID);
  });
});

describe('GET cycle tasks', () => {
  beforeEach(() => {
    mocks.task = null;
  });

  it('maps rows to the planning task shape scoped to the workspace', async () => {
    mocks.listResult = {
      data: [
        {
          id: TASK_ID,
          name: 'Task',
          display_number: 7,
          priority: 'high',
          list: {
            status: 'active',
            board: { id: 'board-1', ticket_prefix: 'TT' },
          },
          cycle_links: [{ cycle_id: CYCLE_ID }],
          assignees: [
            { user: { id: 'u1', display_name: 'U', avatar_url: null } },
            { user: null },
          ],
          projects: [{ project: { id: 'p1', name: 'P' } }],
          labels: [{ label: { id: 'l1', name: 'L' } }],
        },
      ],
      error: null,
    };

    const response = await GET(request('GET'), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tasks: [
        {
          id: TASK_ID,
          name: 'Task',
          display_number: 7,
          ticket_prefix: 'TT',
          priority: 'high',
          status: 'active',
          board_id: 'board-1',
          cycle_id: CYCLE_ID,
          assignees: [{ id: 'u1', display_name: 'U', avatar_url: null }],
          projects: [{ id: 'p1', name: 'P' }],
          labels: [{ id: 'l1', name: 'L' }],
        },
      ],
    });
    expect(mocks.listCalls).toEqual(
      expect.arrayContaining([
        ['eq', 'in_cycle.cycle_id', CYCLE_ID],
        ['is', 'cycle_links.cycle.board_id', null],
        ['not', 'cycle_links.cycle.deleted', 'is', true],
        ['eq', 'list.board.ws_id', WS_ID],
        ['is', 'deleted_at', null],
      ])
    );
  });

  it('lists a task with duplicate links only in its newest cycle', async () => {
    const row = (id: string, cycleLinks: unknown[]) => ({
      id,
      name: id,
      display_number: null,
      priority: null,
      list: { status: 'active', board: { id: BOARD_ID, ticket_prefix: null } },
      cycle_links: cycleLinks,
      assignees: [],
      projects: [],
      labels: [],
    });
    const plain = { board_id: null, deleted: false };
    mocks.listResult = {
      data: [
        // Newer link to another workspace cycle: listed there, not here.
        row('moved-on', [
          {
            cycle_id: CYCLE_ID,
            created_at: '2026-01-01T00:00:00Z',
            cycle: plain,
          },
          {
            cycle_id: OTHER_CYCLE_ID,
            created_at: '2026-02-01T00:00:00Z',
            cycle: plain,
          },
        ]),
        // Newest link is this cycle.
        row('newest-here', [
          {
            cycle_id: OTHER_CYCLE_ID,
            created_at: '2026-01-01T00:00:00Z',
            cycle: plain,
          },
          {
            cycle_id: CYCLE_ID,
            created_at: '2026-02-01T00:00:00Z',
            cycle: plain,
          },
        ]),
        // A newer board-sprint row never moves a task out of this cycle.
        row('also-in-sprint', [
          {
            cycle_id: CYCLE_ID,
            created_at: '2026-01-01T00:00:00Z',
            cycle: plain,
          },
          {
            cycle_id: SPRINT_ID,
            created_at: '2026-03-01T00:00:00Z',
            cycle: { board_id: BOARD_ID, deleted: false },
          },
        ]),
      ],
      error: null,
    };

    const response = await GET(request('GET'), context);
    const body = (await response.json()) as {
      tasks: { id: string; cycle_id: string | null }[];
    };

    expect(body.tasks.map((task) => [task.id, task.cycle_id])).toEqual([
      ['newest-here', CYCLE_ID],
      ['also-in-sprint', CYCLE_ID],
    ]);
  });

  it('allows plain members to read', async () => {
    mocks.getPermissions.mockResolvedValue({ containsPermission: () => false });

    const response = await GET(request('GET'), context);

    expect(response.status).toBe(200);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });
});
