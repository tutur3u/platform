import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sync, admin } = vi.hoisted(() => ({ sync: vi.fn(), admin: vi.fn() }));
vi.mock('@/app/api/v1/workspaces/[wsId]/calendar/sync/route', () => ({
  POST: sync,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({ createAdminClient: admin }));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withCronLogDrain: (_: unknown, run: () => unknown) => run(),
}));

import { GET } from './route';

describe('Calendar provider cron ownership', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://old-web.example');
    vi.stubEnv('VERCEL_URL', 'protected-preview.example');
    admin.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: async () => ({
            data: [{ ws_id: 'workspace-a' }, { ws_id: 'workspace-a' }],
            error: null,
          }),
        }),
      }),
    });
    sync.mockResolvedValue(NextResponse.json({ ok: true, summary: {} }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
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
  it('reports partial provider failures', async () => {
    sync.mockResolvedValue(
      NextResponse.json({ ok: false, partialFailure: true, code: 'auth' })
    );
    const response = await GET(
      new NextRequest(
        'https://calendar.tuturuuu.com/api/cron/calendar/provider-sync',
        { headers: { Authorization: 'Bearer test-cron-secret' } }
      )
    );
    expect(await response.json()).toMatchObject({
      ok: false,
      successful: 0,
      failed: 1,
    });
  });
});
