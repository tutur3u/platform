import { beforeEach, describe, expect, it, vi } from 'vitest';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const TASK_WS_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => {
  const adminTaskSingle = vi.fn();
  const schedulingUpsert = vi.fn();
  const verifyWorkspaceMembershipType = vi.fn();

  const adminClient = {
    from: vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: adminTaskSingle,
            })),
          })),
        };
      }

      return {};
    }),
  };

  return {
    adminClient,
    adminTaskSingle,
    schedulingUpsert,
    verifyWorkspaceMembershipType,
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));

vi.mock('@/lib/calendar/task-scheduler', () => ({
  scheduleTask: vi.fn(),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminClient)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

type ScheduleRouteHandler = (
  request: Request,
  context: {
    user: { id: string };
    supabase: {
      from: (table: string) => unknown;
    };
  },
  params: { taskId: string }
) => Promise<Response>;

function createSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'task_user_scheduling_settings') {
        return {
          upsert: mocks.schedulingUpsert,
        };
      }

      return {};
    }),
  };
}

function mockAccessibleTask() {
  mocks.adminTaskSingle.mockResolvedValue({
    data: {
      id: TASK_ID,
      task_lists: {
        workspace_boards: {
          ws_id: TASK_WS_ID,
        },
      },
    },
    error: null,
  });
  mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  mocks.schedulingUpsert.mockResolvedValue({ error: null });
}

async function callPatch(body: unknown) {
  const { PATCH } = await import(
    '@/app/api/v1/users/me/tasks/[taskId]/schedule/route'
  );

  return (PATCH as unknown as ScheduleRouteHandler)(
    new Request(`http://localhost/api/v1/users/me/tasks/${TASK_ID}/schedule`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    {
      user: { id: USER_ID },
      supabase: createSupabase(),
    },
    { taskId: TASK_ID }
  );
}

describe('current-user task schedule route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.adminClient.from.mockClear();
    mocks.adminTaskSingle.mockReset();
    mocks.schedulingUpsert.mockReset();
    mocks.verifyWorkspaceMembershipType.mockReset();
  });

  it('accepts partial nullable scheduling updates', async () => {
    mockAccessibleTask();

    const response = await callPatch({
      total_duration: null,
      min_split_duration_minutes: null,
      calendar_hours: null,
    });

    expect(response.status).toBe(200);
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      wsId: TASK_WS_ID,
      userId: USER_ID,
      supabase: expect.any(Object),
    });
    expect(mocks.schedulingUpsert).toHaveBeenCalledWith(
      {
        task_id: TASK_ID,
        user_id: USER_ID,
        total_duration: null,
        min_split_duration_minutes: null,
        calendar_hours: null,
      },
      { onConflict: 'task_id,user_id' }
    );
    await expect(response.json()).resolves.toEqual({
      ok: true,
      task_ws_id: TASK_WS_ID,
    });
  });

  it('rejects empty scheduling updates', async () => {
    mockAccessibleTask();

    const response = await callPatch({});

    expect(response.status).toBe(400);
    expect(mocks.schedulingUpsert).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: 'No valid fields to update',
    });
  });

  it('rejects invalid calendar hour values', async () => {
    mockAccessibleTask();

    const response = await callPatch({
      calendar_hours: 'focus_hours',
    });

    expect(response.status).toBe(400);
    expect(mocks.schedulingUpsert).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: 'Invalid request data',
      })
    );
  });
});
