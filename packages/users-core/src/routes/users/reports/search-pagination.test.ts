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
        if (url.pathname.endsWith('/rpc/get_periodic_report_stage_counts'))
          return new Response(JSON.stringify({ pending: 25 }), { headers });
        if (!url.pathname.endsWith('/rpc/search_periodic_reports'))
          throw new Error('Unexpected query');
        const prefer = new Headers(init?.headers).get('Prefer') ?? '';
        preferences.push(prefer);
        const start = Number(url.searchParams.get('offset') ?? 0);
        const length = Math.min(20, 25 - start);
        const rows = Array.from({ length }, (_, index) => ({
          id: `report-${start + index}`,
          title: 'Matching report',
        }));
        return new Response(JSON.stringify(rows), {
          headers: {
            ...headers,
            ...(prefer.includes('count=exact')
              ? { 'Content-Range': `${start}-${start + length - 1}/25` }
              : {}),
          },
        });
      })
    );
    const response = await GET(
      new Request(
        `https://example.com/reports?q=matching&page=${page}&pageSize=20`
      ),
      { params: Promise.resolve({ wsId: 'workspace' }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(25);
    expect(body.data).toHaveLength(page === 1 ? 20 : 5);
    expect(preferences[0]).toContain('count=exact');
  });
});
