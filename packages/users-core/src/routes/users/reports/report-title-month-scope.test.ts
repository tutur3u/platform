import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

// Synthetic fixture only (no real report, student or workspace data).
// Titles name the month in different ways; send dates deliberately disagree
// with the title month to prove the title, not the send date, decides.
const rows: [string, string, string | null, string | null][] = [
  ['p1', 'pending', 'Báo cáo tháng 9', null],
  ['p2', 'pending', 'Báo cáo tháng 9', null],
  ['p3', 'pending', 'Tháng 10', null],
  ['p4', 'pending', 'Báo cáo định kỳ', null],
  ['a1', 'approved', 'Báo cáo tháng 9/2026', null],
  ['a2', 'approved', 'BÁO CÁO THÁNG 10 NĂM 2026', null],
  ['s1', 'sent', 'Báo cáo tháng 9', '2026-10-21T03:00:00Z'],
  ['s2', 'sent', 'Báo cáo tháng 10', '2026-09-28T03:00:00Z'],
  ['s3', 'sent', null, '2026-10-02T03:00:00Z'],
];
const fixture = rows.map(([id, stage, title, delivered]) => ({
  id,
  title,
  report_stage: stage,
  delivery_status: stage === 'sent' ? 'sent' : 'draft',
  report_approval_status: stage === 'pending' ? 'PENDING' : 'APPROVED',
  generation_status: 'ready',
  delivered_at: delivered,
  user_email: `${id}@example.test`,
  last_delivery_error: null,
  created_at: '2026-10-20T03:00:00Z',
}));

const state = vi.hoisted(() => ({
  summaryFailure: false,
}));

beforeEach(() => {
  state.summaryFailure = false;
  vi.stubEnv('SUPABASE_SERVER_URL', 'https://reports-title-month.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-only-key');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      const json = (body: unknown, count: number) =>
        new Response(JSON.stringify(body), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Range': count ? `0-${count - 1}/${count}` : '*/0',
          },
        });
      if (url.pathname.endsWith('/workspaces'))
        return json({ id: 'workspace', timezone: 'Asia/Ho_Chi_Minh' }, 1);
      if (url.pathname.endsWith('/user_report_email_queue')) return json([], 0);
      if (state.summaryFailure && url.searchParams.get('select') !== '*')
        return json(fixture, 20_001);
      const stage = url.searchParams.get('report_stage')?.replace('eq.', '');
      const data = stage
        ? fixture.filter((row) => row.report_stage === stage)
        : fixture;
      return json(data, data.length);
    })
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function read(query: string) {
  const response = await GET(
    new Request(`https://example.test/reports?${query}`),
    { params: Promise.resolve({ wsId: 'workspace' }) }
  );
  return { status: response.status, body: await response.json() };
}
const ids = (body: { data: { id: string }[] }) => body.data.map((r) => r.id);

describe('month found in the report title', () => {
  it('lists every month found in the titles with a count, over every stage, on first load', async () => {
    const { status, body } = await read('stage=pending&cadence=monthly');
    expect(status).toBe(200);
    expect(body.titleMonths).toEqual([
      { key: '2026-10', count: 1 },
      { key: '2026-09', count: 1 },
      { key: '10', count: 2 },
      { key: '09', count: 3 },
      { key: 'none', count: 2 },
    ]);
    // Counts add up to the underlying total, which the cards also show.
    expect(
      body.titleMonths.reduce(
        (sum: number, m: { count: number }) => sum + m.count,
        0
      )
    ).toBe(fixture.length);
    expect(body.counts.total).toBe(fixture.length);
    expect(body.summaryPartial).toBe(false);
    // The list stays scoped to the default stage.
    expect(ids(body)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('counts a "Báo cáo tháng 9" title exactly and filters the list by it', async () => {
    const { body } = await read('stage=pending&titleMonth=09');
    expect(ids(body)).toEqual(['p1', 'p2']);
    expect(body.total).toBe(2);
    // The picker keeps every month, with unchanged counts.
    expect(
      body.titleMonths.find((m: { key: string }) => m.key === '09')
    ).toEqual({
      key: '09',
      count: 3,
    });
    expect(body.titleMonths).toHaveLength(5);
    // Stage cards follow the selected month across every stage.
    expect(body.counts.total).toBe(3);
    expect(body.counts.stages).toMatchObject({
      pending: 2,
      sent: 1,
      approved: 0,
    });
  });

  it('files Sent reports by the month in the title, not by the send date', async () => {
    const nine = await read('stage=sent&titleMonth=09');
    expect(ids(nine.body)).toEqual(['s1']);
    const ten = await read('stage=sent&titleMonth=10');
    expect(ids(ten.body)).toEqual(['s2']);
    const none = await read('stage=sent&titleMonth=none');
    expect(ids(none.body)).toEqual(['s3']);
  });

  it('keeps year variants apart and shows titles with no month under none', async () => {
    expect(ids((await read('titleMonth=2026-09')).body)).toEqual(['a1']);
    expect(ids((await read('titleMonth=2026-10')).body)).toEqual(['a2']);
    const none = await read('titleMonth=none');
    expect(ids(none.body).sort()).toEqual(['p4', 's3']);
    expect(none.body.total).toBe(2);
  });

  it('lists everything, with the same totals, when no month is chosen', async () => {
    const { body } = await read('');
    expect(body.total).toBe(fixture.length);
    expect(body.counts.total).toBe(fixture.length);
  });

  it('marks counts partial and offers only stage-scoped months when the all-stage read fails', async () => {
    state.summaryFailure = true;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { status, body } = await read('stage=pending');
    expect(status).toBe(200);
    expect(body.summaryPartial).toBe(true);
    expect(ids(body)).toEqual(['p1', 'p2', 'p3', 'p4']);
    errors.mockRestore();
  });

  it.each(['13', '9', '2026-13', 'all', 'tháng 9'])(
    'rejects an invalid titleMonth %j',
    async (value) => {
      const { status } = await read(`titleMonth=${encodeURIComponent(value)}`);
      expect(status).toBe(400);
    }
  );
});
