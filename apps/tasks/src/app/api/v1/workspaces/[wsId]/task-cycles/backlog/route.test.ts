import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  calls: [] as Array<[string, ...unknown[]]>,
  result: { data: [] as unknown[], error: null as unknown },
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (...args: unknown[]) =>
    mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyWorkspaceMembershipType(...args),
}));

function query() {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'in', 'not', 'order']) {
    builder[method] = (...args: unknown[]) => {
      mocks.calls.push([method, ...args]);
      return builder;
    };
  }
  builder.limit = (...args: unknown[]) => {
    mocks.calls.push(['limit', ...args]);
    return Promise.resolve(mocks.result);
  };
  return builder;
}

const sessionClient = { from: vi.fn(() => query()) };

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: { supabase: typeof sessionClient; user: unknown },
        params: Record<string, string>
      ) => Promise<Response>
    ) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<Record<string, string>> }
    ) =>
      handler(
        request,
        { supabase: sessionClient, user: { id: 'user-1' } },
        await Promise.resolve(routeContext?.params ?? {})
      ),
}));

import { GET } from './route';

const WS_ID = '00000000-0000-4000-8000-000000000001';
const context = { params: Promise.resolve({ wsId: WS_ID }) };

function request(search = '') {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${WS_ID}/task-cycles/backlog${search}`
  );
}

describe('GET task backlog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls = [];
    mocks.result = { data: [], error: null };
    mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('rejects nonmembers', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_missing',
      ok: false,
    });

    const response = await GET(request(), context);

    expect(response.status).toBe(403);
    expect(sessionClient.from).not.toHaveBeenCalled();
  });

  it('scopes to open, undeleted, uncycled tasks in the workspace', async () => {
    mocks.result = {
      data: [{ id: 'task-1', name: 'Task', task_cycle_tasks: [] }],
      error: null,
    };

    const response = await GET(request('?limit=25'), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tasks: [{ id: 'task-1', name: 'Task' }],
    });
    expect(sessionClient.from).toHaveBeenCalledWith('tasks');
    expect(mocks.calls).toEqual(
      expect.arrayContaining([
        ['eq', 'list.board.ws_id', WS_ID],
        ['in', 'list.status', ['not_started', 'active', 'review']],
        ['is', 'deleted_at', null],
        ['is', 'task_cycle_tasks', null],
        ['limit', 25],
      ])
    );
  });

  it('rejects an out-of-range limit', async () => {
    const response = await GET(request('?limit=1000'), context);

    expect(response.status).toBe(400);
    expect(sessionClient.from).not.toHaveBeenCalled();
  });
});
