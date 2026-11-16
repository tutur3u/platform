import { describe, expect, it, vi } from 'vitest';
import {
  getCurrentUserRunningTimeTrackingSession,
  getCurrentUserTimeTrackingDailyTotals,
  getCurrentUserTimeTrackingStats,
  listCurrentUserTimeTrackingGoals,
  pauseCurrentUserTimeTrackingSession,
  stopCurrentUserTimeTrackingSession,
} from './time-tracking';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });

describe('current-user time tracking reads', () => {
  it('reads the running session from the web-owned sessions route', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({ session: { id: 's1', title: 'Deep work' } })
    );
    const controller = new AbortController();

    const session = await getCurrentUserRunningTimeTrackingSession('ws 1', {
      baseUrl: 'https://web.example.com',
      fetch,
      signal: controller.signal,
    });

    expect(session).toEqual({ id: 's1', title: 'Deep work' });
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://web.example.com/api/v1/workspaces/ws%201/time-tracking/sessions?type=running'
    );
    const init = fetch.mock.calls[0]?.[1];
    expect(init).toMatchObject({ cache: 'no-store', signal: controller.signal });
    // Same-origin read: no cross-origin credential mode is requested.
    expect(init).not.toHaveProperty('credentials');
  });

  it('never targets another user: no userId parameter is sent', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({ stats: { todayTime: 60, weekTime: 120, monthTime: 180, streak: 2 } })
    );

    const stats = await getCurrentUserTimeTrackingStats(
      'ws-1',
      { timezone: 'Asia/Ho_Chi_Minh' },
      { baseUrl: 'https://web.example.com', fetch }
    );

    expect(stats).toEqual({ todayTime: 60, weekTime: 120, monthTime: 180, streak: 2 });
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/v1/workspaces/ws-1/time-tracking/sessions');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      type: 'stats',
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('returns null when nothing is running and surfaces route errors', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ session: null }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Workspace access denied' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        })
      );
    const options = { baseUrl: 'https://web.example.com', fetch };

    await expect(
      getCurrentUserRunningTimeTrackingSession('ws-1', options)
    ).resolves.toBeNull();
    await expect(getCurrentUserTimeTrackingStats('ws-1', {}, options)).rejects.toThrow();
    expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.has('timezone')).toBe(
      false
    );
  });
});

describe('current-user time tracking actions and goals', () => {
  const base = { baseUrl: 'https://web.example.com' };

  it.each([
    ['stop', stopCurrentUserTimeTrackingSession],
    ['pause', pauseCurrentUserTimeTrackingSession],
  ] as const)('%s sends the existing session action', async (action, call) => {
    const fetch = vi.fn().mockResolvedValue(json({ session: { id: 's 1' } }));

    await call('ws-1', 's 1', { ...base, fetch });

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://web.example.com/api/v1/workspaces/ws-1/time-tracking/sessions/s%201'
    );
    const init = fetch.mock.calls[0]?.[1];
    expect(init).toMatchObject({ method: 'PATCH', cache: 'no-store' });
    expect(JSON.parse(String(init?.body))).toEqual({ action });
  });

  it('lists only the viewer goals and daily totals without a userId', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({ goals: [{ id: 'g1', category_id: null, daily_goal_minutes: 360 }] })
      )
      .mockResolvedValueOnce(
        json({
          totalDuration: 7200,
          dailyBreakdown: [{ date: '2026-11-16', totalDuration: 7200, breakdown: [] }],
        })
      );

    await expect(listCurrentUserTimeTrackingGoals('ws-1', { ...base, fetch })).resolves.toEqual([
      { id: 'g1', category_id: null, daily_goal_minutes: 360 },
    ]);
    await expect(
      getCurrentUserTimeTrackingDailyTotals(
        'ws-1',
        { dateFrom: '2026-11-10T00:00:00.000Z', dateTo: '2026-11-16T23:59:59.999Z', timezone: 'UTC' },
        { ...base, fetch }
      )
    ).resolves.toEqual([{ date: '2026-11-16', totalDuration: 7200 }]);

    for (const [input] of fetch.mock.calls) {
      expect(new URL(String(input)).searchParams.has('userId')).toBe(false);
    }
    expect(new URL(String(fetch.mock.calls[1]?.[0])).pathname).toBe(
      '/api/v1/workspaces/ws-1/time-tracking/stats/period'
    );
  });
});
