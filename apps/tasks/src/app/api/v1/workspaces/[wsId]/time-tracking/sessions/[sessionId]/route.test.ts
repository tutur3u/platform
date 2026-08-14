import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  breakUpdate: vi.fn(),
  sessionMaybeSingle: vi.fn(),
  sessionUpdate: vi.fn(),
  stoppedMaybeSingle: vi.fn(),
}));

function fluentQuery(terminal?: () => unknown) {
  const query = {
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    maybeSingle: terminal ?? vi.fn(),
    select: vi.fn(() => query),
  };
  return query;
}

const adminClient = {
  from: vi.fn((table: string) => {
    if (table === 'time_tracking_breaks') {
      return {
        update: mocks.breakUpdate.mockImplementation(() =>
          fluentQuery(() => Promise.resolve({ error: null }))
        ),
      };
    }
    if (table === 'time_tracking_sessions') {
      return {
        select: vi.fn(() => fluentQuery(mocks.sessionMaybeSingle)),
        update: mocks.sessionUpdate.mockImplementation(() =>
          fluentQuery(mocks.stoppedMaybeSingle)
        ),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  }),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(adminClient)),
}));

vi.mock('../_lib', () => ({
  resolveTimeTrackingWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ normalizedWsId: 'workspace-1', ok: true })
  ),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        auth: { supabase: object; user: { id: string } },
        params: { sessionId: string; wsId: string }
      ) => Promise<Response> | Response
    ) =>
    async (
      request: NextRequest,
      context: { params: Promise<{ sessionId: string; wsId: string }> }
    ) =>
      handler(
        request,
        { supabase: {}, user: { id: 'user-1' } },
        await context.params
      ),
}));

describe('Tasks task timer session route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionMaybeSingle.mockResolvedValue({
      data: {
        id: 'session-1',
        is_running: true,
        start_time: new Date(Date.now() - 5_000).toISOString(),
      },
      error: null,
    });
    mocks.stoppedMaybeSingle.mockResolvedValue({
      data: { id: 'session-1', is_running: false, task_id: 'task-1' },
      error: null,
    });
  });

  it('stops the authenticated selected task session', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(
      new NextRequest(
        'https://tasks.test/api/v1/workspaces/workspace-1/time-tracking/sessions/session-1',
        {
          body: JSON.stringify({ action: 'stop' }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({
          sessionId: 'session-1',
          wsId: 'workspace-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.breakUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ break_end: expect.any(String) })
    );
    expect(mocks.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        duration_seconds: expect.any(Number),
        is_running: false,
      })
    );
    await expect(response.json()).resolves.toEqual({
      session: { id: 'session-1', is_running: false, task_id: 'task-1' },
    });
  });
});
