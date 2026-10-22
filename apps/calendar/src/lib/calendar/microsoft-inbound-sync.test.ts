import { afterEach, expect, it, vi } from 'vitest';

const { refresh, fetchEvents, graph } = vi.hoisted(() => ({
  refresh: vi.fn(),
  fetchEvents: vi.fn(),
  graph: vi.fn(),
}));
vi.mock('@tuturuuu/microsoft', () => ({ createGraphClient: graph }));
vi.mock('@tuturuuu/microsoft/calendar', () => ({
  fetchMicrosoftEvents: fetchEvents,
}));
vi.mock('./token-refresh', () => ({ ensureValidToken: refresh }));
vi.mock('./recurrence/provider/inbound/graph-connection', () => ({
  reconcileGraphConnectionSeries: vi.fn(async (args) => args.legacyEvents),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import { syncMicrosoftInbound } from './microsoft-inbound-sync';

afterEach(() => vi.resetAllMocks());
it('records a rejected Microsoft account and continues to a healthy account', async () => {
  function builder(data: unknown[]) {
    const query = Object.assign(Promise.resolve({ data, error: null }), {
      select: () => query,
      eq: () => query,
    });
    return query;
  }
  const tokenQuery = builder([{ id: 'bad' }, { id: 'good' }]);
  const connectionQuery = builder([
    { id: 'connection', calendar_id: 'calendar', sync_delete_enabled: false },
  ]);
  const db = {
    from: (table: string) =>
      table === 'calendar_auth_tokens' ? tokenQuery : connectionQuery,
  };
  refresh
    .mockResolvedValueOnce({ error: 'invalid_grant' })
    .mockResolvedValueOnce({ accessToken: 'test-token' });
  fetchEvents.mockResolvedValue([]);
  const result = await syncMicrosoftInbound({
    sbAdmin: db as never,
    wsId: 'workspace',
    rangeStart: '2026-10-01',
    rangeEnd: '2026-11-01',
    settingsAvailable: true,
  });
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(fetchEvents).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({
    processedAccounts: 1,
    failedAccounts: 1,
    failureType: 'auth',
  });
});
