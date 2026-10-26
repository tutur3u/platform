import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sync, admin, page, notification } = vi.hoisted(() => ({
  notification: vi.fn(),
  sync: vi.fn(),
  admin: vi.fn(),
  page: vi.fn(),
}));
vi.mock('@/app/api/v1/workspaces/[wsId]/calendar/sync/route', () => ({
  POST: sync,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({ createAdminClient: admin }));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withCronLogDrain: (_: unknown, run: () => unknown) => run(),
}));

import type { CalendarOAuthReasonCode } from '@/lib/calendar/oauth-failure';
import {
  type CalendarTokenOutcome,
  recordCalendarTokenOutcome,
} from '@/lib/calendar/oauth-token-health';
import { GET } from './route';

const filters = vi.fn();
function cronRequest(signal?: AbortSignal) {
  return new NextRequest(
    'https://calendar.tuturuuu.com/api/cron/calendar/provider-sync',
    {
      headers: { Authorization: 'Bearer test-cron-secret' },
      signal,
    }
  );
}

describe('Calendar provider cron ownership', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    vi.stubEnv('CALENDAR_OAUTH_ALERT_RECIPIENTS', 'ops@example.test');
    notification.mockResolvedValue({ data: 'notification-id', error: null });
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://old-web.example');
    vi.stubEnv('VERCEL_URL', 'protected-preview.example');
    const query = {
      eq: (column: string, value: boolean) => {
        filters(column, value);
        return query;
      },
      order: () => ({ range: page }),
    };
    admin.mockResolvedValue({
      from: () => ({ select: () => query }),
      rpc: notification,
    });
    page.mockResolvedValue({
      data: [{ ws_id: 'workspace-a' }, { ws_id: 'workspace-a' }],
      error: null,
    });
    sync.mockImplementation(async () =>
      NextResponse.json({ ok: true, summary: {} })
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });
  it('uses the local owner and cron auth independently of stale Web or preview origins', async () => {
    const response = await GET(
      new NextRequest(
        'https://calendar.tuturuuu.com/api/cron/calendar/provider-sync',
        { headers: { Authorization: 'Bearer test-cron-secret' } }
      )
    );
    expect(sync).toHaveBeenCalledTimes(1);
    const [request, context] = sync.mock.calls[0]!;
    expect(request.url).toBe(
      'https://calendar.tuturuuu.com/api/v1/workspaces/workspace-a/calendar/sync'
    );
    expect(request.headers.get('Authorization')).toBe(
      'Bearer test-cron-secret'
    );
    expect(await request.json()).toEqual({
      direction: 'inbound',
      source: 'cron',
    });
    expect(await context.params).toEqual({ wsId: 'workspace-a' });
    expect(await response.json()).toMatchObject({ ok: true, processed: 1 });
    expect(filters.mock.calls).toEqual([
      ['is_active', true],
      ['calendar_connections.is_enabled', true],
      ['calendar_connections.sync_inbound_enabled', true],
    ]);
  });
  type Outcome =
    | CalendarTokenOutcome
    | {
        outcome: CalendarTokenOutcome;
        provider: 'google' | 'microsoft';
        reason?: CalendarOAuthReasonCode;
        refreshed?: boolean;
      };
  function workspacesWithOutcomes(perWorkspace: Record<string, Outcome[]>) {
    page.mockResolvedValue({
      data: Object.keys(perWorkspace).map((ws_id) => ({ ws_id })),
      error: null,
    });
    sync.mockImplementation(async (_request, context) => {
      const { wsId } = await context.params;
      const outcomes = perWorkspace[wsId] ?? [];
      outcomes.forEach((item, index) => {
        const entry =
          typeof item === 'string'
            ? {
                outcome: item,
                provider: 'google' as const,
                reason:
                  item === 'deactivated'
                    ? ('google_invalid_grant' as const)
                    : undefined,
              }
            : item;
        recordCalendarTokenOutcome({
          tokenId: `${wsId}-token-${index}`,
          ...entry,
          attempts: entry.outcome === 'transient' ? 3 : 1,
        });
      });
      return NextResponse.json({
        ok: outcomes.every((item) => item === 'ok'),
        summary: {},
      });
    });
  }

  it('returns 200 with per-token outcomes for a mixed batch', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    workspacesWithOutcomes({
      'workspace-a': ['deactivated', 'ok'],
      'workspace-b': ['transient'],
      'workspace-c': ['ok'],
    });
    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    // The run completed: account failures are reported, not job failures.
    expect(body).toMatchObject({
      ok: true,
      partialFailure: true,
      processed: 3,
      successful: 1,
      failed: 2,
      failures: [
        { ws_id: 'workspace-a', error: 'Calendar sync partially failed' },
        { ws_id: 'workspace-b', error: 'Calendar sync partially failed' },
      ],
      tokens: {
        counts: { ok: 2, deactivated: 1, transient: 1, systemic: 0 },
        attentionOmitted: 0,
      },
    });
    expect(body.tokens.attention).toEqual([
      expect.objectContaining({
        provider: 'google',
        outcome: 'deactivated',
        reason: 'google_invalid_grant',
      }),
      expect.objectContaining({ outcome: 'transient' }),
    ]);
    expect(notification).not.toHaveBeenCalled();
    expect(body).not.toHaveProperty('results');
    expect(JSON.stringify(body)).not.toContain('token-0');
    expect(error).not.toHaveBeenCalledWith(
      'calendar.oauth.deactivation_spike',
      expect.anything()
    );
  });

  it('raises the deactivation spike hook and queues the operator alert', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    workspacesWithOutcomes({
      'workspace-a': Array(5).fill('deactivated'),
    });
    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      alerts: { status: 'queued', queued: 1, failed: 0 },
    });
    expect(notification).toHaveBeenCalledWith(
      'create_notification',
      expect.objectContaining({
        p_email: 'ops@example.test',
        p_code: 'calendar_oauth_health_spike',
      })
    );
    expect(error).toHaveBeenCalledWith(
      'calendar.oauth.deactivation_spike',
      expect.objectContaining({
        route: '/api/cron/calendar/provider-sync',
        deactivated: 5,
        reasons: { google_invalid_grant: 5 },
      })
    );
  });

  it('keeps holds nonfatal when alert delivery fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 26, 4, 5));
    notification.mockRejectedValue(new Error('unknown notification write'));
    workspacesWithOutcomes({ 'workspace-a': ['consensus_hold'] });
    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      alerts: { status: 'unknown', queued: 0, failed: 0, unknown: 1 },
    });
    expect(notification).toHaveBeenCalledTimes(1);
  });

  it('queues hourly alerts for an all-transient provider and suppresses healthy mixed samples', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const clock = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.UTC(2026, 9, 26, 4, 5));
    workspacesWithOutcomes({ 'workspace-a': ['transient'] });
    await GET(cronRequest());
    expect(notification).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'calendar.oauth.deactivation_spike',
      expect.objectContaining({ transientProviders: ['google'], transient: 1 })
    );
    notification.mockClear();
    clock.mockReturnValue(Date.UTC(2026, 9, 26, 4, 35));
    await GET(cronRequest());
    expect(notification).not.toHaveBeenCalled();
    clock.mockReturnValue(Date.UTC(2026, 9, 26, 5, 5));
    workspacesWithOutcomes({ 'workspace-a': ['transient', 'ok'] });
    await GET(cronRequest());
    expect(notification).not.toHaveBeenCalled();
  });

  // The first run of an hour, when recurring holds and systemic failures alert.
  const FIRST_RUN_OF_HOUR = Date.UTC(2026, 9, 26, 4, 5);
  const LATER_RUN = Date.UTC(2026, 9, 26, 4, 35);
  const google = (
    outcome: CalendarTokenOutcome,
    extra: Partial<{ reason: CalendarOAuthReasonCode; refreshed: boolean }> = {}
  ) => ({ provider: 'google' as const, outcome, ...extra });
  const microsoft = (
    outcome: CalendarTokenOutcome,
    extra: Partial<{ reason: CalendarOAuthReasonCode; refreshed: boolean }> = {}
  ) => ({ provider: 'microsoft' as const, outcome, ...extra });
  function quietLogs() {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    return vi.spyOn(console, 'error').mockImplementation(() => {});
  }

  it('fails the job when an OAuth client is broken for every account', async () => {
    const error = quietLogs();
    vi.spyOn(Date, 'now').mockReturnValue(FIRST_RUN_OF_HOUR);
    workspacesWithOutcomes({
      'workspace-a': [
        google('systemic'),
        google('systemic'),
        google('consensus_hold', { reason: 'google_unauthorized_client' }),
      ],
      'workspace-b': [google('systemic')],
    });
    const response = await GET(cronRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'Calendar OAuth client failure',
      providers: ['google'],
      tokens: { counts: { systemic: 3, consensus_hold: 1 } },
    });
    expect(error).toHaveBeenCalledWith(
      'calendar.oauth.deactivation_spike',
      expect.objectContaining({ held: 1, systemic: 3 })
    );
  });

  it('judges each provider on its own fresh refreshes', async () => {
    quietLogs();
    workspacesWithOutcomes({
      'workspace-a': [google('ok', { refreshed: true })],
      'workspace-b': [
        microsoft('systemic'),
        microsoft('systemic'),
        microsoft('systemic'),
      ],
    });
    const response = await GET(cronRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ providers: ['microsoft'] });
  });

  it('does not count unexpired credentials as proof the client works', async () => {
    quietLogs();
    const systemic = [
      google('systemic'),
      google('systemic'),
      google('systemic'),
    ];
    workspacesWithOutcomes({ 'workspace-a': [...systemic, google('ok')] });
    expect((await GET(cronRequest())).status).toBe(500);
    workspacesWithOutcomes({
      'workspace-a': [...systemic, google('ok', { refreshed: true })],
    });
    expect((await GET(cronRequest())).status).toBe(200);
  });

  it('keeps ordinary revocation churn at 200 so the scheduler keeps running', async () => {
    const error = quietLogs();
    vi.spyOn(Date, 'now').mockReturnValue(FIRST_RUN_OF_HOUR);
    const held = google('consensus_hold', { reason: 'google_invalid_grant' });
    workspacesWithOutcomes({
      'workspace-a': ['deactivated', 'ok'],
      'workspace-b': ['deactivated', held, held],
      'workspace-c': ['ok'],
    });
    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      tokens: { counts: { deactivated: 2, consensus_hold: 2, ok: 2 } },
    });
    expect(error).toHaveBeenCalledWith(
      'calendar.oauth.deactivation_spike',
      expect.objectContaining({ held: 2 })
    );
  });

  it('never fails the job for a provider whose only accounts are revoked', async () => {
    quietLogs();
    const revoked = microsoft('consensus_hold', {
      reason: 'microsoft_invalid_grant',
    });
    workspacesWithOutcomes({
      'workspace-a': [
        microsoft('deactivated', { reason: 'microsoft_invalid_grant' }),
        microsoft('deactivated', { reason: 'microsoft_invalid_grant' }),
        revoked,
        revoked,
        revoked,
      ],
      'workspace-b': [google('ok', { refreshed: true })],
    });
    expect((await GET(cronRequest())).status).toBe(200);
  });

  it('repeats hold and systemic alerts once an hour, not every run', async () => {
    const error = quietLogs();
    vi.spyOn(Date, 'now').mockReturnValue(LATER_RUN);
    workspacesWithOutcomes({
      'workspace-a': [
        google('consensus_hold', { reason: 'google_invalid_grant' }),
        google('systemic'),
        google('ok', { refreshed: true }),
      ],
    });
    expect((await GET(cronRequest())).status).toBe(200);
    expect(error).not.toHaveBeenCalledWith(
      'calendar.oauth.deactivation_spike',
      expect.anything()
    );
  });

  it('keeps one tenant that removed our Entra app from failing the job', async () => {
    quietLogs();
    // Five accounts in one tenant: two quarantined, three held by the
    // breaker, and no fresh Microsoft refresh anywhere in the run.
    const tenantRemoved = { reason: 'microsoft_unauthorized_client' as const };
    workspacesWithOutcomes({
      'tenant-a': [
        microsoft('deactivated', tenantRemoved),
        microsoft('deactivated', tenantRemoved),
        microsoft('consensus_hold', tenantRemoved),
        microsoft('consensus_hold', tenantRemoved),
        microsoft('consensus_hold', tenantRemoved),
      ],
      'workspace-b': [google('ok', { refreshed: true })],
    });
    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      partialFailure: true,
    });
  });

  it('does not fail the job for a few systemic outcomes among other accounts', async () => {
    quietLogs();
    workspacesWithOutcomes({
      'workspace-a': [
        'systemic',
        'systemic',
        google('consensus_hold', { reason: 'google_invalid_grant' }),
      ],
    });
    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      partialFailure: true,
    });
  });

  it.each([1, 2])(
    'fails the job when all %i evaluated accounts hit a broken client',
    async (count) => {
      quietLogs();
      workspacesWithOutcomes({
        'workspace-a': Array.from({ length: count }, () => 'systemic' as const),
      });
      const response = await GET(cronRequest());
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({
        ok: false,
        providers: ['google'],
      });
    }
  );

  it('rejects unauthorized calls before enumerating workspaces', async () => {
    expect(
      (
        await GET(
          new NextRequest(
            'https://calendar.tuturuuu.com/api/cron/calendar/provider-sync'
          )
        )
      ).status
    ).toBe(401);
    expect(admin).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });
  it('reads beyond the database row cap and deduplicates across pages', async () => {
    page
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, () => ({ ws_id: 'workspace-a' })),
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ ws_id: 'workspace-b' }], error: null });
    const response = await GET(
      new NextRequest(
        'https://calendar.tuturuuu.com/api/cron/calendar/provider-sync',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      )
    );
    expect(page.mock.calls).toEqual([
      [0, 499],
      [500, 999],
    ]);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({ ok: true, processed: 2 });
  });

  it('does not treat an incomplete workspace scan as success', async () => {
    page
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, () => ({ ws_id: 'workspace-a' })),
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'database unavailable' },
      });
    const response = await GET(
      new NextRequest(
        'https://calendar.tuturuuu.com/api/cron/calendar/provider-sync',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      )
    );
    expect(response.status).toBe(500);
    expect(sync).not.toHaveBeenCalled();
  });

  it('returns 200 with recorded partial provider failures', async () => {
    sync.mockResolvedValue(
      NextResponse.json({ ok: false, partialFailure: true, code: 'auth' })
    );
    const response = await GET(
      new NextRequest(
        'https://calendar.tuturuuu.com/api/cron/calendar/provider-sync',
        { headers: { Authorization: 'Bearer test-cron-secret' } }
      )
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      partialFailure: true,
      successful: 0,
      failed: 1,
      failures: [{ ws_id: 'workspace-a', error: 'auth' }],
    });
  });
  it('short circuits without dispatch when no active inbound connections are due', async () => {
    page.mockResolvedValue({ data: [], error: null });
    const response = await GET(
      new NextRequest(
        'https://calendar.tuturuuu.com/api/cron/calendar/provider-sync',
        { headers: { Authorization: 'Bearer test-cron-secret' } }
      )
    );
    expect(response.status).toBe(200);
    expect(sync).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ ok: true, processed: 0 });
  });

  it('bounds each dispatch batch and reports deferred workspaces', async () => {
    page.mockResolvedValue({
      data: Array.from({ length: 31 }, (_, i) => ({ ws_id: `workspace-${i}` })),
      error: null,
    });
    const response = await GET(
      new NextRequest(
        'https://calendar.tuturuuu.com/api/cron/calendar/provider-sync',
        { headers: { Authorization: 'Bearer test-cron-secret' } }
      )
    );
    expect(sync).toHaveBeenCalledTimes(10);
    expect(await response.json()).toMatchObject({
      processed: 10,
      deferred: 21,
    });
  });

  it('isolates thrown workspace failures and completes other workspaces', async () => {
    page.mockResolvedValue({
      data: [{ ws_id: 'bad' }, { ws_id: 'good' }],
      error: null,
    });
    sync.mockRejectedValueOnce(new Error('private-provider-detail'));
    const response = await GET(
      new NextRequest(
        'https://calendar.tuturuuu.com/api/cron/calendar/provider-sync',
        { headers: { Authorization: 'Bearer test-cron-secret' } }
      )
    );
    expect(response.status).toBe(200);
    expect(sync).toHaveBeenCalledTimes(2);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, failed: 1, successful: 1 });
    expect(JSON.stringify(body)).not.toContain('private-provider-detail');
  });

  it.each([10_000, 10_001])(
    'probes the scan boundary for %i eligible rows',
    async (rows) => {
      page.mockImplementation(async (from: number, to: number) => ({
        data: Array.from(
          { length: Math.max(0, Math.min(rows - from, to - from + 1)) },
          () => ({ ws_id: 'workspace' })
        ),
        error: null,
      }));
      sync.mockResolvedValue(NextResponse.json({ ok: true }));
      const response = await GET(cronRequest());
      expect(page).toHaveBeenLastCalledWith(10_000, 10_000);
      expect(page).toHaveBeenCalledTimes(21);
      expect(response.status).toBe(rows === 10_000 ? 200 : 500);
      expect(sync).toHaveBeenCalledTimes(rows === 10_000 ? 1 : 0);
    }
  );

  it('defers queued work after cancellation and retains in-flight failures', async () => {
    const controller = new AbortController();
    page.mockResolvedValue({
      data: Array.from({ length: 10 }, (_, i) => ({ ws_id: `ws-${i}` })),
      error: null,
    });
    sync.mockImplementation(async () => {
      controller.abort(new DOMException('deadline', 'TimeoutError'));
      controller.signal.throwIfAborted();
    });
    const response = await GET(cronRequest(controller.signal));
    const body = await response.json();
    expect(sync.mock.calls.length).toBeGreaterThan(0);
    expect(sync.mock.calls.length).toBeLessThanOrEqual(3);
    // Nothing completed before the deadline: the run itself failed.
    expect(body).toMatchObject({
      ok: false,
      error: 'No workspace sync completed',
      processed: sync.mock.calls.length,
      failed: sync.mock.calls.length,
      deferred: 10 - sync.mock.calls.length,
    });
  });

  it.each([502, null])(
    'logs sanitized workspace diagnostics for status %s',
    async (status) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      if (status)
        sync.mockResolvedValue(
          new NextResponse('private-provider-token email@example.test', {
            status,
          })
        );
      else
        sync.mockRejectedValue(
          new TypeError('private-provider-token email@example.test')
        );
      await GET(cronRequest());
      expect(warn).toHaveBeenCalledWith(
        'Calendar provider sync workspace failed',
        {
          wsId: 'workspace-a',
          errorName: status ? 'WorkspaceSyncHttpError' : 'TypeError',
          ...(status ? { httpStatus: status } : {}),
        }
      );
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(
        /private-provider-token|email@example/
      );
    }
  );

  it('logs sanitized outer dispatch errors', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.mockRejectedValue(
      new TypeError('private-provider-token email@example.test')
    );
    expect((await GET(cronRequest())).status).toBe(500);
    expect(error).toHaveBeenCalledWith(
      'Calendar provider sync dispatch failed',
      { errorName: 'TypeError' }
    );
    expect(JSON.stringify(error.mock.calls)).not.toMatch(
      /private-provider-token|email@example/
    );
  });
});
