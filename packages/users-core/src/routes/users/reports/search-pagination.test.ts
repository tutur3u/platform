import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/supabase/next/server')>();
  return {
    ...actual,
    createAdminClient: () => actual.createAdminClient({ noCookie: true }),
  };
});
vi.mock('../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: async () => ({
    containsPermission: () => true,
  }),
}));
vi.mock('../../../lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => 'workspace',
  resolveRequestActorAuthUid: async () => 'actor',
}));

import { GET } from './route';

describe('smart-search pagination through the real Supabase query builder', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_SERVER_URL', 'https://reports-counts.test');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'test-only-key');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([1, 2])('retains the exact total on search page %i', async (page) => {
    const preferences: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.hostname !== 'reports-counts.test')
          throw new Error('Unexpected network target');
        const headers = { 'Content-Type': 'application/json' };
        if (url.pathname.endsWith('/workspaces'))
          return new Response(
            JSON.stringify({ id: 'workspace', timezone: 'UTC' }),
            { headers }
          );
        if (url.pathname.endsWith('/user_report_email_queue'))
          return new Response('[]', { headers });
        if (!url.pathname.endsWith('/rpc/search_periodic_reports'))
          throw new Error('Unexpected query');
        expect(url.searchParams.get('report_stage')).toBe('eq.blocked');
        expect(url.searchParams.get('period_end')).toBe('gte.2026-01-01');
        expect(url.searchParams.get('period_start')).toBe('lte.2026-12-31');
        const args = JSON.parse(String(init?.body));
        expect(args.p_search).toBe('matching');
        expect(args.p_cadence).toBe('monthly');
        const prefer = new Headers(init?.headers).get('Prefer') ?? '';
        preferences.push(prefer);
        const start = Number(url.searchParams.get('offset') ?? 0);
        const length = Math.min(
          Number(url.searchParams.get('limit') ?? 1000),
          1125 - start
        );
        const rows = Array.from({ length }, (_, index) => ({
          id: `report-${start + index}`,
          title: 'Matching report',
          report_stage: 'blocked',
          delivery_status: 'blocked',
          user_email: 'student@example.test',
          last_delivery_error: 'Delivery gate blocked: sender_not_configured',
        }));
        return new Response(JSON.stringify(rows), {
          headers: {
            ...headers,
            ...(prefer.includes('count=exact')
              ? { 'Content-Range': `${start}-${start + length - 1}/1125` }
              : {}),
          },
        });
      })
    );
    const response = await GET(
      new Request(
        `https://example.com/reports?q=matching&category=infrastructure&stage=blocked&periodStart=2026-01-01&periodEnd=2026-12-31&page=${page}&pageSize=20`
      ),
      { params: Promise.resolve({ wsId: 'workspace' }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1125);
    expect(body.data).toHaveLength(20);
    expect(body.counts.total).toBe(1125);
    expect(body.counts.stages.blocked).toBe(1125);
    expect(body.categoryCounts.infrastructure).toBe(1125);
    expect(body.categoryCounts.suppression).toBe(0);
    expect(preferences[0]).toContain('count=exact');
  });
  it('All retains the accent-insensitive cross-field AND predicate of every concrete cadence', async () => {
    const cadences = ['weekly', 'monthly', 'quarterly', 'yearly'];
    const dataset = cadences.flatMap((cadence, index) => [
      {
        id: `match-${cadence}`,
        cadence,
        title: 'Math report',
        user_display_name: 'Nguyễn An',
        user_email: 'student@example.test',
        report_stage: 'blocked',
        delivery_status: 'blocked',
        last_delivery_error: 'Delivery gate blocked: sender_not_configured',
        period_start: `2026-0${index + 1}-01`,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: `other-${cadence}`,
        cadence,
        title: 'Math report',
        user_display_name: 'Trần An',
        user_email: 'student@example.test',
        report_stage: 'blocked',
        delivery_status: 'blocked',
        last_delivery_error: 'Delivery gate blocked: sender_not_configured',
        period_start: '2026-01-01',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);
    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const rpcCadences: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const headers = { 'Content-Type': 'application/json' };
        if (url.pathname.endsWith('/workspaces'))
          return new Response(
            JSON.stringify({ id: 'workspace', timezone: 'UTC' }),
            { headers }
          );
        if (url.pathname.endsWith('/user_report_email_queue'))
          return new Response('[]', { headers });
        expect(url.pathname).toBe('/rest/v1/rpc/search_periodic_reports');
        const args = JSON.parse(String(init?.body));
        expect(args.p_search).toBe('nguyen math');
        expect(args.p_ws_id).toBe('workspace');
        expect(url.searchParams.get('report_stage')).toBe('eq.blocked');
        rpcCadences.push(args.p_cadence);
        const matches = dataset.filter(
          (row) =>
            row.cadence === args.p_cadence &&
            args.p_search
              .split(' ')
              .every((term: string) =>
                normalize(`${row.title} ${row.user_display_name}`).includes(
                  term
                )
              )
        );
        return new Response(JSON.stringify(matches), {
          headers: {
            ...headers,
            'Content-Range': `0-${matches.length - 1}/${matches.length}`,
          },
        });
      })
    );
    const load = async (cadence: string) => {
      const response = await GET(
        new Request(
          `https://example.test/reports?cadence=${cadence}&q=nguyen%20math&stage=blocked&category=infrastructure&pageSize=100&sortBy=period&sortDirection=desc`
        ),
        { params: Promise.resolve({ wsId: 'workspace' }) }
      );
      expect(response.status).toBe(200);
      return response.json();
    };
    const concrete = [];
    for (const cadence of cadences) concrete.push(await load(cadence));
    const all = await load('all');
    expect(rpcCadences).toEqual([...cadences, ...cadences]);
    expect(all.data.map((row: { id: string }) => row.id)).toEqual([
      'match-yearly',
      'match-quarterly',
      'match-monthly',
      'match-weekly',
    ]);
    expect(all.total).toBe(
      concrete.reduce((sum, result) => sum + result.total, 0)
    );
    expect(all.counts.stages.blocked).toBe(4);
    expect(all.categoryCounts.infrastructure).toBe(4);
    expect(new Set(all.data.map((row: { id: string }) => row.id))).toEqual(
      new Set(
        concrete.flatMap((result) =>
          result.data.map((row: { id: string }) => row.id)
        )
      )
    );
  });
  it.each(['all', 'monthly'])(
    'uses the same missing-RPC fallback for %s',
    async (cadence) => {
      const calls: URL[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL) => {
          const url = new URL(String(input));
          calls.push(url);
          const headers = { 'Content-Type': 'application/json' };
          if (url.pathname.endsWith('/workspaces'))
            return new Response(
              JSON.stringify({ id: 'workspace', timezone: 'UTC' }),
              { headers }
            );
          if (url.pathname.endsWith('/rpc/search_periodic_reports'))
            return new Response(
              JSON.stringify({
                code: 'PGRST202',
                message: 'Missing search function',
              }),
              { status: 404, headers }
            );
          expect(url.pathname).toBe(
            '/rest/v1/external_user_monthly_reports_workspace_view'
          );
          expect(url.searchParams.get('user_ws_id')).toBe('eq.workspace');
          expect(url.searchParams.get('cadence')).toBe(
            cadence === 'all' ? null : 'eq.monthly'
          );
          expect(url.searchParams.get('or')).toContain(
            'title.ilike."%matching%"'
          );
          return new Response('[]', {
            headers: { ...headers, 'Content-Range': '*/0' },
          });
        })
      );
      const response = await GET(
        new Request(
          `https://example.test/reports?cadence=${cadence}&q=matching`
        ),
        { params: Promise.resolve({ wsId: 'workspace' }) }
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        total: 0,
        data: [],
        counts: { total: 0 },
      });
      expect(
        calls.filter((url) =>
          url.pathname.endsWith('/external_user_monthly_reports_workspace_view')
        )
      ).toHaveLength(1);
    }
  );
});
