import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  membership: vi.fn(),
  connections: [
    {
      id: 'active',
      is_enabled: true,
      sync_inbound_enabled: true,
      auth_token_id: 'account',
    },
    {
      id: 'paused',
      is_enabled: true,
      sync_inbound_enabled: false,
      auth_token_id: 'account',
    },
  ],
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { GET } from './route';

const wsId = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  mocks.membership.mockResolvedValue({ ok: true });
  const failedCalendars = ['active', 'paused'].map((connectionId) => ({
    connectionId,
    calendarName: connectionId,
    code: 'not_found',
    privatePayload: 'hidden',
  }));
  const data: Record<string, unknown[]> = {
    calendar_auth_tokens: [{ id: 'account', provider: 'google' }],
    calendar_connections: mocks.connections,
    calendar_sync_dashboard: [
      {
        status: 'failed',
        start_time: new Date().toISOString(),
        error_type: 'not_found',
        error_stack_trace: JSON.stringify({ version: 1, failedCalendars }),
      },
    ],
  };
  mocks.auth.mockResolvedValue({
    ok: true,
    user: { id: 'user' },
    supabase: {
      from: (table: string) => {
        const query = Object.assign(
          Promise.resolve({ data: data[table], error: null }),
          {
            select: () => query,
            eq: () => query,
            order: () => query,
            limit: () => query,
          }
        );
        return query;
      },
    },
  });
});
describe('calendar sync recovery status', () => {
  it('exposes actionable failures and strips raw diagnostics and paused calendars', async () => {
    const response = await GET(new Request('https://calendar.test') as never, {
      params: Promise.resolve({ wsId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.failedCalendars).toEqual([
      { connectionId: 'active', calendarName: 'active', code: 'not_found' },
    ]);
    expect(body.recentRuns[0]).not.toHaveProperty('error_stack_trace');
    expect(JSON.stringify(body)).not.toContain('privatePayload');
  });
  it('does not reveal sync details without workspace membership', async () => {
    mocks.membership.mockResolvedValue({ ok: false });
    const response = await GET(new Request('https://calendar.test') as never, {
      params: Promise.resolve({ wsId }),
    });
    expect(response.status).toBe(403);
  });
});
