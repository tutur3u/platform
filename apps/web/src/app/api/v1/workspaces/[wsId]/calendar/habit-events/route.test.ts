import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  isHabitsEnabled: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (
    ...args: Parameters<typeof mocks.resolveSessionAuthContext>
  ) => mocks.resolveSessionAuthContext(...args),
}));

vi.mock('@/lib/habits/access', () => ({
  habitsNotFoundResponse: () =>
    Response.json({ error: 'Not found' }, { status: 404 }),
  isHabitsEnabled: (...args: Parameters<typeof mocks.isHabitsEnabled>) =>
    mocks.isHabitsEnabled(...args),
}));

function createAdminClientMock() {
  const query = {
    eq: vi.fn(() => query),
    gt: vi.fn(async () => ({
      data: [
        { completed: false, event_id: 'event-1' },
        { completed: true, event_id: 'event-2' },
        { completed: true, event_id: null },
      ],
      error: null,
    })),
    lt: vi.fn(() => query),
    select: vi.fn(() => query),
  };

  return {
    from: vi.fn((table: string) => {
      if (table !== 'habit_calendar_events') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return query;
    }),
    query,
  };
}

function createRequest() {
  return new Request(
    'http://localhost/api/v1/workspaces/personal/calendar/habit-events?start_at=2026-06-15T00%3A00%3A00.000Z&end_at=2026-06-16T00%3A00%3A00.000Z'
  );
}

describe('workspace calendar habit-events route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: { from: vi.fn() },
      user: { id: 'user-1' },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-1');
    mocks.isHabitsEnabled.mockResolvedValue(true);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      ok: true,
    });
    mocks.createAdminClient.mockResolvedValue(createAdminClientMock());
  });

  it('returns not found before membership or admin reads when habits are disabled', async () => {
    mocks.isHabitsEnabled.mockResolvedValue(false);

    const { GET } = await import('./route');
    const response = await GET(createRequest(), {
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
    expect(mocks.isHabitsEnabled).toHaveBeenCalledWith('workspace-1');
    expect(mocks.verifyWorkspaceMembershipType).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns habit event IDs when habits are enabled and membership passes', async () => {
    const { GET } = await import('./route');
    const response = await GET(createRequest(), {
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      completedHabitEventIds: ['event-2'],
      habitEventIds: ['event-1', 'event-2'],
    });
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      supabase: { from: expect.any(Function) },
      userId: 'user-1',
      wsId: 'workspace-1',
    });
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
  });
});
