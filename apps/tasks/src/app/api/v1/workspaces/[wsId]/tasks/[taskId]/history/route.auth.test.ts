import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WS_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  authenticatedSupabase: {
    rpc: vi.fn(),
  },
  baseSupabase: {
    rpc: vi.fn(),
  },
  createClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

describe('task history API app-session auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(mocks.baseSupabase);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      supabase: mocks.authenticatedSupabase,
      user: { id: USER_ID },
    });
    mocks.authenticatedSupabase.rpc.mockResolvedValue({
      data: [
        {
          id: 'history-1',
          task_id: TASK_ID,
          changed_by: USER_ID,
          changed_at: '2026-07-08T00:00:00.000Z',
          change_type: 'field_updated',
          field_name: 'priority',
          old_value: null,
          new_value: 'high',
          metadata: {},
          user_id: USER_ID,
          user_display_name: 'Task User',
          user_avatar_url: null,
          task_name: 'Task',
          total_count: 1,
        },
      ],
      error: null,
    });
  });

  it('runs the history RPC through the resolved authenticated client', async () => {
    const { GET } = await import('./route.js');
    const response = await GET(
      new Request(
        `http://localhost/api/v1/workspaces/${WS_ID}/tasks/${TASK_ID}/history?limit=100&change_type=field_updated`
      ),
      { params: Promise.resolve({ taskId: TASK_ID, wsId: WS_ID }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveAuthenticatedSessionUser).toHaveBeenCalledWith(
      expect.any(Request),
      mocks.baseSupabase
    );
    expect(mocks.baseSupabase.rpc).not.toHaveBeenCalled();
    expect(mocks.authenticatedSupabase.rpc).toHaveBeenCalledWith(
      'get_task_history',
      {
        p_change_type: 'field_updated',
        p_field_name: undefined,
        p_limit: 100,
        p_offset: 0,
        p_task_id: TASK_ID,
        p_ws_id: WS_ID,
      }
    );
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      history: [{ id: 'history-1', new_value: 'high' }],
      task: { id: TASK_ID, name: 'Task' },
    });
  });
});
