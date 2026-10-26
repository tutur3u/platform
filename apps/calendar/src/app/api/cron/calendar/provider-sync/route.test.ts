import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sync, admin, page } = vi.hoisted(() => ({
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
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://old-web.example');
    vi.stubEnv('VERCEL_URL', 'protected-preview.example');
    const query = {
      eq: (column: string, value: boolean) => {
        filters(column, value);
        return query;
      },
      order: () => ({ range: page }),
    };
    admin.mockResolvedValue({ from: () => ({ select: () => query }) });
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
    expect(body).toMatchObject({
      ok: false,
      processed: 3,
      successful: 1,
      failed: 2,
      tokens: {
        counts: { ok: 2, deactivated: 1, transient: 1, systemic: 0 },
      },
    });
    expect(body.tokens.outcomes).toHaveLength(4);
    expect(body.tokens.outcomes[0]).toMatchObject({
      provider: 'google',
      outcome: 'deactivated',
      reason: 'google_invalid_grant',
    });
    expect(JSON.stringify(body)).not.toContain('token-0');
    expect(error).not.toHaveBeenCalledWith(
      'calendar.oauth.deactivation_spike',
      expect.anything()
    );
  });

  it('raises the deactivation spike hook', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    workspacesWithOutcomes({
      'workspace-a': Array(5).fill('deactivated'),
    });
    expect((await GET(cronRequest())).status).toBe(200);
    expect(error).toHaveBeenCalledWith(
      'calendar.oauth.deactivation_spike',
      expect.objectContaining({
        route: '/api/cron/calendar/provider-sync',
        deactivated: 5,
        reasons: { google_invalid_grant: 5 },
      })
    );
  });

  it('fails the job when an OAuth client is broken for every account', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    workspacesWithOutcomes({
      'workspace-a': ['systemic', 'consensus_hold'],
      'workspace-b': ['consensus_hold'],
    });
    const response = await GET(cronRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'Calendar OAuth client failure',
      providers: ['google'],
      tokens: { counts: { systemic: 1, consensus_hold: 2 } },
    });
    expect(error).toHaveBeenCalledWith(
      'calendar.oauth.deactivation_spike',
      expect.objectContaining({ held: 2, systemic: 1 })
    );
  });

  it('keeps ordinary revocation churn at 200 so the scheduler keeps running', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    workspacesWithOutcomes({
      'workspace-a': ['deactivated', 'ok'],
      'workspace-b': ['deactivated', 'consensus_hold', 'consensus_hold'],
      'workspace-c': ['ok'],
    });
    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      tokens: { counts: { deactivated: 2, consensus_hold: 2, ok: 2 } },
    });
    // The hold still alerts.
    expect(error).toHaveBeenCalledWith(
      'calendar.oauth.deactivation_spike',
      expect.objectContaining({ held: 2 })
    );
  });

  it('keeps one tenant that removed our Entra app from stopping other tenants', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const tenantRemoved = {
      provider: 'microsoft' as const,
      reason: 'microsoft_unauthorized_client' as const,
    };
    workspacesWithOutcomes({
      'tenant-a': [
        { ...tenantRemoved, outcome: 'deactivated' },
        { ...tenantRemoved, outcome: 'deactivated' },
        { ...tenantRemoved, outcome: 'consensus_hold' },
      ],
      'tenant-b': [{ provider: 'microsoft', outcome: 'ok' }],
    });
    expect((await GET(cronRequest())).status).toBe(200);
  });

  it('does not fail the job for systemic outcomes below the threshold', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    workspacesWithOutcomes({ 'workspace-a': ['systemic', 'systemic'] });
    expect((await GET(cronRequest())).status).toBe(200);
  });

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
      ok: false,
      successful: 0,
      failed: 1,
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
    expect(body).toMatchObject({ ok: false, failed: 1, successful: 1 });
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
    expect(body).toMatchObject({
      ok: false,
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
