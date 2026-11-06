import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
    containsPermission: (permission: string) => permission !== 'manage_users',
  }),
}));
vi.mock('../../../lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => 'workspace',
  resolveRequestActorAuthUid: async () => 'actor',
}));

import { GET } from './route';

// Synthetic fixture. October: one report with a saved October period and two
// older reports without a period, written on 28 Oct and on 2 Nov (GMT+7).
// November: one report without a period, written on 12 Nov.
const row = (
  id: string,
  stage: 'pending' | 'approved',
  createdAt: string,
  period: string | null = null
) => ({
  id,
  cadence: 'monthly',
  report_stage: stage,
  delivery_status: 'draft',
  report_approval_status: stage === 'pending' ? 'PENDING' : 'APPROVED',
  generation_status: 'ready',
  delivered_at: null,
  user_email: `${id}@example.test`,
  last_delivery_error: null,
  created_at: createdAt,
  period_start: period ? `${period}-01` : null,
  period_end: period ? `${period}-31` : null,
});
const october = [
  row('oct-saved', 'pending', '2026-11-03T03:00:00Z', '2026-10'),
  row('oct-written-2-nov', 'pending', '2026-11-02T03:00:00Z'),
  row('oct-written-28-oct', 'approved', '2026-10-28T03:00:00Z'),
];
const november = [row('nov-written-12-nov', 'pending', '2026-11-12T03:00:00Z')];

const state = vi.hoisted(() => ({
  urls: [] as URL[],
  workspaceTimezone: 'Asia/Ho_Chi_Minh' as string | null,
}));

beforeEach(() => {
  state.urls = [];
  state.workspaceTimezone = 'Asia/Ho_Chi_Minh';
  vi.stubEnv('SUPABASE_SERVER_URL', 'https://reports-month.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-only-key');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      state.urls.push(url);
      const json = (body: unknown, count: number) =>
        new Response(JSON.stringify(body), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Range': count ? `0-${count - 1}/${count}` : '*/0',
          },
        });
      if (url.pathname.endsWith('/workspaces'))
        return json({ id: 'workspace', timezone: state.workspaceTimezone }, 1);
      if (url.pathname.endsWith('/user_report_email_queue')) return json([], 0);
      // Emulate the month filter: PostgREST evaluates it in the database.
      const or = url.searchParams.getAll('or').join(' ');
      const scoped = or.includes('period_start.gte.2026-10-01')
        ? october
        : or.includes('period_start.gte.2026-11-01')
          ? november
          : [...october, ...november];
      const stage = url.searchParams.get('report_stage')?.replace('eq.', '');
      const rows = stage
        ? scoped.filter((item) => item.report_stage === stage)
        : scoped;
      return json(rows, rows.length);
    })
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const reportQueries = () =>
  state.urls.filter((url) =>
    url.pathname.endsWith('/external_user_monthly_reports_workspace_view')
  );
const get = (query: string) =>
  GET(new Request(`https://example.test/reports?${query}`), {
    params: Promise.resolve({ wsId: 'workspace' }),
  });

const OCTOBER_FILTER =
  '(and(period_start.gte.2026-10-01,period_start.lte.2026-10-31),and(period_start.is.null,created_at.gte."2026-10-10T17:00:00.000Z",created_at.lt."2026-11-10T17:00:00.000Z"))';

it('selects October by saved period and by estimated month, on the list and the summary read', async () => {
  const response = await get('stage=pending&cadence=monthly&month=2026-10');
  expect(response.status).toBe(200);
  const body = await response.json();
  const queries = reportQueries();
  // List read plus the all-stage summary read, both scoped to October.
  expect(queries).toHaveLength(2);
  for (const url of queries)
    expect(url.searchParams.getAll('or')).toContain(OCTOBER_FILTER);
  expect(body.data.map((item: { id: string }) => item.id)).toEqual([
    'oct-saved',
    'oct-written-2-nov',
  ]);
  expect(
    body.data.map(
      (item: { report_month: string; report_month_estimated: boolean }) => [
        item.report_month,
        item.report_month_estimated,
      ]
    )
  ).toEqual([
    ['2026-10', false],
    ['2026-10', true],
  ]);
});

it('summary counts follow the selected month', async () => {
  const octoberBody = await (await get('stage=pending&month=2026-10')).json();
  const novemberBody = await (await get('stage=pending&month=2026-11')).json();
  expect(octoberBody.counts.total).toBe(3);
  expect(octoberBody.counts.stages).toMatchObject({ pending: 2, approved: 1 });
  expect(novemberBody.counts.total).toBe(1);
  expect(novemberBody.counts.stages).toMatchObject({ pending: 1, approved: 0 });
  expect(novemberBody.data[0]).toMatchObject({
    report_month: '2026-11',
    report_month_estimated: true,
  });
});

it('uses the viewer timezone for the month when the workspace has none', async () => {
  state.workspaceTimezone = 'auto';
  await get('month=2026-10&timezone=Asia%2FHo_Chi_Minh');
  expect(reportQueries()[0]?.searchParams.getAll('or')).toContain(
    OCTOBER_FILTER
  );
});

it.each([
  'month=2026-13',
  'month=2026-10-01',
  'month=2026-10&periodStart=2026-10-01',
  'month=2026-10&periodEnd=2026-10-31',
])('rejects %s', async (query) => {
  expect((await get(query)).status).toBe(400);
  expect(reportQueries()).toHaveLength(0);
});
