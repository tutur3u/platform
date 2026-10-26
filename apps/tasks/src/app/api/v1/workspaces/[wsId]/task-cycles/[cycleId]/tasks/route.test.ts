import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  upsert: vi.fn(),
  cycle: { ws_id: '' } as { ws_id: string } | null,
  task: null as Record<string, unknown> | null,
  sessionUser: { email: 'member@example.com', id: 'user-1' },
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (...args: unknown[]) =>
    mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyWorkspaceMembershipType(...args),
}));

function single(data: unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
      })),
    })),
  };
}

const sessionClient = {
  from: vi.fn((table: string) => {
    if (table === 'task_cycles') return single(mocks.cycle);
    if (table === 'tasks') return single(mocks.task);
    if (table === 'task_cycle_tasks') return { upsert: mocks.upsert };
    throw new Error(`Unexpected table: ${table}`);
  }),
};

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
        { supabase: sessionClient, user: mocks.sessionUser },
        await Promise.resolve(routeContext?.params ?? {})
      ),
}));

import { POST } from './route';

const WS_ID = '00000000-0000-4000-8000-000000000001';
const FOREIGN_WS_ID = '00000000-0000-4000-8000-000000000009';
const CYCLE_ID = '00000000-0000-4000-8000-000000000002';
const TASK_ID = '00000000-0000-4000-8000-000000000003';

function request(body = JSON.stringify({ taskId: TASK_ID })) {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${WS_ID}/task-cycles/${CYCLE_ID}/tasks`,
    { body, method: 'POST' }
  );
}

const context = { params: Promise.resolve({ cycleId: CYCLE_ID, wsId: WS_ID }) };

function taskIn(wsId: string, status = 'active') {
  return {
    id: TASK_ID,
    deleted_at: null,
    task_lists: { status, workspace_boards: { ws_id: wsId } },
  };
}

describe('POST assign task to cycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.cycle = { ws_id: WS_ID };
    mocks.task = taskIn(WS_ID);
  });

  it('rejects nonmembers before reading the cycle or task', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_missing',
      ok: false,
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(403);
    expect(sessionClient.from).not.toHaveBeenCalled();
  });

  it('rejects a task from another workspace without writing', async () => {
    mocks.task = taskIn(FOREIGN_WS_ID);

    const response = await POST(request(), context);

    expect(response.status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('rejects a cycle from another workspace without writing', async () => {
    mocks.cycle = { ws_id: FOREIGN_WS_ID };

    const response = await POST(request(), context);

    expect(response.status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('rejects document-list tasks', async () => {
    mocks.task = taskIn(WS_ID, 'documents');

    const response = await POST(request(), context);

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('rejects an invalid task id', async () => {
    const response = await POST(
      request(JSON.stringify({ taskId: 'nope' })),
      context
    );

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('moves a same-workspace task into the cycle with one upsert', async () => {
    const response = await POST(request(), context);

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
