import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  normalize: vi.fn(),
  membership: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolve,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { POST } from './route';

const taskId = '11111111-1111-4111-8111-111111111111';
const listId = '22222222-2222-4222-8222-222222222222';
const sessionClient = { session: true };
function move() {
  const request = new Request('https://tasks.example.com/api/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ list_id: listId }),
  });
  return {
    request,
    response: POST(request, {
      params: Promise.resolve({ wsId: 'personal', taskId }),
    }),
  };
}
describe('task move session authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockResolvedValue({ anonymous: true });
    mocks.resolve.mockResolvedValue({
      user: { id: 'user-1' },
      authError: null,
      supabase: sessionClient,
    });
    mocks.normalize.mockResolvedValue('ws-1');
    mocks.membership.mockImplementation(async ({ supabase }) => ({
      ok: supabase === sessionClient,
    }));
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mocks.createAdminClient.mockResolvedValue({ from: vi.fn(() => query) });
  });
  it('uses the verified app-session client for membership before loading tasks', async () => {
    const { request, response } = move();
    const result = (await response)!;
    expect(mocks.resolve).toHaveBeenCalledWith(request);
    expect(mocks.normalize).toHaveBeenCalledWith('personal', sessionClient);
    expect(mocks.membership).toHaveBeenCalledWith({
      wsId: 'ws-1',
      userId: 'user-1',
      supabase: sessionClient,
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).toHaveBeenCalled();
    expect(result.status).toBe(404);
    expect(await result.json()).toEqual({ error: 'Task not found' });
  });
  it('archives a task after authorizing the app session', async () => {
    const update = vi.fn().mockReturnThis();
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update,
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            id: taskId,
            list_id: 'source-list',
            completed: true,
            completed_at: '2026-09-14T00:00:00.000Z',
            closed_at: null,
            task_lists: {
              status: 'done',
              board_id: 'board-1',
              workspace_boards: { ws_id: 'ws-1' },
            },
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            id: listId,
            board_id: 'board-1',
            status: 'closed',
            deleted: false,
            workspace_boards: { ws_id: 'ws-1' },
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { id: taskId, list_id: listId },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { id: taskId, list_id: listId, name: 'Task' },
          error: null,
        }),
    };
    mocks.createAdminClient.mockResolvedValue({ from: vi.fn(() => query) });
    const response = (await move().response)!;
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        list_id: listId,
        completed: true,
      })
    );
    expect(await response.json()).toMatchObject({
      task: { id: taskId, list_id: listId },
    });
  });

  it('rejects unauthenticated requests before checking membership', async () => {
    mocks.resolve.mockResolvedValue({
      user: null,
      supabase: null,
      authError: new Error('Invalid session'),
    });
    expect((await move().response)?.status).toBe(401);
    expect(mocks.membership).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it('preserves the workspace membership boundary', async () => {
    mocks.membership.mockResolvedValue({ ok: false });
    expect((await move().response)?.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it('fails closed when session verification returns no database client', async () => {
    mocks.resolve.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: null,
      authError: null,
    });
    expect((await move().response)?.status).toBe(401);
    expect(mocks.membership).not.toHaveBeenCalled();
  });
});
