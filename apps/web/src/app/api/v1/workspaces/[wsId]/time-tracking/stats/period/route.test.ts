import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const rpc = vi.fn();
  const normalizeWorkspaceId = vi.fn();

  const sessionSupabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle,
          })),
        })),
      })),
    })),
  };

  const adminSupabase = {
    rpc,
  };

  return {
    adminSupabase,
    maybeSingle,
    normalizeWorkspaceId,
    rpc,
    sessionSupabase,
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
          sessionContext: {
            user: { id: string };
            supabase: typeof mocks.sessionSupabase;
          },
          params: { wsId: string }
        ) => Promise<Response>
      )(
        request,
        {
          user: { id: 'user-1' },
          supabase: mocks.sessionSupabase,
        },
        (await routeContext?.params) as { wsId: string }
      ),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

describe('time tracking period stats route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.maybeSingle.mockResolvedValue({
      data: { id: 'user-1' },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: {
        totalDuration: 0,
        breakdown: [],
        timeOfDayBreakdown: {
          morning: 0,
          afternoon: 0,
          evening: 0,
          night: 0,
        },
        bestTimeOfDay: null,
        longestSession: null,
        shortSessions: 0,
        mediumSessions: 0,
        longSessions: 0,
        sessionCount: 0,
        dailyBreakdown: [],
      },
      error: null,
    });
  });

  it('keeps accepting standard IANA timezone values used by web consumers', async () => {
    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/time-tracking/stats/period/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/time-tracking/stats/period?dateFrom=2026-03-01T00:00:00.000Z&dateTo=2026-03-07T23:59:59.999Z&timezone=Asia%2FHo_Chi_Minh'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_time_tracking_period_stats',
      expect.objectContaining({
        p_timezone: 'Asia/Ho_Chi_Minh',
      })
    );
  });

  it('accepts non-canonical timezone strings sent by mobile clients', async () => {
    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/time-tracking/stats/period/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/time-tracking/stats/period?dateFrom=2026-03-01T00:00:00.000Z&dateTo=2026-03-07T23:59:59.999Z&timezone=Asia%2FSaigon'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_time_tracking_period_stats',
      expect.objectContaining({
        p_timezone: 'Asia/Saigon',
      })
    );
  });
});
