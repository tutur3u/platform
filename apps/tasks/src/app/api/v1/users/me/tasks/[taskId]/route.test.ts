import { beforeEach, describe, expect, it, vi } from 'vitest';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const TASK_WS_ID = '22222222-2222-4222-8222-222222222222';
const BOARD_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => {
  const taskMaybeSingle = vi.fn();
  const listsOrder = vi.fn();
  const verifyWorkspaceMembershipType = vi.fn();
  const resolveWorkspaceTier = vi.fn();
  const resolveAuthenticatedSessionUser = vi.fn();

  // The cookie-backed client a satellite ends up with when the session is an
  // app-session JWT: authenticated for `auth.getUser()`, but anonymous for every
  // RLS-scoped query, so any membership lookup through it returns nothing.
  const anonymousCookieClient = {
    from: vi.fn(() => {
      throw new Error(
        'RLS-scoped query attempted with the anonymous cookie client'
      );
    }),
  };

  const adminClient = {
    from: vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: taskMaybeSingle })),
          })),
        };
      }

      if (table === 'task_lists') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ order: listsOrder })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
    rpc: (...args: unknown[]) => resolveWorkspaceTier(...args),
  };

  return {
    adminClient,
    anonymousCookieClient,
    listsOrder,
    resolveAuthenticatedSessionUser,
    resolveWorkspaceTier,
    taskMaybeSingle,
    verifyWorkspaceMembershipType,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminClient)),
  createClient: vi.fn(() => Promise.resolve(mocks.anonymousCookieClient)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

async function getTask(taskId = TASK_ID) {
  const { GET } = await import('./route');

  return GET(new Request(`http://localhost/api/v1/users/me/tasks/${taskId}`), {
    params: Promise.resolve({ taskId }),
  });
}

describe('current user task route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      supabase: mocks.anonymousCookieClient,
      user: { id: USER_ID },
    });
    mocks.taskMaybeSingle.mockResolvedValue({
      data: {
        id: TASK_ID,
        name: 'Guest Comment / View / Like',
        list: {
          id: '55555555-5555-4555-8555-555555555555',
          name: 'To Do',
          board_id: BOARD_ID,
          board: {
            id: BOARD_ID,
            ws_id: TASK_WS_ID,
            workspace: { personal: false },
          },
        },
        assignees: [],
        labels: [],
        projects: [],
      },
      error: null,
    });
    mocks.listsOrder.mockResolvedValue({ data: [], error: null });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.resolveWorkspaceTier.mockResolvedValue({ data: 'FREE', error: null });
  });

  // Regression: this route is the cross-workspace fallback behind task deep
  // links. It used to authorize with the cookie-backed client, which is
  // anonymous on a satellite app-session, so membership always came back empty
  // and every link to a task outside the workspace named in the URL 404'd.
  it('authorizes membership with the admin client, not the cookie client', async () => {
    const response = await getTask();

    expect(response.status).toBe(200);
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      supabase: mocks.adminClient,
      userId: USER_ID,
      wsId: TASK_WS_ID,
    });
    await expect(response.json()).resolves.toMatchObject({
      taskWsId: TASK_WS_ID,
      taskWorkspacePersonal: false,
    });
  });

  it('returns the task for a workspace the caller belongs to', async () => {
    const response = await getTask();

    await expect(response.json()).resolves.toMatchObject({
      task: { id: TASK_ID, name: 'Guest Comment / View / Like' },
    });
  });

  it('hides tasks in workspaces the caller does not belong to', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });

    const response = await getTask();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Task not found' });
  });

  it('rejects unauthenticated callers', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: new Error('missing session'),
      supabase: null,
      user: null,
    });

    const response = await getTask();

    expect(response.status).toBe(401);
    expect(mocks.verifyWorkspaceMembershipType).not.toHaveBeenCalled();
  });

  it('rejects a malformed task id before touching the database', async () => {
    const response = await getTask('not-a-uuid');

    expect(response.status).toBe(400);
    expect(mocks.taskMaybeSingle).not.toHaveBeenCalled();
  });
});
