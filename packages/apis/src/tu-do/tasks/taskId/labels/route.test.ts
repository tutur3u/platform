import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WS_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const LABEL_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => {
  const labelQuery = {
    eq: vi.fn(() => labelQuery),
    maybeSingle: vi.fn(),
    select: vi.fn(() => labelQuery),
  };
  const taskQuery = {
    eq: vi.fn(() => taskQuery),
    is: vi.fn(() => taskQuery),
    maybeSingle: vi.fn(),
    select: vi.fn(() => taskQuery),
  };
  const memberClient = {
    from: vi.fn((table: string) => {
      if (table !== 'workspace_task_labels') {
        throw new Error(`Unexpected member table: ${table}`);
      }

      return labelQuery;
    }),
  };
  const adminClient = {
    from: vi.fn((table: string) => {
      if (table !== 'tasks') {
        throw new Error(`Unexpected admin table: ${table}`);
      }

      return taskQuery;
    }),
    rpc: vi.fn(),
  };

  return {
    adminClient,
    createClient: vi.fn(),
    labelQuery,
    memberClient,
    normalizeWorkspaceId: vi.fn(),
    resolveAuthenticatedSessionUser: vi.fn(),
    taskQuery,
    verifyWorkspaceMembershipType: vi.fn(),
  };
});

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => mocks.adminClient),
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

describe('task label association route handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(mocks.memberClient);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: USER_ID },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.taskQuery.maybeSingle.mockResolvedValue({
      data: {
        id: TASK_ID,
        list: { board: { ws_id: WS_ID } },
      },
      error: null,
    });
    mocks.labelQuery.maybeSingle.mockResolvedValue({
      data: { id: LABEL_ID },
      error: null,
    });
    mocks.adminClient.rpc.mockResolvedValue({ error: null });
  });

  it('adds a task label with an injected app-session auth context', async () => {
    const { handleTaskLabelRoutePOST } = await import('./route.js');
    const response = await handleTaskLabelRoutePOST(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WS_ID}/tasks/${TASK_ID}/labels`,
        {
          body: JSON.stringify({ labelId: LABEL_ID }),
          method: 'POST',
        }
      ),
      { params: Promise.resolve({ taskId: TASK_ID, wsId: WS_ID }) },
      {
        appSession: true,
        supabase: mocks.memberClient as never,
        user: { id: USER_ID } as never,
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.resolveAuthenticatedSessionUser).not.toHaveBeenCalled();
    expect(mocks.adminClient.rpc).toHaveBeenCalledWith(
      'add_task_label_with_actor',
      {
        p_actor_user_id: USER_ID,
        p_label_id: LABEL_ID,
        p_task_id: TASK_ID,
      }
    );
  });

  it('removes a task label with an injected app-session auth context', async () => {
    const { handleTaskLabelRouteDELETE } = await import('./route.js');
    const response = await handleTaskLabelRouteDELETE(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WS_ID}/tasks/${TASK_ID}/labels`,
        {
          body: JSON.stringify({ labelId: LABEL_ID }),
          method: 'DELETE',
        }
      ),
      { params: Promise.resolve({ taskId: TASK_ID, wsId: WS_ID }) },
      {
        appSession: true,
        supabase: mocks.memberClient as never,
        user: { id: USER_ID } as never,
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.resolveAuthenticatedSessionUser).not.toHaveBeenCalled();
    expect(mocks.adminClient.rpc).toHaveBeenCalledWith(
      'remove_task_label_with_actor',
      {
        p_actor_user_id: USER_ID,
        p_label_id: LABEL_ID,
        p_task_id: TASK_ID,
      }
    );
  });
});
