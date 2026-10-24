import type { calendar_v3 } from '@tuturuuu/google';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performIncrementalActiveSync } from './incremental-active-sync';

const mocks = vi.hoisted(() => ({
  list: vi.fn<
    (
      params: calendar_v3.Params$Resource$Events$List
    ) => Promise<{ data: calendar_v3.Schema$Events }>
  >(),
  getSyncToken: vi.fn<() => Promise<string | null>>(),
  clearSyncToken: vi.fn<() => Promise<void>>(),
  storeSyncToken: vi.fn<() => Promise<void>>(),
  maybeSingle: vi.fn(),
}));

vi.mock('@tuturuuu/google', () => ({
  google: { calendar: () => ({ events: { list: mocks.list } }) },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: mocks.maybeSingle,
    };
    return { from: () => query };
  },
}));

vi.mock('@tuturuuu/trigger/google-calendar-sync', () => ({
  getGoogleAuthClient: () => ({}),
  getSyncToken: mocks.getSyncToken,
  clearSyncToken: mocks.clearSyncToken,
  storeSyncToken: mocks.storeSyncToken,
  formatEventForDb: vi.fn(),
}));

vi.mock('@/lib/workspace-encryption', () => ({
  encryptGoogleSyncEvents: vi.fn(),
}));

const oldToken = 'synthetic-private-sync-token';
const nextToken = 'synthetic-private-next-sync-token';
const wsId = 'workspace-test';
const syncTokenKey = 'google:connection-test:primary';
const startDate = new Date('2026-10-01T00:00:00Z');
const endDate = new Date('2026-11-01T00:00:00Z');

function sync() {
  return performIncrementalActiveSync(
    wsId,
    'user-test',
    'primary',
    startDate,
    endDate,
    undefined,
    'connection-test'
  );
}

function captureLogs() {
  const methods = [
    'debug',
    'info',
    'log',
    'warn',
    'error',
  ] satisfies (keyof Console)[];
  return methods.map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {})
  );
}

describe('performIncrementalActiveSync token handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.maybeSingle.mockResolvedValue({
      data: {
        access_token: 'synthetic-access',
        refresh_token: 'synthetic-refresh',
      },
      error: null,
    });
    mocks.getSyncToken.mockResolvedValue(oldToken);
    mocks.list.mockResolvedValue({ data: { items: [] } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([oldToken, null])(
    'logs token presence without its value (stored token: %s)',
    async (token) => {
      const logs = captureLogs();
      mocks.getSyncToken.mockResolvedValue(token);

      const result = await sync();

      expect(result).toMatchObject({
        eventsInserted: 0,
        metrics: { syncTokenUsed: !!token, apiCallsCount: 1 },
      });
      expect(mocks.getSyncToken).toHaveBeenCalledWith(wsId, syncTokenKey);
      expect(logs[0]).toHaveBeenCalledWith(
        expect.stringContaining('Sync token result:'),
        expect.objectContaining({
          hasSyncToken: !!token,
          calendarId: 'primary',
        })
      );
      expect(JSON.stringify(logs.map((log) => log.mock.calls))).not.toContain(
        oldToken
      );
      const params = mocks.list.mock.calls[0]?.[0];
      if (token) {
        expect(params).toMatchObject({ syncToken: token });
        expect(params).not.toHaveProperty('timeMin');
        expect(params).not.toHaveProperty('timeMax');
      } else {
        expect(params).not.toHaveProperty('syncToken');
        expect(params).toMatchObject({
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
        });
      }
    }
  );

  it('stores the final paginated token without logging either sync token', async () => {
    const logs = captureLogs();
    mocks.list
      .mockResolvedValueOnce({ data: { items: [], nextPageToken: 'page-two' } })
      .mockResolvedValueOnce({ data: { items: [], nextSyncToken: nextToken } });

    expect(await sync()).toMatchObject({
      metrics: { apiCallsCount: 2, pagesFetched: 2, syncTokenUsed: true },
    });
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(mocks.list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ syncToken: oldToken, pageToken: 'page-two' })
    );
    expect(mocks.storeSyncToken).toHaveBeenCalledExactlyOnceWith(
      wsId,
      nextToken,
      expect.any(Date),
      syncTokenKey
    );
    const serializedLogs = JSON.stringify(logs.map((log) => log.mock.calls));
    expect(serializedLogs).not.toContain(oldToken);
    expect(serializedLogs).not.toContain(nextToken);
  });

  it('clears a first-page 410 token and uses a date-range fetch on the next invocation', async () => {
    captureLogs();
    let persistedToken: string | null = oldToken;
    mocks.getSyncToken.mockImplementation(async () => persistedToken);
    mocks.clearSyncToken.mockImplementation(async () => {
      persistedToken = null;
    });
    mocks.list.mockRejectedValueOnce({ code: 410 });

    expect(await sync()).toMatchObject({
      eventsInserted: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      metrics: {
        apiCallsCount: 1,
        pagesFetched: 0,
        retryCount: 1,
        syncTokenUsed: false,
      },
    });
    expect(mocks.clearSyncToken).toHaveBeenCalledExactlyOnceWith(
      wsId,
      syncTokenKey
    );
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.storeSyncToken).not.toHaveBeenCalled();

    mocks.list.mockResolvedValueOnce({
      data: { items: [], nextSyncToken: nextToken },
    });
    expect(await sync()).toMatchObject({
      metrics: { apiCallsCount: 1, pagesFetched: 1, syncTokenUsed: false },
    });
    const params = mocks.list.mock.calls[1]?.[0];
    expect(params).not.toHaveProperty('syncToken');
    expect(params).toMatchObject({
      pageToken: undefined,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
    });
    expect(mocks.storeSyncToken).toHaveBeenCalledExactlyOnceWith(
      wsId,
      nextToken,
      expect.any(Date),
      syncTokenKey
    );
  });

  it('propagates other Google errors without clearing or replacing the sync token', async () => {
    captureLogs();
    const error = { code: 503 };
    mocks.list.mockRejectedValueOnce(error);

    await expect(sync()).rejects.toBe(error);
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.clearSyncToken).not.toHaveBeenCalled();
    expect(mocks.storeSyncToken).not.toHaveBeenCalled();
  });
});
