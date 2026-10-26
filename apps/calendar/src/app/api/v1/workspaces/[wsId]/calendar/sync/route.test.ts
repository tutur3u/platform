import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  ensureValidTokenMock,
  dashboardUpdateMock,
  createAdminClientMock,
  createGraphClientMock,
  fetchMicrosoftEventsMock,
  performIncrementalActiveSyncMock,
  resolveSessionAuthContextMock,
  verifyWorkspaceMembershipTypeMock,
} = vi.hoisted(() => ({
  ensureValidTokenMock: vi.fn(),
  dashboardUpdateMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  createGraphClientMock: vi.fn(),
  fetchMicrosoftEventsMock: vi.fn(),
  performIncrementalActiveSyncMock: vi.fn(),
  resolveSessionAuthContextMock: vi.fn(),
  verifyWorkspaceMembershipTypeMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: verifyWorkspaceMembershipTypeMock,
}));

vi.mock('@/lib/calendar/incremental-active-sync', () => ({
  performIncrementalActiveSync: performIncrementalActiveSyncMock,
}));

vi.mock('@/lib/calendar/token-refresh', () => ({
  ensureValidToken: ensureValidTokenMock,
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: resolveSessionAuthContextMock,
}));

vi.mock('@tuturuuu/microsoft', () => ({
  createGraphClient: createGraphClientMock,
}));

vi.mock('@/lib/calendar/provider-sync-network', () => ({
  createSyncGraphClient: vi.fn(() => 'bounded-graph-client'),
}));

vi.mock('@tuturuuu/microsoft/calendar', () => ({
  convertMicrosoftEventToWorkspaceFormat: vi.fn(),
  fetchMicrosoftEvents: fetchMicrosoftEventsMock,
}));

import * as providerSyncBudget from '@/lib/calendar/provider-sync-budget';
import { POST } from './route';
import { createSyncAdminSupabaseMock } from './sync-route.test-helpers';

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const WS_ID = '071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1';

function createAdminSupabaseMock(
  options: Parameters<typeof createSyncAdminSupabaseMock>[1] = {}
) {
  return createSyncAdminSupabaseMock(dashboardUpdateMock, options);
}

describe('workspace calendar sync route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ensureValidTokenMock.mockResolvedValue({
      accessToken: 'refreshed-microsoft-token',
      refreshed: true,
      expiresAt: null,
    });
    process.env.CRON_SECRET = 'cron-secret';
    createAdminClientMock.mockResolvedValue(createAdminSupabaseMock());
    createGraphClientMock.mockReturnValue('graph-client');
    fetchMicrosoftEventsMock.mockResolvedValue([]);
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase: { auth: {} },
      user: { id: 'manual-user-id' },
    });
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
    performIncrementalActiveSyncMock.mockResolvedValue({
      eventsDeleted: 0,
      eventsInserted: 1,
      eventsUpdated: 2,
    });
  });

  it('rejects anonymous callers before membership or admin work', async () => {
    const { NextResponse } = await import('next/server');
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await POST(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`, {
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ wsId: WS_ID }) }
    );

    expect(response.status).toBe(401);
    expect(resolveSessionAuthContextMock).toHaveBeenCalledWith(
      expect.any(Request),
      { allowAppSessionAuth: true }
    );
    expect(verifyWorkspaceMembershipTypeMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('rejects a nonmember before admin work', async () => {
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: false });

    const response = await POST(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`, {
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ wsId: WS_ID }) }
    );

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('fails closed when membership lookup fails', async () => {
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({
      error: 'membership_lookup_failed',
      ok: false,
    });

    const response = await POST(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`, {
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ wsId: WS_ID }) }
    );

    expect(response.status).toBe(500);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns the existing-running state without starting another sync', async () => {
    createAdminClientMock.mockResolvedValue(
      createAdminSupabaseMock({
        recentRuns: [
          {
            id: 'running-sync-id',
            start_time: new Date().toISOString(),
            status: 'running',
          },
        ],
      })
    );

    const response = await POST(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`, {
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ wsId: WS_ID }) }
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      alreadyRunning: true,
      code: 'sync_already_running',
      ok: true,
    });
    expect(performIncrementalActiveSyncMock).not.toHaveBeenCalled();
  });

  it('refreshes Microsoft credentials before background fetching', async () => {
    const response = await POST(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`, {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret' },
      }) as never,
      { params: Promise.resolve({ wsId: WS_ID }) }
    );
    expect(response.status).toBe(200);
    expect(ensureValidTokenMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'microsoft-token-id' })
    );
    expect(createGraphClientMock).toHaveBeenCalledWith(
      'refreshed-microsoft-token'
    );
  });

  it('never fetches Microsoft events with credentials that failed refresh', async () => {
    ensureValidTokenMock.mockImplementation(async (_client, token) =>
      token.provider === 'microsoft'
        ? {
            accessToken: 'expired',
            error: 'invalid_grant',
            failure: {
              kind: 'permanent',
              reason: 'microsoft_invalid_grant',
              providerCode: 'invalid_grant',
            },
            quarantine: 'deactivated',
          }
        : { accessToken: token.access_token, refreshed: false }
    );
    const response = await POST(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`, {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret' },
      }) as never,
      { params: Promise.resolve({ wsId: WS_ID }) }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: 'auth',
      summary: { google: { inserted: 1 }, microsoft: { failedAccounts: 1 } },
    });
    expect(dashboardUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error_type: 'auth' })
    );
    expect(createGraphClientMock).not.toHaveBeenCalled();
    expect(fetchMicrosoftEventsMock).not.toHaveBeenCalled();
  });

  it('records failed completion with an independent client after downstream cancellation', async () => {
    const controller = new AbortController();
    const completion = vi.spyOn(
      providerSyncBudget,
      'createSyncCompletionClient'
    );
    const db = createAdminSupabaseMock();
    const from = db.from.getMockImplementation()!;
    db.from.mockImplementation((table) => {
      if (table === 'calendar_auth_tokens') controller.signal.throwIfAborted();
      return from(table);
    });
    createAdminClientMock.mockReturnValue(db);
    performIncrementalActiveSyncMock.mockImplementation(async () => {
      controller.abort(
        new DOMException('Calendar sync timed out', 'TimeoutError')
      );
      controller.signal.throwIfAborted();
    });
    const response = await providerSyncBudget.withProviderSyncBudget(
      controller.signal,
      () =>
        POST(
          new Request(
            `http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`,
            { method: 'POST' }
          ) as never,
          { params: Promise.resolve({ wsId: WS_ID }) }
        )
    );
    expect(performIncrementalActiveSyncMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    expect(completion).toHaveBeenCalledTimes(1);
    expect(createAdminClientMock).toHaveBeenCalledTimes(2);
    expect(dashboardUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        end_time: expect.any(String),
      })
    );
    completion.mockRestore();
  });

  it('completes successful bounded work while reporting deferred connections', async () => {
    createAdminClientMock.mockReturnValue(
      createAdminSupabaseMock({
        additionalGoogleConnections: Array.from({ length: 24 }, (_, i) => ({
          id: `connection-${i}`,
          calendar_id: `calendar-${i}`,
          calendar_name: 'Calendar',
          auth_token_id: 'google-token-id',
          is_enabled: true,
          ws_id: WS_ID,
        })),
      })
    );
    const response = await providerSyncBudget.withProviderSyncBudget(
      new AbortController().signal,
      () =>
        POST(
          new Request(
            `http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`,
            { method: 'POST' }
          ) as never,
          { params: Promise.resolve({ wsId: WS_ID }) }
        )
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      partialFailure: false,
      summary: {
        google: {
          processedConnections: 20,
          deferredConnections: 5,
          failedConnections: 0,
        },
      },
    });
    expect(dashboardUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        error_type: null,
        error_message: null,
        error_stack_trace: JSON.stringify({ version: 1, failedCalendars: [] }),
      })
    );
  });

  it('enforces the manual sync cooldown', async () => {
    createAdminClientMock.mockResolvedValue(
      createAdminSupabaseMock({
        recentRuns: [
          {
            id: 'recent-sync-id',
            start_time: new Date().toISOString(),
            status: 'success',
          },
        ],
      })
    );

    const response = await POST(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`, {
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ wsId: WS_ID }) }
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toMatchObject({ code: 'sync_cooldown_active' });
    expect(performIncrementalActiveSyncMock).not.toHaveBeenCalled();
  });

  it('does not let a workspace member impersonate cron to bypass cooldown', async () => {
    createAdminClientMock.mockResolvedValue(
      createAdminSupabaseMock({
        recentRuns: [
          {
            id: 'recent',
            start_time: new Date().toISOString(),
            status: 'success',
          },
        ],
      })
    );
    const response = await POST(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'inbound', source: 'cron' }),
      }) as never,
      { params: Promise.resolve({ wsId: WS_ID }) }
    );
    expect(response.status).toBe(429);
    expect(performIncrementalActiveSyncMock).not.toHaveBeenCalled();
  });

  it.each(['invalid', 42, {}, []])(
    'rejects invalid sync direction %j',
    async (direction) => {
      const response = await POST(
        new Request(
          `http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction }),
          }
        ) as never,
        { params: Promise.resolve({ wsId: WS_ID }) }
      );
      expect(response.status).toBe(400);
      expect(performIncrementalActiveSyncMock).not.toHaveBeenCalled();
    }
  );

  it('does not report success when the completion record cannot be saved', async () => {
    createAdminClientMock.mockResolvedValue(
      createAdminSupabaseMock({ completionFailure: true })
    );
    const response = await POST(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'inbound' }),
      }) as never,
      { params: Promise.resolve({ wsId: WS_ID }) }
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: 'Failed to record sync completion',
    });
    expect(dashboardUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('runs a manual sync for an authorized workspace member', async () => {
    const response = await POST(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`, {
        body: JSON.stringify({ direction: 'inbound' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ wsId: WS_ID }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ direction: 'inbound', ok: true });
    expect(dashboardUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' })
    );
    expect(verifyWorkspaceMembershipTypeMock).toHaveBeenCalledWith({
      supabase: { auth: {} },
      userId: 'manual-user-id',
      wsId: WS_ID,
    });
    expect(performIncrementalActiveSyncMock).toHaveBeenCalled();
  });

  afterEach(() => {
    if (ORIGINAL_CRON_SECRET === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    }
  });

  it('uses the resolved workspace creator as the cron Google sync fallback user', async () => {
    const response = await POST(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`, {
        body: JSON.stringify({ direction: 'inbound', source: 'cron' }),
        headers: {
          Authorization: 'Bearer cron-secret',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }) as never,
      {
        params: Promise.resolve({ wsId: WS_ID }),
      }
    );

    expect(response.status).toBe(200);
    expect(performIncrementalActiveSyncMock).toHaveBeenCalledWith(
      WS_ID,
      'creator-user-id',
      'primary',
      expect.any(Date),
      expect.any(Date),
      undefined,
      'google-token-id',
      'google-workspace-calendar-id',
      { syncDeletes: true }
    );
    expect(performIncrementalActiveSyncMock).toHaveBeenCalledTimes(1);
    expect(createGraphClientMock).toHaveBeenCalledWith(
      'refreshed-microsoft-token'
    );
    expect(fetchMicrosoftEventsMock).toHaveBeenCalledWith(
      'graph-client',
      'microsoft-calendar-id',
      expect.any(String),
      expect.any(String)
    );
  });

  it.each([true, false])(
    'prioritizes auth recovery across mixed failures (partial=%s)',
    async (partial) => {
      createAdminClientMock.mockResolvedValue(
        createAdminSupabaseMock({
          additionalGoogleConnections: [
            {
              auth_token_id: 'google-token-id',
              calendar_id: 'second',
              is_enabled: true,
              ws_id: WS_ID,
            },
            {
              auth_token_id: 'google-token-id',
              calendar_id: 'third',
              is_enabled: true,
              ws_id: WS_ID,
            },
          ],
        })
      );
      performIncrementalActiveSyncMock
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockRejectedValueOnce(new Error('invalid_grant'));
      if (partial)
        performIncrementalActiveSyncMock.mockResolvedValueOnce({
          eventsDeleted: 0,
          eventsInserted: 0,
          eventsUpdated: 0,
        });
      else
        performIncrementalActiveSyncMock.mockRejectedValueOnce(
          new Error('temporary network error')
        );
      const response = await POST(
        new Request(
          `http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: 'inbound' }),
          }
        ) as never,
        { params: Promise.resolve({ wsId: WS_ID }) }
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ code: 'auth' });
      expect(dashboardUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', error_type: 'auth' })
      );
    }
  );

  it('continues syncing healthy Google calendars when one connection is stale', async () => {
    createAdminClientMock.mockResolvedValue(
      createAdminSupabaseMock({
        additionalGoogleConnections: [
          {
            auth_token_id: 'google-token-id',
            calendar_id: 'healthy-calendar',
            is_enabled: true,
            workspace_calendar_id: 'healthy-workspace-calendar-id',
            ws_id: WS_ID,
          },
        ],
      })
    );
    performIncrementalActiveSyncMock
      .mockRejectedValueOnce(new Error('invalid_request'))
      .mockResolvedValueOnce({
        eventsDeleted: 1,
        eventsInserted: 0,
        eventsUpdated: 0,
      });

    const response = await POST(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`, {
        body: JSON.stringify({ direction: 'inbound', source: 'cron' }),
        headers: {
          Authorization: 'Bearer cron-secret',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ wsId: WS_ID }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: false,
      partialFailure: true,
      code: 'configuration',
    });
    expect(dashboardUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error_type: 'configuration' })
    );
    expect(performIncrementalActiveSyncMock).toHaveBeenCalledTimes(2);
    expect(body.summary.google).toMatchObject({
      deleted: 1,
      failedConnections: 1,
      processedConnections: 1,
      failedCalendars: [
        {
          connectionId: 'primary-connection',
          calendarName: 'Primary',
          code: 'configuration',
        },
      ],
    });
    expect(dashboardUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error_stack_trace: JSON.stringify({
          version: 1,
          failedCalendars: [
            {
              connectionId: 'primary-connection',
              calendarName: 'Primary',
              code: 'configuration',
            },
          ],
        }),
      })
    );
  });
});
