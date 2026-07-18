import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WS_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const PERSONAL_WS_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
  authenticatedSupabase: {
    rpc: vi.fn(),
  },
  normalizeWorkspaceId: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: vi.fn((request: Request) =>
    request.headers.get('x-test-app-session')
  ),
}));

vi.mock('@tuturuuu/auth/cli-session', () => ({
  CLI_APP_TARGET_APP: 'platform',
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.resolveSessionAuthContext,
}));

describe('task history API app-session auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockImplementation(async (wsId: string) =>
      wsId === 'personal' ? PERSONAL_WS_ID : wsId
    );
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
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
    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(
      expect.any(Request),
      {
        allowAppSessionAuth: {
          targetApp: ['platform', 'calendar', 'tasks'],
        },
      }
    );
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      WS_ID,
      mocks.authenticatedSupabase
    );
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

  it('uses the actor-aware RPC for a personal workspace app session', async () => {
    const { GET } = await import('./route.js');
    const response = await GET(
      new Request(
        `http://localhost/api/v1/workspaces/personal/tasks/${TASK_ID}/history?field_name=description`,
        { headers: { 'x-test-app-session': 'verified' } }
      ),
      { params: Promise.resolve({ taskId: TASK_ID, wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      mocks.authenticatedSupabase
    );
    expect(mocks.authenticatedSupabase.rpc).toHaveBeenCalledWith(
      'get_task_history_for_actor',
      {
        p_actor_user_id: USER_ID,
        p_change_type: undefined,
        p_field_name: 'description',
        p_limit: 50,
        p_offset: 0,
        p_task_id: TASK_ID,
        p_ws_id: PERSONAL_WS_ID,
      }
    );
  });
});
