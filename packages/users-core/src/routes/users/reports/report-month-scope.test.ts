import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/user-groups/groups-utils', () => ({
  getUserGroupMembershipsForActor: async () => state.groups,
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

type Row = Record<string, string | null>;
type Stage = 'pending' | 'approved' | 'sent' | 'blocked';

// Synthetic fixture rows; every value is invented for these tests.
const row = (
  id: string,
  stage: Stage,
  createdAt: string,
  {
    period = null,
    deliveredAt = null,
    workspace = 'workspace',
    group = 'group-1',
  }: {
    period?: string | null;
    deliveredAt?: string | null;
    workspace?: string;
    group?: string;
  } = {}
): Row => ({
  id,
  cadence: 'monthly',
  user_ws_id: workspace,
  group_id: group,
  title: `Report ${id}`,
  report_stage: stage,
  delivery_status:
    stage === 'sent' ? 'sent' : stage === 'blocked' ? 'blocked' : 'draft',
  report_approval_status: stage === 'pending' ? 'PENDING' : 'APPROVED',
  generation_status: 'ready',
  delivered_at: deliveredAt,
  user_email: `${id}@example.test`,
  last_delivery_error:
    stage === 'blocked' ? 'Provider accepted the message late.' : null,
  created_at: createdAt,
  period_start: period ? `${period}-01` : null,
  period_end: period ? `${period}-28` : null,
});

// Coverage months, GMT+7: three October reports and one November report.
const unsent = [
  row('oct-saved', 'pending', '2026-11-03T03:00:00Z', { period: '2026-10' }),
  row('oct-written-2-nov', 'pending', '2026-11-02T03:00:00Z'),
  row('oct-written-28-oct', 'approved', '2026-10-28T03:00:00Z'),
  row('nov-written-12-nov', 'pending', '2026-11-12T03:00:00Z'),
];
// Sent reports: the send instant decides the month, never the title or the
// covered period.
const sent = [
  // 30 Sep 23:59:59.999 in Vietnam, for an October report.
  row('sent-sep-for-oct', 'sent', '2026-09-20T03:00:00Z', {
    period: '2026-10',
    deliveredAt: '2026-09-30T16:59:59.999Z',
  }),
  // 1 Oct 00:00 in Vietnam, for a September report.
  row('sent-oct-start', 'sent', '2026-09-20T03:00:00Z', {
    period: '2026-09',
    deliveredAt: '2026-09-30T17:00:00.000Z',
  }),
  // 31 Oct 23:59:59.999 in Vietnam; written in early September.
  row('sent-oct-end', 'sent', '2026-09-05T03:00:00Z', {
    deliveredAt: '2026-10-31T16:59:59.999Z',
  }),
  // 1 Nov 00:00 in Vietnam, for an October report.
  row('sent-nov-start', 'sent', '2026-10-20T03:00:00Z', {
    period: '2026-10',
    deliveredAt: '2026-10-31T17:00:00.000Z',
  }),
  row('sent-undated', 'sent', '2026-10-20T03:00:00Z', { period: '2026-10' }),
  row('sent-other-workspace', 'sent', '2026-10-01T03:00:00Z', {
    deliveredAt: '2026-10-15T03:00:00Z',
    workspace: 'other-workspace',
  }),
  row('sent-other-group', 'sent', '2026-10-01T03:00:00Z', {
    deliveredAt: '2026-10-15T03:00:00Z',
    group: 'group-2',
  }),
];
// Provider accepted, then blocked: a delivered_at without the Sent stage.
const blocked = row('blocked-accepted', 'blocked', '2026-09-20T03:00:00Z', {
  period: '2026-09',
  deliveredAt: '2026-10-15T03:00:00Z',
});
const baseRows = [...unsent, ...sent, blocked];

// Minimal PostgREST filter evaluator: the fake database applies the filters
// the route actually sends, so a wrong predicate selects wrong rows.
function splitTop(input: string) {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === '(') depth++;
    else if (!quoted && char === ')') depth--;
    else if (!quoted && depth === 0 && char === ',') {
      parts.push(input.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, input.slice(start)];
}
const unquote = (value: string) => value.replace(/^"(.*)"$/, '$1');
function compare(left: string, right: string) {
  if (left.includes('T') && right.includes('T'))
    return Date.parse(left) - Date.parse(right);
  return left < right ? -1 : left > right ? 1 : 0;
}
function condition(column: string, op: string, raw: string) {
  const value = unquote(raw);
  return (item: Row) => {
    const cell = item[column];
    const empty = cell === null || cell === undefined;
    if (op === 'is' && value === 'null') return empty;
    if (empty) return false;
    if (op === 'eq') return cell === value;
    if (op === 'neq') return cell !== value;
    if (op === 'in')
      return splitTop(value.slice(1, -1)).map(unquote).includes(cell);
    if (op === 'gte') return compare(cell, value) >= 0;
    if (op === 'gt') return compare(cell, value) > 0;
    if (op === 'lte') return compare(cell, value) <= 0;
    if (op === 'lt') return compare(cell, value) < 0;
    throw new Error(`Unsupported filter ${column}.${op}`);
  };
}
function compile(expression: string): (item: Row) => boolean {
  const group = /^(and|or)\((.*)\)$/s.exec(expression);
  if (group) {
    const parts = splitTop(group[2] ?? '').map(compile);
    return group[1] === 'and'
      ? (item) => parts.every((part) => part(item))
      : (item) => parts.some((part) => part(item));
  }
  const [column = '', op = '', ...rest] = expression.split('.');
  return condition(column, op, rest.join('.'));
}
const IGNORED = new Set(['select', 'order', 'offset', 'limit']);
function selectRows(url: URL, rows: Row[]) {
  const predicates = [...url.searchParams].flatMap(([key, value]) =>
    IGNORED.has(key)
      ? []
      : [key === 'or' ? compile(`or${value}`) : compile(`${key}.${value}`)]
  );
  return rows.filter((item) => predicates.every((matches) => matches(item)));
}

const state = vi.hoisted(() => ({
  urls: [] as URL[],
  groups: ['group-1'],
  rows: [] as Record<string, string | null>[],
  workspaceTimezone: 'Asia/Ho_Chi_Minh' as string | null,
}));

beforeEach(() => {
  state.urls = [];
  state.groups = ['group-1'];
  state.rows = baseRows;
  state.workspaceTimezone = 'Asia/Ho_Chi_Minh';
  vi.stubEnv('SUPABASE_SERVER_URL', 'https://reports-month.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-only-key');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      state.urls.push(url);
      const json = (body: unknown[], offset: number, count: number) =>
        new Response(JSON.stringify(body), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Range': body.length
              ? `${offset}-${offset + body.length - 1}/${count}`
              : `*/${count}`,
          },
        });
      if (url.pathname.endsWith('/workspaces'))
        return new Response(
          JSON.stringify({
            id: 'workspace',
            timezone: state.workspaceTimezone,
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      if (url.pathname.endsWith('/user_report_email_queue'))
        return json([], 0, 0);
      const matched = selectRows(url, state.rows);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? matched.length);
      return json(
        matched.slice(offset, offset + limit),
        offset,
        matched.length
      );
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
const ids = (body: { data: { id: string }[] }) =>
  body.data.map((item) => item.id);

const OCTOBER_COVERAGE =
  'and(period_start.gte.2026-10-01,period_start.lte.2026-10-31),and(period_start.is.null,created_at.gte."2026-10-10T17:00:00.000Z",created_at.lt."2026-11-10T17:00:00.000Z")';
const OCTOBER_SENT =
  'delivered_at.gte."2026-09-30T17:00:00.000Z",delivered_at.lt."2026-10-31T17:00:00.000Z"';
const OCTOBER_FILTER = `(and(report_stage.neq.sent,or(${OCTOBER_COVERAGE})),and(report_stage.eq.sent,${OCTOBER_SENT}))`;

it('selects October by saved period and by estimated month, on the list and the summary read', async () => {
  const response = await get('stage=pending&cadence=monthly&month=2026-10');
  expect(response.status).toBe(200);
  const body = await response.json();
  const queries = reportQueries();
  // List read plus the all-stage summary read, both scoped to October.
  expect(queries).toHaveLength(2);
  for (const url of queries)
    expect(url.searchParams.getAll('or')).toEqual([OCTOBER_FILTER]);
  expect(ids(body)).toEqual(['oct-saved', 'oct-written-2-nov']);
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
  expect(octoberBody.counts.total).toBe(5);
  expect(octoberBody.counts.stages).toMatchObject({
    pending: 2,
    approved: 1,
    sent: 2,
    blocked: 0,
  });
  expect(novemberBody.counts.total).toBe(2);
  expect(novemberBody.counts.stages).toMatchObject({
    pending: 1,
    approved: 0,
    sent: 1,
  });
  expect(novemberBody.data[0]).toMatchObject({
    report_month: '2026-11',
    report_month_estimated: true,
  });
});

it('uses the viewer timezone for the coverage month when the workspace has none', async () => {
  state.workspaceTimezone = 'auto';
  await get('month=2026-10&timezone=Asia%2FHo_Chi_Minh');
  expect(reportQueries()[0]?.searchParams.getAll('or')).toEqual([
    OCTOBER_FILTER,
  ]);
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

describe('Sent reports in a month', () => {
  it('lists only reports actually sent in October, whatever their title or covered period', async () => {
    const body = await (await get('stage=sent&month=2026-10')).json();
    expect(ids(body)).toEqual(['sent-oct-start', 'sent-oct-end']);
    expect(body.total).toBe(2);
    expect(body.counts.stages.sent).toBe(2);
    expect(body.counts.delivered).toBe(2);
    expect(body.undatedSentCount).toBeNull();
    // Row metadata keeps the covered month.
    expect(body.data[0]).toMatchObject({ report_month: '2026-09' });
  });

  it.each([
    ['2026-09', ['sent-sep-for-oct']],
    ['2026-11', ['sent-nov-start']],
  ])('files boundary sends under %s', async (month, expected) => {
    const body = await (await get(`stage=sent&month=${month}`)).json();
    expect(ids(body)).toEqual(expected);
    expect(body.counts.stages.sent).toBe(expected.length);
  });

  it.each([
    ['America/New_York', 'UTC'],
    ['auto', 'Pacific/Kiritimati'],
    [null, undefined],
  ])(
    'counts send months in Vietnam time for workspace %s / viewer %s',
    async (workspace, viewer) => {
      state.workspaceTimezone = workspace;
      const body = await (
        await get(
          `stage=sent&month=2026-10${viewer ? `&timezone=${encodeURIComponent(viewer)}` : ''}`
        )
      ).json();
      expect(ids(body)).toEqual(['sent-oct-start', 'sent-oct-end']);
      for (const url of reportQueries())
        expect(url.searchParams.get('or')).toContain(OCTOBER_SENT);
    }
  );

  it('keeps the Sent card equal to the clicked Sent list from every stage view', async () => {
    const list = await (await get('stage=sent&month=2026-10')).json();
    for (const query of [
      'stage=pending',
      'stage=approved',
      'stage=blocked',
      '',
    ]) {
      const body = await (await get(`${query}&month=2026-10`)).json();
      expect(body.counts.stages.sent).toBe(list.total);
      expect(body.counts).toEqual(list.counts);
      expect(body.undatedSentCount).toBeNull();
    }
    const all = await (await get('month=2026-10')).json();
    expect(ids(all).filter((id: string) => id.startsWith('sent-'))).toEqual(
      ids(list)
    );
    expect(all.total).toBe(all.counts.total);
  });

  it('keeps a provider-accepted blocked report on its covered month', async () => {
    expect(
      ids(await (await get('stage=blocked&month=2026-10')).json())
    ).toEqual([]);
    expect(
      ids(await (await get('stage=blocked&month=2026-09')).json())
    ).toEqual(['blocked-accepted']);
  });

  it('shows Sent reports without a send date only under All months', async () => {
    const body = await (await get('stage=sent')).json();
    expect(ids(body)).toEqual([
      'sent-sep-for-oct',
      'sent-oct-start',
      'sent-oct-end',
      'sent-nov-start',
      'sent-undated',
    ]);
    expect(body.counts.stages.sent).toBe(5);
    expect(body.undatedSentCount).toBeNull();
    for (const url of reportQueries())
      expect(url.searchParams.has('or')).toBe(false);
  });

  it('never lists another workspace or an inaccessible group', async () => {
    for (const query of ['stage=sent&month=2026-10', 'stage=sent', '']) {
      const body = await (await get(query)).json();
      expect(ids(body)).not.toContain('sent-other-workspace');
      expect(ids(body)).not.toContain('sent-other-group');
    }
    for (const url of reportQueries()) {
      expect(url.searchParams.get('user_ws_id')).toBe('eq.workspace');
      expect(url.searchParams.get('group_id')).toBe('in.(group-1)');
    }
  });

  it('keeps one cohort across collection chunks and every UI page', async () => {
    const synthetic = (
      prefix: string,
      count: number,
      deliveredAt: string | null
    ) =>
      Array.from({ length: count }, (_, index) =>
        row(`${prefix}-${index}`, 'sent', '2026-10-05T03:00:00Z', {
          period: '2026-10',
          deliveredAt,
        })
      );
    state.rows = [
      ...baseRows,
      ...synthetic('bulk-oct', 1_200, '2026-10-20T03:00:00Z'),
      ...synthetic('bulk-sep', 1_000, '2026-09-25T03:00:00Z'),
      // Never part of a month read.
      ...synthetic('bulk-undated', 3, null),
    ];
    const seen: string[] = [];
    for (let page = 1; page <= 13; page++) {
      const body = await (
        await get(`stage=sent&month=2026-10&pageSize=100&page=${page}`)
      ).json();
      expect(body.total).toBe(1_202);
      expect(body.counts.stages.sent).toBe(1_202);
      expect(body.undatedSentCount).toBeNull();
      seen.push(...ids(body));
    }
    expect(new Set(seen).size).toBe(1_202);
    expect(seen.some((id) => id.startsWith('bulk-sep'))).toBe(false);
    expect(seen.some((id) => id.includes('undated'))).toBe(false);
    const listOffsets = reportQueries()
      .filter((url) => url.searchParams.get('select') === '*')
      .map((url) => url.searchParams.get('offset'));
    expect(new Set(listOffsets)).toEqual(new Set(['0', '1000']));
    for (const url of reportQueries())
      expect(url.searchParams.getAll('or')).toEqual([OCTOBER_FILTER]);
  });

  it('rejects a month whose dated rows exceed the cap instead of sampling', async () => {
    state.rows = Array.from({ length: 20_001 }, (_, index) =>
      row(`cap-${index}`, 'sent', '2026-10-05T03:00:00Z', {
        deliveredAt: '2026-10-20T03:00:00Z',
      })
    );
    const response = await get('stage=sent&month=2026-10');
    expect(response.status).toBe(422);
  });

  it('leaves undated Sent reports out of a month read before the row cap', async () => {
    const undated = Array.from({ length: 20_001 }, (_, index) =>
      row(`undated-${index}`, 'sent', '2026-10-05T03:00:00Z', {
        period: '2026-10',
      })
    );
    const dated = Array.from({ length: 150 }, (_, index) =>
      row(`dated-${index}`, 'sent', '2026-10-05T03:00:00Z', {
        period: '2026-09',
        deliveredAt: '2026-10-20T03:00:00Z',
      })
    );
    state.rows = [...undated, ...dated, ...unsent];

    const seen: string[] = [];
    for (const page of [1, 2]) {
      const response = await get(
        `stage=sent&month=2026-10&pageSize=100&page=${page}`
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.total).toBe(150);
      expect(body.counts.stages.sent).toBe(150);
      expect(body.counts.total).toBe(153);
      expect(body.summaryPartial).toBe(false);
      expect(body.undatedSentCount).toBeNull();
      seen.push(...ids(body));
    }
    expect(new Set(seen).size).toBe(150);
    expect(seen.every((id) => id.startsWith('dated-'))).toBe(true);

    const allStages = await get('month=2026-10');
    expect(allStages.status).toBe(200);
    const allBody = await allStages.json();
    expect(allBody.total).toBe(153);
    expect(allBody.counts.stages).toMatchObject({ sent: 150, pending: 2 });
    expect(allBody.undatedSentCount).toBeNull();

    // A month with no dated Sent reports reads as empty, not as capped.
    for (const query of ['stage=sent&month=2026-08', 'month=2026-08']) {
      const response = await get(query);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.total).toBe(0);
      expect(body.counts.stages.sent).toBe(0);
      expect(body.undatedSentCount).toBeNull();
    }

    // All months still reads every Sent report and keeps the cap.
    expect((await get('stage=sent')).status).toBe(422);
    expect((await get('')).status).toBe(422);
    for (const url of reportQueries())
      expect(url.searchParams.getAll('or').join()).not.toContain(
        'delivered_at.is.null'
      );
  });

  it('reports the undated Sent count as unknown without any accessible group', async () => {
    state.groups = [];
    const body = await (await get('stage=sent&month=2026-10')).json();
    expect(body.total).toBe(0);
    expect(body.undatedSentCount).toBeNull();
    expect(reportQueries()).toHaveLength(0);
  });
});
