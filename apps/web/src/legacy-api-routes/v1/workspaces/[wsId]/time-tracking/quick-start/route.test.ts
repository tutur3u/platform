import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  maybeSingle: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

const TASK_ID = '00000000-0000-4000-8000-000000000123';
const WS_ID = 'ws-1';

const sessionSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })),
    })),
  })),
};

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: vi.fn(async () => ({
    ok: true,
    user: { id: 'user-1' },
    supabase: sessionSupabase,
  })),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyWorkspaceMembershipType(...args),
}));

import { POST } from './route';

function createAdminMock() {
  const single = vi.fn(async () => ({
    data: { id: 'session-1' },
    error: null,
  }));
  const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    })),
  }));
  return { from: vi.fn(() => ({ insert, update })), insert, update };
}

function post() {
  return POST(
    new NextRequest('http://localhost/api', {
      method: 'POST',
      body: JSON.stringify({ taskId: TASK_ID, taskName: 'Task' }),
    }),
    { params: Promise.resolve({ wsId: WS_ID }) }
  );
}

describe('time tracking quick-start task scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('returns 404 for a task in another workspace without touching the admin client', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: TASK_ID,
        task_lists: { workspace_boards: { ws_id: 'other-ws' } },
      },
      error: null,
    });

    const response = await post();

    expect(response.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns 500 when the task lookup fails without touching the admin client', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    const response = await post();

    expect(response.status).toBe(500);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('starts a session for a task in the same workspace', async () => {
    const admin = createAdminMock();
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: TASK_ID,
        task_lists: { workspace_boards: { ws_id: WS_ID } },
      },
      error: null,
    });

    const response = await post();

    expect(response.status).toBe(201);
    expect(admin.update).toHaveBeenCalledTimes(1);
    expect(admin.insert).toHaveBeenCalledWith(
      expect.objectContaining({ ws_id: WS_ID, task_id: TASK_ID })
    );
  });
});
