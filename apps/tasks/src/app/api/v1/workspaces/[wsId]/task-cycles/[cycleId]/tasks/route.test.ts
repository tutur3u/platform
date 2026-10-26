import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  upsert: vi.fn(),
  deleteEq: vi.fn(),
  cycle: null as { ws_id: string } | null,
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
  mocks.deleteEq.mockResolvedValue({ error: null });
  mocks.cycle = { ws_id: WS_ID };
  mocks.task = taskIn(WS_ID);
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
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('rejects a cycle from another workspace without writing', async () => {
    mocks.cycle = { ws_id: FOREIGN_WS_ID };

    const response = await POST(request('POST'), context);

    expect(response.status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('rejects document-list tasks and invalid ids', async () => {
    mocks.task = taskIn(WS_ID, 'documents');
    expect((await POST(request('POST'), context)).status).toBe(400);
    mocks.task = taskIn(WS_ID);
    expect(
      (await POST(request('POST', JSON.stringify({ taskId: 'x' })), context))
        .status
    ).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('moves a same-workspace task into the cycle with one upsert', async () => {
    const response = await POST(request('POST'), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      taskId: TASK_ID,
      cycleId: CYCLE_ID,
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      { task_id: TASK_ID, cycle_id: CYCLE_ID },
      { onConflict: 'task_id' }
    );
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
        ['eq', 'cycle_links.cycle_id', CYCLE_ID],
        ['eq', 'list.board.ws_id', WS_ID],
        ['is', 'deleted_at', null],
      ])
    );
  });

  it('allows plain members to read', async () => {
    mocks.getPermissions.mockResolvedValue({ containsPermission: () => false });

    const response = await GET(request('GET'), context);

    expect(response.status).toBe(200);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });
});
