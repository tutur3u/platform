import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({
  actor: 'actor' as string | null,
  allowed: true,
}));
vi.mock('../../../lib/user-groups/groups-utils', () => ({
  getUserGroupMembershipsForActor: async () => ['group-1'],
}));

vi.mock('@tuturuuu/supabase/next/server', async (original) => {
  const actual =
    await original<typeof import('@tuturuuu/supabase/next/server')>();
  return {
    ...actual,
    createAdminClient: () => actual.createAdminClient({ noCookie: true }),
  };
});
vi.mock('../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: async () => ({
    containsPermission: (permission: string) =>
      access.allowed && permission !== 'manage_users',
  }),
}));
vi.mock('../../../lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => 'workspace',
  resolveRequestActorAuthUid: async () => access.actor,
}));

import { GET } from './route';

beforeEach(() => {
  access.actor = 'actor';
  access.allowed = true;
  vi.stubEnv('SUPABASE_SERVER_URL', 'https://reports-filters.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-only-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('applies period overlap to rows and counts, includes unapproved legacy records, and scopes test deliveries', async () => {
  const urls: URL[] = [];
  let countArgs: unknown;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.hostname).toBe('reports-filters.test');
      urls.push(url);
      const headers = {
        'Content-Type': 'application/json',
        'Content-Range': '0-0/1',
      };
      if (url.pathname.endsWith('/workspaces'))
        return new Response(
          JSON.stringify({ id: 'workspace', timezone: 'Asia/Ho_Chi_Minh' }),
          { headers }
        );
      if (url.pathname.endsWith('/rpc/get_periodic_report_stage_counts')) {
        countArgs = JSON.parse(String(init?.body));
        return new Response('{"pending":1}', { headers });
      }
      if (url.pathname.endsWith('/user_report_email_queue'))
        return new Response(
          '[{"report_id":"report-1","status":"sent","sent_at":"2026-09-11T15:20:44Z"}]',
          { headers }
        );
      if (init?.method === 'HEAD') return new Response(null, { headers });
      return new Response('[{"id":"report-1","delivery_status":"draft"}]', {
        headers,
      });
    })
  );
  const response = await GET(
    new Request(
      'https://example.test/reports?stage=pending&approvalStatus=UNAPPROVED&periodStart=2026-08-01&periodEnd=2026-08-31'
    ),
    { params: Promise.resolve({ wsId: 'workspace' }) }
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.counts.total).toBe(1);
  expect(body.workspace.timezone).toBe('Asia/Ho_Chi_Minh');
  expect(
    urls.some((url) => url.pathname.endsWith('/rpc/get_periodic_report_counts'))
  ).toBe(false);
  expect(body.data[0]).toMatchObject({
    delivery_status: 'draft',
    test_delivery: { status: 'sent' },
  });
  const reportQueries = urls.filter((url) =>
    url.pathname.endsWith('/external_user_monthly_reports_workspace_view')
  );
  expect(reportQueries).toHaveLength(1);
  expect(reportQueries[0]?.searchParams.get('report_stage')).toBe('eq.pending');
  expect(countArgs).toMatchObject({
    p_ws_id: 'workspace',
    p_group_ids: ['group-1'],
    p_period_start: '2026-08-01',
    p_period_end: '2026-08-31',
  });
  for (const url of reportQueries) {
    expect(url.searchParams.get('period_end')).toBe('gte.2026-08-01');
    expect(url.searchParams.get('period_start')).toBe('lte.2026-08-31');
    expect(url.searchParams.get('user_ws_id')).toBe('eq.workspace');
    expect(url.searchParams.get('group_id')).toBe('in.(group-1)');
  }
  expect(reportQueries[0]?.searchParams.get('or')).toBe(
    '(report_approval_status.neq.APPROVED,report_approval_status.is.null)'
  );
  const queue = urls.find((url) =>
    url.pathname.endsWith('/user_report_email_queue')
  )!;
  expect(queue.searchParams.get('ws_id')).toBe('eq.workspace');
  expect(queue.searchParams.get('report_id')).toBe('in.(report-1)');
  expect(queue.searchParams.get('delivery_kind')).toBe('eq.test');
});

it.each([
  'stage=unknown',
  'periodStart=invalid',
  'periodStart=2026-09-01&periodEnd=2026-08-01',
])('rejects invalid date scope: %s', async (query) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const response = await GET(
    new Request(`https://example.test/reports?${query}`),
    { params: Promise.resolve({ wsId: 'workspace' }) }
  );
  expect(response.status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});

it('returns no reports when the actor has no accessible groups', async () => {
  access.actor = null;
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const response = await GET(new Request('https://example.test/reports'), {
    params: Promise.resolve({ wsId: 'workspace' }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ data: [], total: 0 });
  expect(fetch).not.toHaveBeenCalled();
});
it('rejects viewers without report permission before querying data', async () => {
  access.allowed = false;
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const response = await GET(new Request('https://example.test/reports'), {
    params: Promise.resolve({ wsId: 'workspace' }),
  });
  expect(response.status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
