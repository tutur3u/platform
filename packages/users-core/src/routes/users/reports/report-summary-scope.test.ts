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

// Synthetic fixture: 3 pending, 2 approved, 1 sent monthly report.
const fixture = [
  ['p1', 'pending'],
  ['p2', 'pending'],
  ['p3', 'pending'],
  ['a1', 'approved'],
  ['a2', 'approved'],
  ['s1', 'sent'],
].map(([id, stage]) => ({
  id,
  report_stage: stage,
  delivery_status: stage === 'sent' ? 'sent' : 'draft',
  user_email: `${id}@example.test`,
  last_delivery_error: null,
  created_at: '2026-10-20T03:00:00Z',
}));

const state = vi.hoisted(() => ({
  urls: [] as URL[],
  workspaceTimezone: 'Asia/Ho_Chi_Minh' as string | null,
  summaryFailure: null as 'cap' | 'error' | null,
}));

beforeEach(() => {
  state.urls = [];
  state.workspaceTimezone = 'Asia/Ho_Chi_Minh';
  state.summaryFailure = null;
  vi.stubEnv('SUPABASE_SERVER_URL', 'https://reports-summary.test');
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
      if (state.summaryFailure && url.searchParams.get('select') !== '*') {
        if (state.summaryFailure === 'error')
          return new Response(JSON.stringify({ message: 'boom' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        // Past the 20,000-row guard: the exact count alone trips it.
        return json(fixture, 20_001);
      }
      const stage = url.searchParams.get('report_stage')?.replace('eq.', '');
      const rows = stage
        ? fixture.filter((row) => row.report_stage === stage)
        : fixture;
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

it('reports every stage count on first load while listing only the default pending stage', async () => {
  const response = await GET(
    new Request('https://example.test/reports?stage=pending&cadence=monthly'),
    { params: Promise.resolve({ wsId: 'workspace' }) }
  );
  expect(response.status).toBe(200);
  const body = await response.json();

  // The list and its pagination total stay scoped to the selected stage.
  expect(body.data.map((row: { id: string }) => row.id)).toEqual([
    'p1',
    'p2',
    'p3',
  ]);
  expect(body.total).toBe(3);
  // The summary cards are not: every stage shows its real count.
  expect(body.counts.total).toBe(6);
  expect(body.counts.stages).toMatchObject({
    pending: 3,
    approved: 2,
    sent: 1,
    draft: 0,
  });
  expect(body.counts.pendingReview).toBe(3);
  expect(body.counts.approved).toBe(2);
  expect(body.counts.delivered).toBe(1);
  expect(body.summaryPartial).toBe(false);
});

it.each(['cap', 'error'] as const)(
  'keeps the list when the all-stage summary read fails (%s) and flags partial counts',
  async (failure) => {
    state.summaryFailure = failure;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await GET(
      new Request('https://example.test/reports?stage=pending&cadence=monthly'),
      { params: Promise.resolve({ wsId: 'workspace' }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.map((row: { id: string }) => row.id)).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
    expect(body.total).toBe(3);
    expect(body.summaryPartial).toBe(true);
    // Falls back to the stage-scoped counts; the UI hides the other stages.
    expect(body.counts.stages.pending).toBe(3);
    expect(errors).toHaveBeenCalledTimes(failure === 'error' ? 1 : 0);
    errors.mockRestore();
  }
);

it('does not run or flag a summary read for the All stage view', async () => {
  const response = await GET(new Request('https://example.test/reports'), {
    params: Promise.resolve({ wsId: 'workspace' }),
  });
  const body = await response.json();
  expect(body.summaryPartial).toBe(false);
  expect(body.counts.total).toBe(6);
  expect(reportQueries()).toHaveLength(1);
});

it('keeps counts identical after the user selects another stage', async () => {
  const first = await GET(
    new Request('https://example.test/reports?stage=pending'),
    { params: Promise.resolve({ wsId: 'workspace' }) }
  );
  const clicked = await GET(
    new Request('https://example.test/reports?stage=approved'),
    { params: Promise.resolve({ wsId: 'workspace' }) }
  );
  const firstBody = await first.json();
  const clickedBody = await clicked.json();
  expect(clickedBody.data.map((row: { id: string }) => row.id)).toEqual([
    'a1',
    'a2',
  ]);
  expect(clickedBody.counts).toEqual(firstBody.counts);
});

it('includes reports without a saved period in a cross-month range by GMT+7 creation day', async () => {
  const response = await GET(
    new Request(
      'https://example.test/reports?stage=pending&periodStart=2026-10-01&periodEnd=2026-11-03'
    ),
    { params: Promise.resolve({ wsId: 'workspace' }) }
  );
  expect(response.status).toBe(200);
  const queries = reportQueries();
  expect(queries.length).toBeGreaterThan(0);
  for (const url of queries) {
    // A saved period must overlap 1 Oct – 3 Nov; a report with no saved
    // period (every manually written report) matches by the day it was
    // created, from 1 Oct 00:00 to the end of 3 Nov in Asia/Ho_Chi_Minh.
    expect(url.searchParams.getAll('or')).toContain(
      '(and(period_start.lte.2026-11-03,period_end.gte.2026-10-01),and(period_start.is.null,created_at.gte."2026-09-30T17:00:00.000Z",created_at.lt."2026-11-03T17:00:00.000Z"))'
    );
    expect(url.searchParams.has('period_start')).toBe(false);
    expect(url.searchParams.has('period_end')).toBe(false);
  }
});

it('uses the viewer timezone for the range when the workspace has none', async () => {
  state.workspaceTimezone = 'auto';
  await GET(
    new Request(
      'https://example.test/reports?periodStart=2026-10-01&periodEnd=2026-11-03&timezone=Asia%2FHo_Chi_Minh'
    ),
    { params: Promise.resolve({ wsId: 'workspace' }) }
  );
  const [query] = reportQueries();
  expect(query?.searchParams.getAll('or').join('')).toContain(
    'created_at.gte."2026-09-30T17:00:00.000Z",created_at.lt."2026-11-03T17:00:00.000Z"'
  );
});
