import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  insertSingle: vi.fn(),
  membership: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  sessionMaybeSingle: vi.fn(),
  taskMaybeSingle: vi.fn(),
  update: vi.fn(),
  updateResult: vi.fn(),
}));

function threeEqQuery(result: () => unknown) {
  return {
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(result),
      })),
    })),
  };
}

const adminClient = {
  from: vi.fn((table: string) => {
    if (table === 'tasks') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: mocks.taskMaybeSingle })),
        })),
      };
    }

    if (table !== 'time_tracking_sessions') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      insert: mocks.insert.mockImplementation(() => ({
        select: vi.fn(() => ({ single: mocks.insertSingle })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: mocks.sessionMaybeSingle })),
          })),
        })),
      })),
      update: mocks.update.mockImplementation(() =>
        threeEqQuery(mocks.updateResult)
      ),
    };
  }),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(adminClient)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.membership,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        auth: { supabase: object; user: { id: string } },
        params: { wsId: string }
      ) => Promise<Response> | Response
    ) =>
    async (
      request: NextRequest,
      context: { params: Promise<{ wsId: string }> }
    ) =>
      handler(
        request,
        { supabase: { auth: {} }, user: { id: 'user-1' } },
        await context.params
      ),
}));

describe('Tasks running time-tracking sessions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-1');
    mocks.membership.mockResolvedValue({ error: null, ok: true });
    mocks.updateResult.mockResolvedValue({ error: null });
  });

  it('returns the current running session without proxying to Web', async () => {
    mocks.sessionMaybeSingle.mockResolvedValue({
      data: { id: 'session-1', task_id: null },
      error: null,
    });
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest(
        'https://tasks.test/api/v1/workspaces/personal/time-tracking/sessions?type=running'
      ),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      session: { id: 'session-1', task: null, task_id: null },
    });
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      expect.anything()
    );
    expect(mocks.membership).toHaveBeenCalledWith(
      expect.objectContaining({ supabase: adminClient, userId: 'user-1' })
    );
  });

  it('closes an active session and starts the selected task immediately', async () => {
    mocks.taskMaybeSingle.mockResolvedValue({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        task_lists: { workspace_boards: { ws_id: 'workspace-1' } },
      },
      error: null,
    });
    mocks.insertSingle.mockResolvedValue({
      data: { id: 'session-2', is_running: true },
      error: null,
    });
    const { POST } = await import('./route');
    const response = await POST(
      new NextRequest(
        'https://tasks.test/api/v1/workspaces/workspace-1/time-tracking/sessions',
        {
          body: JSON.stringify({
            taskId: '11111111-1111-4111-8111-111111111111',
            title: 'Working on: Ship the timer fix',
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }
      ),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_running: false })
    );
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        is_running: true,
        task_id: '11111111-1111-4111-8111-111111111111',
        user_id: 'user-1',
        ws_id: 'workspace-1',
      })
    );
  });

  it('does not start a timer for a task from another workspace', async () => {
    mocks.taskMaybeSingle.mockResolvedValue({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        task_lists: { workspace_boards: { ws_id: 'workspace-2' } },
      },
      error: null,
    });
    const { POST } = await import('./route');
    const response = await POST(
      new NextRequest(
        'https://tasks.test/api/v1/workspaces/workspace-1/time-tracking/sessions',
        {
          body: JSON.stringify({
            taskId: '11111111-1111-4111-8111-111111111111',
            title: 'Wrong workspace',
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }
      ),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
