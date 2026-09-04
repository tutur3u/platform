import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const taskId = '22222222-2222-4222-8222-222222222222';
const historyId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
  getAppSessionTokenFromRequest: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: mocks.getAppSessionTokenFromRequest,
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

function createRequest(body: unknown = { historyId, fields: ['name'] }) {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${workspaceId}/tasks/${taskId}/revert`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

function createContext(overrides?: Partial<{ wsId: string; taskId: string }>) {
  return {
    params: Promise.resolve({
      wsId: overrides?.wsId ?? workspaceId,
      taskId: overrides?.taskId ?? taskId,
    }),
  };
}

describe('task history revert route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppSessionTokenFromRequest.mockReturnValue('app-session-token');
    mocks.normalizeWorkspaceId.mockResolvedValue(workspaceId);
    mocks.rpc.mockResolvedValue({
      data: {
        revertedFields: ['name'],
        task: { id: taskId, name: 'Historical task', list_id: 'list-1' },
      },
      error: null,
    });
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: { rpc: mocks.rpc },
      user: { id: actorId },
    });
  });

  it('uses the actor-scoped atomic restore RPC for app sessions', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      createRequest({ historyId, fields: ['name', 'labels', 'name'] }),
      createContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      revertedFields: ['name'],
      task: { id: taskId, name: 'Historical task' },
    });
    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(
      expect.any(Request),
      {
        allowAppSessionAuth: {
          targetApp: ['platform', 'calendar', 'tasks'],
        },
      }
    );
    expect(mocks.rpc).toHaveBeenCalledWith('revert_task_to_history_for_actor', {
      p_actor_user_id: actorId,
      p_ws_id: workspaceId,
      p_task_id: taskId,
      p_history_id: historyId,
      p_fields: ['name', 'labels'],
    });
  });

  it('uses the caller-scoped atomic restore RPC for Supabase sessions', async () => {
    mocks.getAppSessionTokenFromRequest.mockReturnValue(null);
    const { POST } = await import('./route');

    const response = await POST(createRequest(), createContext());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('revert_task_to_history', {
      p_ws_id: workspaceId,
      p_task_id: taskId,
      p_history_id: historyId,
      p_fields: ['name'],
    });
  });

  it('normalizes workspace aliases before restoring', async () => {
    const { POST } = await import('./route');

    await POST(createRequest(), createContext({ wsId: 'personal' }));

    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      expect.objectContaining({ rpc: mocks.rpc })
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'revert_task_to_history_for_actor',
      expect.objectContaining({ p_ws_id: workspaceId })
    );
  });

  it.each([
    [{ historyId, fields: [] }, 'empty field selection'],
    [{ historyId: 'not-a-guid', fields: ['name'] }, 'invalid history id'],
    [{ historyId, fields: ['unsupported'] }, 'unsupported field'],
  ])('rejects %s (%s)', async (body) => {
    const { POST } = await import('./route');
    const response = await POST(createRequest(body), createContext());

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects an invalid task id before calling the restore RPC', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      createRequest(),
      createContext({ taskId: 'not-a-guid' })
    );

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns the authentication response unchanged', async () => {
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const { POST } = await import('./route');

    const response = await POST(createRequest(), createContext());

    expect(response.status).toBe(401);
    expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['Access denied to workspace', 403],
    ['Task does not belong to this workspace', 403],
    ['Task not found', 404],
    ['History entry not found', 404],
    ['violates foreign key constraint', 409],
  ])('maps restore error %s to status %i', async (message, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error(message) });
    const { POST } = await import('./route');

    const response = await POST(createRequest(), createContext());

    expect(response.status).toBe(status);
  });

  it('fails closed when the restore RPC returns no task', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const { POST } = await import('./route');

    const response = await POST(createRequest(), createContext());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to restore task version',
    });
  });
});
