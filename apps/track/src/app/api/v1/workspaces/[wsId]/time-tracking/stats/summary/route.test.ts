import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  rpc: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  withSessionAuthOptions: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown, options: unknown) => {
    mocks.withSessionAuthOptions(options);
    return async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> }
    ) =>
      (
        handler as (
          request: NextRequest,
          context: { user: { id: string }; supabase: object },
          params: { wsId: string }
        ) => Promise<Response>
      )(
        request,
        { user: { id: USER_ID }, supabase: {} },
        (await routeContext?.params) as { wsId: string }
      );
  },
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: (...args: unknown[]) =>
    mocks.normalizeWorkspaceId(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/utils/workspace-helper')
  >()),
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => {
    const query = {
      eq: vi.fn(() => query),
      maybeSingle: mocks.maybeSingle,
      select: vi.fn(() => query),
    };
    return { from: vi.fn(() => query), rpc: mocks.rpc };
  }),
}));

describe('time tracking summary stats route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.maybeSingle.mockResolvedValue({
      data: { personal: true },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [
        {
          daily_activity: [{ date: '2026-08-15', duration: 600, sessions: 1 }],
          month_time: 600,
          streak: 1,
          today_time: 600,
          week_time: 600,
        },
      ],
      error: null,
    });
  });

  it('serves the dashboard contract through Track app-session auth', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/ws-1/time-tracking/stats/summary?userId=${USER_ID}&timezone=Asia%2FHo_Chi_Minh&summaryOnly=true`
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      dailyActivity: [{ date: '2026-08-15', duration: 600, sessions: 1 }],
      todayTime: 600,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('get_time_tracker_stats', {
      p_days_back: 0,
      p_is_personal: true,
      p_timezone: 'Asia/Ho_Chi_Minh',
      p_user_id: USER_ID,
      p_ws_id: 'ws-1',
    });
    expect(mocks.withSessionAuthOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        allowAppSessionAuth: { targetApp: 'track' },
      })
    );
  });
});
