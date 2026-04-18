import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const membershipMaybeSingle = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const learnersIn = vi.fn();
  const setsOrder = vi.fn();

  const attemptsBuilder: Record<string, any> = Promise.resolve({
    data: [
      {
        attempt_number: 1,
        completed_at: '2026-04-16T00:00:00.000Z',
        duration_seconds: 420,
        id: 'attempt-1',
        set_id: 'set-1',
        started_at: '2026-04-16T00:00:00.000Z',
        submitted_at: '2026-04-16T00:07:00.000Z',
        total_score: 8,
        user_id: 'user-2',
        workspace_quiz_sets: {
          id: 'set-1',
          name: 'Set 1',
          ws_id: '00000000-0000-0000-0000-000000000001',
        },
      },
    ],
    count: 1,
    error: null,
  });
  attemptsBuilder.eq = vi.fn(() => attemptsBuilder);
  attemptsBuilder.not = vi.fn(() => attemptsBuilder);
  attemptsBuilder.is = vi.fn(() => attemptsBuilder);
  attemptsBuilder.gte = vi.fn(() => attemptsBuilder);
  attemptsBuilder.lte = vi.fn(() => attemptsBuilder);
  attemptsBuilder.order = vi.fn(() => attemptsBuilder);
  attemptsBuilder.range = vi.fn(() => attemptsBuilder);

  const sessionSupabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: membershipMaybeSingle,
          })),
        })),
      })),
    })),
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_quiz_attempts') {
        return {
          select: vi.fn(() => attemptsBuilder),
        };
      }

      if (table === 'user_private_details') {
        return {
          select: vi.fn(() => ({
            in: learnersIn,
          })),
        };
      }

      if (table === 'workspace_quiz_sets') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: setsOrder,
            })),
          })),
        };
      }

      return { select: vi.fn() };
    }),
  };

  return {
    adminSupabase,
    learnersIn,
    membershipMaybeSingle,
    normalizeWorkspaceId,
    sessionSupabase,
    setsOrder,
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: unknown) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> }
    ) =>
      (
        handler as (
          request: NextRequest,
          context: {
            user: { id: string };
            supabase: typeof mocks.sessionSupabase;
          },
          params: { wsId: string }
        ) => Promise<Response>
      )(
        request,
        { user: { id: 'user-1' }, supabase: mocks.sessionSupabase },
        (await routeContext?.params) as { wsId: string }
      ),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
}));

describe('education attempts list route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
    mocks.learnersIn.mockResolvedValue({
      data: [
        { user_id: 'user-2', full_name: 'Learner', email: 'l@example.com' },
      ],
      error: null,
    });
    mocks.setsOrder.mockResolvedValue({
      data: [{ id: 'set-1', name: 'Set 1' }],
      error: null,
    });
  });

  it('returns 403 when requester is not a workspace member', async () => {
    mocks.membershipMaybeSingle.mockResolvedValue({ data: null, error: null });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/education/attempts/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/education/attempts'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "You don't have access to this workspace",
    });
  });

  it('returns attempts payload for authorized members', async () => {
    mocks.membershipMaybeSingle.mockResolvedValue({
      data: { user_id: 'user-1' },
      error: null,
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/education/attempts/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/education/attempts?page=1&pageSize=20'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.count).toBe(1);
    expect(payload.attempts).toHaveLength(1);
    expect(payload.attempts[0].id).toBe('attempt-1');
  });
});
