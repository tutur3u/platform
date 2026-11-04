import { beforeEach, describe, expect, it, vi } from 'vitest';

// Synthetic workspaces, classes and reports only. The database functions
// (request_held_periodic_report_delivery, request_periodic_report_delivery and
// skip_held_periodic_reports) are in-memory fakes: nothing here can reach a
// real database, queue or email provider.
const WS = '00000000-0000-4000-8000-00000000a001';
const OTHER_WS = '00000000-0000-4000-8000-00000000b001';
const CLASS_A = '00000000-0000-4000-8000-00000000a101';
const CLASS_B = '00000000-0000-4000-8000-00000000a102';
const OTHER_CLASS = '00000000-0000-4000-8000-00000000b101';
const ACTOR = '00000000-0000-4000-8000-00000000a901';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  secret: vi.fn(),
  actor: vi.fn(),
  memberships: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifySecret: mocks.secret,
}));
vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: vi.fn(),
}));
vi.mock('../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.permissions,
}));
vi.mock('../../../lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => WS,
  resolveRequestActorAuthUid: mocks.actor,
}));
vi.mock('../../../lib/user-groups/groups-utils', () => ({
  getUserGroupMembershipsForActor: mocks.memberships,
}));

import { GET, POST } from './held/route';
import { PUT as putSchedules } from './schedules/route';

type Row = Record<string, unknown>;
interface Store {
  workspaces: Row[];
  view: Row[];
  queue: Row[];
  audit: Row[];
  rpcCalls: Row[];
  tables: string[];
  failAuditInsert?: boolean;
  // Rejects matching audit updates, as a database outage would.
  failAuditUpdate?: (payload: Row) => boolean;
  // Runs before each database function call: another admin acting meanwhile.
  beforeRpc?: (name: string, args: Row) => void;
  // Fails the held send of this report id.
  failSendOf?: string;
}
let store: Store;

function report(id: string, change: Row = {}): Row {
  return {
    id,
    user_ws_id: WS,
    group_ws_id: WS,
    group_id: CLASS_A,
    cadence: 'monthly',
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    created_at: `2026-09-30T00:00:${id.slice(-2)}Z`,
    delivery_status: 'draft',
    delivered_at: null,
    generation_status: 'ready',
    last_delivery_error: null,
    report_approval_status: 'APPROVED',
    report_stage: 'approved',
    user_email: `learner-${id.slice(-2)}@example.com`,
    ...change,
  };
}

function fakeQuery(table: string) {
  store.tables.push(table);
  const filters: Array<(row: Row) => boolean> = [];
  let op: 'select' | 'insert' | 'update' = 'select';
  let payload: Row = {};
  let single = false;
  let range: [number, number] | null = null;
  const rowsFor = () =>
    table === 'external_user_monthly_reports_workspace_view' ||
    table === 'external_user_monthly_reports'
      ? store.view
      : table === 'user_report_email_queue'
        ? store.queue
        : table === 'periodic_report_held_actions'
          ? store.audit
          : table === 'workspaces'
            ? store.workspaces
            : [];
  const run = () => {
    if (op === 'insert') {
      if (table === 'periodic_report_held_actions') {
        if (store.failAuditInsert)
          return { data: null, error: { code: 'XX000', message: 'down' } };
        if (
          store.audit.some(
            (row) =>
              row.ws_id === payload.ws_id &&
              row.idempotency_key === payload.idempotency_key
          )
        )
          return { data: null, error: { code: '23505', message: 'dup' } };
        const row = { id: `audit-${store.audit.length + 1}`, ...payload };
        store.audit.push(row);
        return { data: single ? row : [row], error: null };
      }
      return { data: null, error: { message: `unexpected insert ${table}` } };
    }
    const matched = rowsFor().filter((row) => filters.every((f) => f(row)));
    if (
      op === 'update' &&
      table === 'periodic_report_held_actions' &&
      store.failAuditUpdate?.(payload)
    )
      return { data: null, error: { code: 'XX000', message: 'audit down' } };
    if (op === 'update') {
      for (const row of matched) {
        Object.assign(row, payload);
        if (
          table === 'external_user_monthly_reports' &&
          payload.delivery_status
        )
          row.report_stage = 'skipped';
      }
      return { data: matched.map((row) => ({ id: row.id })), error: null };
    }
    const page = range ? matched.slice(range[0], range[1] + 1) : matched;
    return single
      ? { data: page[0] ?? null, error: null }
      : { data: page, count: matched.length, error: null };
  };
  const query: Record<string, unknown> = {
    select: () => query,
    order: () => query,
    range: (from: number, to: number) => {
      range = [from, to];
      return query;
    },
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return query;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return query;
    },
    is: (column: string, value: unknown) => {
      filters.push((row) => (row[column] ?? null) === value);
      return query;
    },
    gte: (column: string, value: string) => {
      filters.push((row) => String(row[column]) >= value);
      return query;
    },
    lte: (column: string, value: string) => {
      filters.push((row) => String(row[column]) <= value);
      return query;
    },
    // The worklist's PostgREST period filter: and(...),and(...).
    or: (expression: string) => {
      const groups = expression
        .replace(/^and\(|\)$/g, '')
        .split('),and(')
        .map((group) => group.split(','));
      const holds = (row: Row, condition: string) => {
        const [column = '', op, ...rest] = condition.split('.');
        const value = rest.join('.').replace(/^"|"$/g, '');
        const cell = row[column];
        if (op === 'is') return (cell ?? null) === null;
        if (cell === null || cell === undefined) return false;
        const left =
          column === 'created_at' ? Date.parse(String(cell)) : String(cell);
        const right = column === 'created_at' ? Date.parse(value) : value;
        if (op === 'lte') return left <= right;
        if (op === 'gte') return left >= right;
        if (op === 'lt') return left < right;
        throw new Error(`unexpected filter ${condition}`);
      };
      filters.push((row) =>
        groups.some((group) =>
          group.every((condition) => holds(row, condition))
        )
      );
      return query;
    },
    insert: (value: Row) => {
      op = 'insert';
      payload = value;
      return query;
    },
    update: (value: Row) => {
      op = 'update';
      payload = value;
      return query;
    },
    upsert: async (value: Row) => {
      store.tables.push(`${table}:upsert:${String(value.id)}`);
      return { error: null };
    },
    single: () => {
      single = true;
      return query;
    },
    maybeSingle: () => {
      single = true;
      return query;
    },
    // biome-ignore lint/suspicious/noThenProperty: thenable query builder fake
    then: (resolve: (value: unknown) => unknown, reject: () => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return query;
}

const inWorkspace = (row: Row, wsId: unknown) =>
  row.user_ws_id === wsId && row.group_ws_id === wsId;
const stillHeld = (row: Row) =>
  row.delivery_status === 'draft' &&
  row.report_approval_status === 'APPROVED' &&
  (row.delivered_at ?? null) === null &&
  !store.queue.some(
    (entry) => entry.report_id === row.id && entry.delivery_kind === 'send'
  );

// The database functions, simulated as the migrations define them.
async function fakeRpc(name: string, args: Row) {
  store.beforeRpc?.(name, args);
  if (name === 'skip_held_periodic_reports') {
    store.rpcCalls.push({ name, ...args });
    const ids = args.p_report_ids as string[];
    const skipped = store.view.filter(
      (row) =>
        ids.includes(row.id as string) &&
        inWorkspace(row, args.p_ws_id) &&
        stillHeld(row)
    );
    for (const row of skipped) {
      row.delivery_status = 'skipped';
      row.report_stage = 'skipped';
    }
    return { data: skipped.map((row) => row.id), error: null };
  }
  if (name === 'request_held_periodic_report_delivery') {
    store.rpcCalls.push({ name, ...args });
    if (args.p_report_id === store.failSendOf)
      return { data: null, error: { code: '57014', message: 'timeout' } };
    // Held check and enqueue under one row lock.
    const target = store.view.find(
      (row) => row.id === args.p_report_id && inWorkspace(row, args.p_ws_id)
    );
    if (!target) return { data: { code: 404 }, error: null };
    if (!stillHeld(target))
      return {
        data: { code: 409, message: 'This report is no longer held.' },
        error: null,
      };
    return requestDelivery({
      p_report_id: args.p_report_id,
      p_ws_id: args.p_ws_id,
      p_action: 'send',
      p_delivery_enabled: args.p_delivery_enabled,
    });
  }
  if (name !== 'request_periodic_report_delivery')
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  return requestDelivery(args);
}

// The existing manual pipeline's guards: one queue row per report and a 409
// only for anything already queued, processing or sent. Like the real
// function, it may send a skipped report: a manual send after a skip is
// allowed, so the hold has to be checked by the held function.
function requestDelivery(args: Row) {
  store.rpcCalls.push({ name: 'request_periodic_report_delivery', ...args });
  if (args.p_action === 'probe')
    return {
      data: { code: 400, message: 'Invalid delivery action.' },
      error: null,
    };
  const target = store.view.find(
    (row) => row.id === args.p_report_id && row.user_ws_id === args.p_ws_id
  );
  if (!target) return { data: { code: 404 }, error: null };
  if (
    ['queued', 'sent', 'processing'].includes(String(target.delivery_status)) ||
    target.report_approval_status !== 'APPROVED'
  )
    return {
      data: { code: 409, message: 'Delivery is already active or sent.' },
      error: null,
    };
  target.delivery_status = 'queued';
  target.report_stage = 'queued';
  store.queue.push({
    report_id: target.id,
    ws_id: args.p_ws_id,
    delivery_kind: 'send',
    status: 'queued',
  });
  return { data: { code: 200, queued: true, status: 'queued' }, error: null };
}

const enqueues = () =>
  store.rpcCalls.filter(
    (call) =>
      call.name === 'request_periodic_report_delivery' &&
      call.p_action !== 'probe'
  );

function allow(except: string[] = []) {
  mocks.permissions.mockResolvedValue({
    wsId: WS,
    containsPermission: (name: string) => !except.includes(name),
  });
}

const context = { params: Promise.resolve({ wsId: 'personal' }) };
const scopeQuery =
  '?cadence=monthly&periodStart=2026-09-01&periodEnd=2026-09-30';
const getHeld = (query = scopeQuery) =>
  GET(new Request(`https://example.com/held${query}`), context);
const postHeld = (body: Row) =>
  POST(
    new Request('https://example.com/held', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    context
  );
const sendBody = (change: Row = {}) => ({
  action: 'send',
  cadence: 'monthly',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  expectedCount: 2,
  idempotencyKey: '00000000-0000-4000-8000-0000000000c1',
  ...change,
});

beforeEach(() => {
  vi.clearAllMocks();
  store = {
    view: [
      report('r-01'),
      report('r-02', { group_id: CLASS_B }),
      // Not held: already queued, sent, pending, failed, or a recorded blocker.
      report('r-03', { delivery_status: 'queued', report_stage: 'queued' }),
      report('r-04', { delivery_status: 'sent', report_stage: 'sent' }),
      report('r-05', {
        report_approval_status: 'PENDING',
        report_stage: 'pending',
      }),
      report('r-06', {
        delivery_status: 'failed',
        report_stage: 'failed',
        last_delivery_error: 'Provider rejected',
      }),
      report('r-07', { user_email: null }),
      // Another period and another cadence.
      report('r-08', { period_start: '2026-10-01', period_end: '2026-10-31' }),
      report('r-09', { cadence: 'weekly' }),
      // Another workspace with the same period.
      report('r-10', {
        user_ws_id: OTHER_WS,
        group_ws_id: OTHER_WS,
        group_id: OTHER_CLASS,
      }),
      // Mismatched tenancy: a subject or a class from another workspace.
      report('r-11', { user_ws_id: OTHER_WS }),
      report('r-12', { group_ws_id: OTHER_WS }),
    ],
    workspaces: [],
    queue: [],
    audit: [],
    rpcCalls: [],
    tables: [],
  };
  allow();
  mocks.actor.mockResolvedValue(ACTOR);
  mocks.memberships.mockResolvedValue([CLASS_A]);
  mocks.secret.mockResolvedValue(true);
  mocks.admin.mockResolvedValue({
    from: (table: string) => fakeQuery(table),
    schema: () => ({ from: (table: string) => fakeQuery(table), rpc: fakeRpc }),
  });
});

describe('held approved-never-sent reports: preview', () => {
  it('counts only held reports in this workspace, period and cadence', async () => {
    const response = await getHeld();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ count: 2, sendLimit: 100 });
  });
  it('scopes by class', async () => {
    const body = await (
      await getHeld(`${scopeQuery}&groupId=${CLASS_B}`)
    ).json();
    expect(body.count).toBe(1);
  });
  it('excludes a report that already has a requested send', async () => {
    store.queue.push({
      report_id: 'r-01',
      ws_id: WS,
      delivery_kind: 'send',
      status: 'cancelled',
    });
    expect((await (await getHeld()).json()).count).toBe(1);
  });
  it('matches the worklist: a report without a saved period counts by its creation day in the workspace timezone', async () => {
    store.workspaces.push({ id: WS, timezone: 'Asia/Ho_Chi_Minh' });
    store.view.push(
      // 15 Sep in Ho Chi Minh: September.
      report('r-13', {
        period_start: null,
        period_end: null,
        created_at: '2026-09-15T03:00:00Z',
      }),
      // 30 Sep 18:00 UTC is already 1 Oct in Ho Chi Minh: October.
      report('r-14', {
        period_start: null,
        period_end: null,
        created_at: '2026-09-30T18:00:00Z',
      })
    );
    expect((await (await getHeld()).json()).count).toBe(3);
    const response = await postHeld(
      sendBody({ action: 'skip', expectedCount: 3 })
    );
    expect(response.status).toBe(200);
    expect(store.audit[0]?.report_ids).toEqual(['r-01', 'r-02', 'r-13']);
    expect(store.view.find((row) => row.id === 'r-14')?.delivery_status).toBe(
      'draft'
    );
  });
  it('gives a member without classes nothing to act on', async () => {
    allow(['manage_users']);
    mocks.memberships.mockResolvedValue([]);
    expect((await (await getHeld()).json()).count).toBe(0);
    expect((await postHeld(sendBody())).status).toBe(409);
    expect(enqueues()).toHaveLength(0);
    expect(store.audit).toHaveLength(0);
  });
  it('requires a period or a class', async () => {
    expect((await getHeld('?cadence=monthly')).status).toBe(400);
  });
  it('never changes a report or enqueues anything', async () => {
    await getHeld();
    expect(enqueues()).toHaveLength(0);
    expect(store.audit).toHaveLength(0);
    expect(
      store.view.filter((row) => row.delivery_status === 'draft')
    ).toHaveLength(9);
  });
});

describe('held approved-never-sent reports: permission', () => {
  it.each(['manage_user_report_automation', 'send_user_group_report_emails'])(
    'denies preview and action without %s',
    async (missing) => {
      allow([missing]);
      expect((await getHeld()).status).toBe(403);
      expect((await postHeld(sendBody())).status).toBe(403);
      expect((await postHeld(sendBody({ action: 'skip' }))).status).toBe(403);
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(enqueues()).toHaveLength(0);
      expect(store.audit).toHaveLength(0);
    }
  );
  it('denies an action without a resolvable actor', async () => {
    mocks.actor.mockResolvedValue(null);
    expect((await postHeld(sendBody())).status).toBe(403);
    expect(enqueues()).toHaveLength(0);
  });
  it('limits an admin without manage_users to their own classes', async () => {
    allow(['manage_users']);
    expect((await (await getHeld()).json()).count).toBe(1);
    expect((await getHeld(`${scopeQuery}&groupId=${CLASS_B}`)).status).toBe(
      404
    );
    expect(
      (await postHeld(sendBody({ groupId: CLASS_B, expectedCount: 1 }))).status
    ).toBe(404);
    expect(enqueues()).toHaveLength(0);
  });
});

describe('held approved-never-sent reports: server-side scope', () => {
  it('rejects client-supplied report ids instead of widening the set', async () => {
    const response = await postHeld(sendBody({ reportIds: ['r-03', 'r-10'] }));
    expect(response.status).toBe(400);
    expect(enqueues()).toHaveLength(0);
  });
  it('never touches another workspace, even when its class is named', async () => {
    expect(
      (await (await getHeld(`${scopeQuery}&groupId=${OTHER_CLASS}`)).json())
        .count
    ).toBe(0);
    const response = await postHeld(
      sendBody({ groupId: OTHER_CLASS, expectedCount: 1 })
    );
    expect(response.status).toBe(409);
    expect(enqueues()).toHaveLength(0);
    expect(store.view.find((row) => row.id === 'r-10')?.delivery_status).toBe(
      'draft'
    );
  });
  it('rejects a stale confirmation count without acting', async () => {
    const response = await postHeld(sendBody({ expectedCount: 3 }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'HELD_SCOPE_CHANGED',
      count: 2,
    });
    expect(enqueues()).toHaveLength(0);
    expect(store.audit).toHaveLength(0);
  });
});

describe('held approved-never-sent reports: send now', () => {
  it('enqueues only the held reports through the existing pipeline and audits it', async () => {
    const response = await postHeld(sendBody());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      action: 'send',
      requested: 2,
      affected: 2,
      replayed: false,
    });
    expect(enqueues().map((call) => call.p_report_id)).toEqual([
      'r-01',
      'r-02',
    ]);
    for (const call of enqueues()) {
      expect(call).toMatchObject({
        p_ws_id: WS,
        p_action: 'send',
        p_delivery_enabled: true,
      });
    }
    expect(store.audit).toEqual([
      expect.objectContaining({
        ws_id: WS,
        actor_user_id: ACTOR,
        action: 'send',
        cadence: 'monthly',
        period_start: '2026-09-01',
        period_end: '2026-09-30',
        group_id: null,
        requested_count: 2,
        affected_count: 2,
        report_ids: ['r-01', 'r-02'],
        status: 'completed',
        completed_at: expect.any(String),
      }),
    ]);
    // Non-held rows are exactly as they were.
    expect(store.view.find((row) => row.id === 'r-05')?.delivery_status).toBe(
      'draft'
    );
    expect(store.view.find((row) => row.id === 'r-08')?.delivery_status).toBe(
      'draft'
    );
  });
  it('is idempotent: a re-click replays the recorded result and sends nothing more', async () => {
    expect((await postHeld(sendBody())).status).toBe(200);
    const replay = await postHeld(sendBody());
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true, affected: 2 });
    expect(enqueues()).toHaveLength(2);
    expect(store.audit).toHaveLength(1);
    // A fresh confirmation for the same scope finds nothing left to send.
    const again = await postHeld(
      sendBody({ idempotencyKey: '00000000-0000-4000-8000-0000000000c2' })
    );
    expect(again.status).toBe(409);
    expect(enqueues()).toHaveLength(2);
  });
  it('refuses to reuse a confirmation key for a different action', async () => {
    await postHeld(sendBody());
    const response = await postHeld(sendBody({ action: 'skip' }));
    expect(response.status).toBe(409);
    expect(store.view.find((row) => row.id === 'r-01')?.delivery_status).toBe(
      'queued'
    );
  });
  it('does not act or audit while either email gate is off', async () => {
    mocks.secret.mockImplementation(
      async ({ name }: { name: string }) =>
        name !== 'ENABLE_REPORT_EMAIL_SENDING'
    );
    const response = await postHeld(sendBody());
    expect(response.status).toBe(409);
    expect(enqueues()).toHaveLength(0);
    expect(store.audit).toHaveLength(0);
    expect(
      store.view.filter((row) => row.report_stage === 'approved')
    ).toHaveLength(8);
  });
  it('keeps the existing batch cap', async () => {
    store.view = Array.from({ length: 101 }, (_, index) =>
      report(`r-${String(index).padStart(3, '0')}`)
    );
    const response = await postHeld(sendBody({ expectedCount: 101 }));
    expect(response.status).toBe(422);
    expect(enqueues()).toHaveLength(0);
  });
  it('never sends without an audit row', async () => {
    store.failAuditInsert = true;
    expect((await postHeld(sendBody())).status).toBe(500);
    expect(enqueues()).toHaveLength(0);
  });
});

describe('held approved-never-sent reports: Skip vs Send now race', () => {
  const skipMeanwhile = (reportId: string) => {
    const row = store.view.find((entry) => entry.id === reportId);
    if (row && row.delivery_status === 'draft') {
      row.delivery_status = 'skipped';
      row.report_stage = 'skipped';
    }
  };
  it('does not queue a report another admin skipped during the batch', async () => {
    // Admin B skips r-02 while admin A's Send now is on r-01.
    store.beforeRpc = (name, args) => {
      if (
        name === 'request_held_periodic_report_delivery' &&
        args.p_report_id === 'r-01'
      )
        skipMeanwhile('r-02');
    };
    const response = await postHeld(sendBody());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ requested: 2, affected: 1 });
    expect(store.queue.map((entry) => entry.report_id)).toEqual(['r-01']);
    expect(enqueues().map((call) => call.p_report_id)).toEqual(['r-01']);
    expect(store.view.find((row) => row.id === 'r-02')?.delivery_status).toBe(
      'skipped'
    );
    expect(store.audit[0]).toMatchObject({
      status: 'completed',
      affected_count: 1,
      report_ids: ['r-01'],
    });
  });
  it('does not queue a report skipped after the count but before its send', async () => {
    store.beforeRpc = (name, args) => {
      if (
        name === 'request_held_periodic_report_delivery' &&
        args.p_report_id === 'r-01'
      )
        skipMeanwhile('r-01');
    };
    const response = await postHeld(sendBody());
    expect(await response.json()).toMatchObject({ requested: 2, affected: 1 });
    expect(store.queue.map((entry) => entry.report_id)).toEqual(['r-02']);
    expect(store.view.find((row) => row.id === 'r-01')?.delivery_status).toBe(
      'skipped'
    );
  });
  it('sends through the held function only, scoped to the workspace', async () => {
    await postHeld(sendBody());
    expect(
      store.rpcCalls
        .filter((call) => call.name === 'request_held_periodic_report_delivery')
        .map((call) => [call.p_report_id, call.p_ws_id])
    ).toEqual([
      ['r-01', WS],
      ['r-02', WS],
    ]);
  });
});

describe('held approved-never-sent reports: skip', () => {
  it('moves held reports out of the group without sending, and records them', async () => {
    const response = await postHeld(sendBody({ action: 'skip' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      action: 'skip',
      affected: 2,
    });
    expect(enqueues()).toHaveLength(0);
    expect(store.view.find((row) => row.id === 'r-01')).toMatchObject({
      delivery_status: 'skipped',
      last_delivery_error: null,
    });
    expect(store.audit).toEqual([
      expect.objectContaining({
        action: 'skip',
        actor_user_id: ACTOR,
        ws_id: WS,
        affected_count: 2,
        report_ids: ['r-01', 'r-02'],
        status: 'completed',
      }),
    ]);
    expect((await (await getHeld()).json()).count).toBe(0);
    // Not-held reports in the same scope are untouched.
    expect(store.view.find((row) => row.id === 'r-05')?.delivery_status).toBe(
      'draft'
    );
    expect(store.view.find((row) => row.id === 'r-07')?.delivery_status).toBe(
      'draft'
    );
  });
  it('skips through the workspace-scoped held function', async () => {
    await postHeld(sendBody({ action: 'skip' }));
    expect(store.rpcCalls).toEqual([
      expect.objectContaining({
        name: 'skip_held_periodic_reports',
        p_ws_id: WS,
        p_report_ids: ['r-01', 'r-02'],
      }),
    ]);
    // No direct table write that could skip outside the workspace.
    expect(store.tables).not.toContain('external_user_monthly_reports');
  });
  it('leaves a report that another admin queued meanwhile', async () => {
    store.beforeRpc = (name) => {
      if (name !== 'skip_held_periodic_reports') return;
      const row = store.view.find((entry) => entry.id === 'r-02');
      if (row) row.delivery_status = 'queued';
    };
    const response = await postHeld(sendBody({ action: 'skip' }));
    expect(await response.json()).toMatchObject({ affected: 1 });
    expect(store.view.find((row) => row.id === 'r-02')?.delivery_status).toBe(
      'queued'
    );
    expect(store.audit[0]?.report_ids).toEqual(['r-01']);
  });
  it('skips per class', async () => {
    await postHeld(
      sendBody({ action: 'skip', groupId: CLASS_B, expectedCount: 1 })
    );
    expect(store.view.find((row) => row.id === 'r-01')?.delivery_status).toBe(
      'draft'
    );
    expect(store.view.find((row) => row.id === 'r-02')?.delivery_status).toBe(
      'skipped'
    );
    expect(store.audit[0]).toMatchObject({
      group_id: CLASS_B,
      affected_count: 1,
    });
  });
});

describe('held approved-never-sent reports: audit robustness', () => {
  const manyHeld = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      report(`r-${String(index + 1).padStart(3, '0')}`)
    );
  it('records queued report ids while a long Send now runs', async () => {
    store.view = manyHeld(25);
    // Report 23 times out and the 'failed' write is lost too: the row keeps
    // the progress recorded so far instead of empty report ids.
    store.failSendOf = 'r-023';
    store.failAuditUpdate = (payload) => payload.status === 'failed';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await postHeld(sendBody({ expectedCount: 25 }));
      expect(response.status).toBe(500);
      expect(store.audit[0]).toMatchObject({
        status: 'started',
        affected_count: 20,
        report_ids: manyHeld(20).map((row) => row.id),
      });
      expect(store.queue).toHaveLength(22);
    } finally {
      errors.mockRestore();
    }
  });
  it('logs a failed audit failure record with the attempted ids', async () => {
    store.failSendOf = 'r-02';
    store.failAuditUpdate = (payload) => payload.status === 'failed';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await postHeld(sendBody())).status).toBe(500);
      expect(errors).toHaveBeenCalledWith(
        'Held periodic report audit failure record failed',
        expect.objectContaining({
          auditId: 'audit-1',
          attemptedReportIds: ['r-01', 'r-02'],
          affectedReportIds: ['r-01'],
          error: expect.objectContaining({ message: 'audit down' }),
        })
      );
    } finally {
      errors.mockRestore();
    }
  });
  it('marks the audit failed with the queued ids when the failure record works', async () => {
    store.failSendOf = 'r-02';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await postHeld(sendBody())).status).toBe(500);
      expect(store.audit[0]).toMatchObject({
        status: 'failed',
        affected_count: 1,
        report_ids: ['r-01'],
      });
      expect(errors).not.toHaveBeenCalledWith(
        'Held periodic report audit failure record failed',
        expect.anything()
      );
    } finally {
      errors.mockRestore();
    }
  });
});

describe('the hold: enabling auto-send never enqueues held reports', () => {
  it('only saves the setting; no held report is requested or changed', async () => {
    const before = JSON.stringify(store.view);
    const response = await putSchedules(
      new Request('https://example.com/schedules', {
        method: 'PUT',
        body: JSON.stringify({ autoSendAfterApproval: true }),
      }),
      context
    );
    expect(response.status).toBe(200);
    // The readiness probe targets the nil report with an invalid action.
    expect(enqueues()).toHaveLength(0);
    expect(store.rpcCalls).toEqual([
      expect.objectContaining({
        p_report_id: '00000000-0000-0000-0000-000000000000',
        p_action: 'probe',
      }),
    ]);
    expect(store.tables).toEqual([
      'workspace_configs',
      'workspace_configs:upsert:AUTO_SEND_APPROVED_REPORTS',
    ]);
    expect(JSON.stringify(store.view)).toBe(before);
    expect(store.queue).toHaveLength(0);
    expect((await (await getHeld()).json()).count).toBe(2);
  });
});
