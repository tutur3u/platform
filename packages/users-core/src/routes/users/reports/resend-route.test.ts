import { beforeEach, describe, expect, it, vi } from 'vitest';

// Synthetic workspaces, classes and reports only. The enqueue boundary
// (request_periodic_report_delivery) and the shared rate-limit budget are
// in-memory fakes: nothing here can reach a real database, queue or email
// provider, and nothing can send.
const WS = '00000000-0000-4000-8000-00000000a001';
const OTHER_WS = '00000000-0000-4000-8000-00000000b001';
const CLASS_A = '00000000-0000-4000-8000-00000000a101';
const CLASS_B = '00000000-0000-4000-8000-00000000a102';
const OTHER_CLASS = '00000000-0000-4000-8000-00000000b101';
const ACTOR = '00000000-0000-4000-8000-00000000a901';
const NOW = Date.parse('2026-11-04T10:00:00Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const id = (suffix: string) => `00000000-0000-4000-8000-0000000c00${suffix}`;

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  secret: vi.fn(),
  actor: vi.fn(),
  memberships: vi.fn(),
  reserve: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/storage-core/security-budget', () => ({
  reserveSecurityBudget: mocks.reserve,
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

import { GET, POST } from './resend/route';
import {
  RESEND_ACTIONS_PER_WINDOW,
  RESEND_MAX_REPORTS_PER_ACTION,
  RESEND_REPORTS_PER_HOUR,
  type ResendQueue,
  type ResendReport,
  resendReason,
  STUCK_QUEUED_AFTER_MINUTES,
} from './resend-reports';

type Row = Record<string, unknown>;
interface Store {
  workspaces: Row[];
  view: Row[];
  queue: Row[];
  audit: Row[];
  rpcCalls: Row[];
  budget: Map<string, number>;
  failAuditInsert?: { code: string };
  beforeRpc?: (args: Row) => void;
}
let store: Store;

function report(suffix: string, change: Row = {}): Row {
  return {
    id: id(suffix),
    user_ws_id: WS,
    group_ws_id: WS,
    group_id: CLASS_A,
    cadence: 'monthly',
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    created_at: `2026-09-30T00:00:${suffix}Z`,
    delivery_status: 'draft',
    delivered_at: null,
    delivery_requested_at: null,
    generation_status: 'ready',
    last_delivery_error: null,
    report_approval_status: 'APPROVED',
    report_stage: 'approved',
    user_email: `learner-${suffix}@example.com`,
    ...change,
  };
}
function queueRow(suffix: string, change: Row = {}): Row {
  return {
    report_id: id(suffix),
    ws_id: WS,
    status: 'queued',
    delivery_kind: 'send',
    sent_at: null,
    last_error: null,
    next_attempt_at: ago(120),
    locked_at: null,
    provider_message_id: null,
    ...change,
  };
}

function fakeQuery(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let op: 'select' | 'insert' | 'update' = 'select';
  let payload: Row = {};
  let single = false;
  let range: [number, number] | null = null;
  const rowsFor = () =>
    table === 'external_user_monthly_reports_workspace_view'
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
      if (table !== 'periodic_report_held_actions')
        return { data: null, error: { message: `unexpected insert ${table}` } };
      if (store.failAuditInsert)
        return { data: null, error: store.failAuditInsert };
      if (
        store.audit.some(
          (row) =>
            row.ws_id === payload.ws_id &&
            row.idempotency_key === payload.idempotency_key
        )
      )
        return { data: null, error: { code: '23505', message: 'dup' } };
      const row = {
        id: `audit-${store.audit.length + 1}`,
        affected_count: 0,
        report_ids: [],
        ...payload,
      };
      store.audit.push(row);
      return { data: single ? row : [row], error: null };
    }
    const matched = rowsFor().filter((row) => filters.every((f) => f(row)));
    if (op === 'update') {
      if (table !== 'periodic_report_held_actions')
        return { data: null, error: { message: `unexpected update ${table}` } };
      for (const row of matched) Object.assign(row, payload);
      return { data: matched, error: null };
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

const UNKNOWN =
  'Email delivery outcome is unknown. Check provider logs before retrying.';
// private.request_periodic_report_resend, simulated: under the row lock it
// re-checks the confirmed state, refuses anything possibly sent, re-checks a
// stuck row, cancels it and delegates to request_periodic_report_delivery's
// guards (409 for processing, sent, still queued or unknown outcome). A
// refusal changes nothing.
async function fakeRpc(name: string, args: Row) {
  if (name !== 'request_periodic_report_resend')
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  store.beforeRpc?.(args);
  store.rpcCalls.push({ name, ...args });
  const target = store.view.find(
    (row) =>
      row.id === args.p_report_id &&
      row.user_ws_id === args.p_ws_id &&
      row.group_ws_id === args.p_ws_id
  );
  if (!target) return { data: { code: 404 }, error: null };
  const queue = store.queue.find((row) => row.report_id === target.id);
  const conflict = { data: { code: 409 }, error: null };
  if (
    target.delivery_status !== args.p_expected_status ||
    target.report_approval_status !== 'APPROVED' ||
    target.delivered_at ||
    (args.p_expected_status === 'draft' && target.last_delivery_error)
  )
    return conflict;
  const errors = `${target.last_delivery_error ?? ''} ${queue?.last_error ?? ''}`;
  if (
    queue?.sent_at ||
    queue?.provider_message_id ||
    /outcome is unknown|provider accepted/i.test(errors)
  )
    return conflict;
  const stale = (at: unknown, minutes: number) =>
    typeof at === 'string' && Date.parse(at) <= NOW - minutes * 60_000;
  if (
    args.p_expected_status === 'queued' &&
    (!stale(target.delivery_requested_at ?? queue?.next_attempt_at, 60) ||
      (queue && !stale(queue.next_attempt_at, 60)) ||
      (queue?.locked_at && !stale(queue.locked_at, 15)))
  )
    return conflict;
  const cancelled =
    args.p_expected_status === 'queued' && queue?.status === 'queued';
  // request_periodic_report_delivery('send'), after the in-transaction cancel.
  if (
    queue?.status === 'processing' ||
    (queue?.status === 'queued' && !cancelled)
  )
    return conflict;
  if (queue) Object.assign(queue, { status: 'queued', last_error: null });
  else store.queue.push(queueRow(String(target.id).slice(-2)));
  target.delivery_status = 'queued';
  target.delivery_requested_at = new Date(NOW).toISOString();
  return { data: { code: 200, queued: true, status: 'queued' }, error: null };
}

// The shared Postgres budget, simulated with the same all-or-nothing rule.
async function fakeReserve(dimensions: [string, number, number, number][]) {
  for (const [index, [key, amount, maximum]] of dimensions.entries()) {
    if ((store.budget.get(key) ?? 0) + amount > maximum) return [0, index + 1];
  }
  for (const [key, amount] of dimensions)
    store.budget.set(key, (store.budget.get(key) ?? 0) + amount);
  return [1, 0];
}

const queuedAgain = () =>
  store.view
    .filter((row) => row.delivery_requested_at === new Date(NOW).toISOString())
    .map((row) => row.id);

function allow(except: string[] = []) {
  mocks.permissions.mockResolvedValue({
    wsId: WS,
    containsPermission: (name: string) => !except.includes(name),
  });
}

const context = { params: Promise.resolve({ wsId: 'personal' }) };
const scopeQuery =
  '?target=scope&cadence=monthly&periodStart=2026-09-01&periodEnd=2026-09-30';
const preview = (query = scopeQuery) =>
  GET(new Request(`https://example.com/resend${query}`), context);
const resend = (body: Row) =>
  POST(
    new Request('https://example.com/resend', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    context
  );
let keySeq = 0;
const scopeBody = (change: Row = {}) => ({
  target: 'scope',
  cadence: 'monthly',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  expectedCount: 3,
  idempotencyKey: `00000000-0000-4000-8000-${String(++keySeq).padStart(12, '0')}`,
  ...change,
});

// Eligible: failed (01), stuck queued (02), approved-unsent (03, another
// class). Everything else must never be resent.
function seed() {
  store.view = [
    report('01', {
      delivery_status: 'failed',
      report_stage: 'failed',
      last_delivery_error: 'Email provider rejected the delivery.',
    }),
    report('02', {
      delivery_status: 'queued',
      report_stage: 'queued',
      delivery_requested_at: ago(STUCK_QUEUED_AFTER_MINUTES + 30),
    }),
    report('03', { group_id: CLASS_B }),
    report('04', { delivery_status: 'sent', delivered_at: ago(600) }),
    report('05', {
      delivery_status: 'processing',
      report_stage: 'processing',
      delivery_requested_at: ago(600),
    }),
    report('06', {
      delivery_status: 'queued',
      report_stage: 'queued',
      delivery_requested_at: ago(5),
    }),
    report('07', {
      delivery_status: 'blocked',
      report_stage: 'blocked',
      last_delivery_error: UNKNOWN,
    }),
    report('08', { delivery_status: 'skipped', report_stage: 'skipped' }),
    report('09', {
      delivery_status: 'blocked',
      report_stage: 'blocked',
      last_delivery_error: 'Recipient is unsubscribed or blocked.',
    }),
    // Another workspace, and mismatched subject or class tenancy.
    report('10', {
      delivery_status: 'failed',
      last_delivery_error: 'Provider rejected',
      user_ws_id: OTHER_WS,
      group_ws_id: OTHER_WS,
      group_id: OTHER_CLASS,
    }),
    report('11', {
      delivery_status: 'failed',
      last_delivery_error: 'Provider rejected',
      user_ws_id: OTHER_WS,
    }),
    report('12', {
      delivery_status: 'failed',
      last_delivery_error: 'Provider rejected',
      group_ws_id: OTHER_WS,
    }),
  ];
  store.queue = [
    queueRow('01', { status: 'failed', last_error: 'Provider rejected' }),
    queueRow('02', { next_attempt_at: ago(STUCK_QUEUED_AFTER_MINUTES + 30) }),
    queueRow('04', { status: 'sent', sent_at: ago(600) }),
    queueRow('05', { status: 'processing', locked_at: ago(600) }),
    queueRow('06', { next_attempt_at: ago(5) }),
    queueRow('07', { status: 'blocked', last_error: UNKNOWN }),
    queueRow('10', { ws_id: OTHER_WS, status: 'failed' }),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  store = {
    workspaces: [],
    view: [],
    queue: [],
    audit: [],
    rpcCalls: [],
    budget: new Map(),
  };
  seed();
  allow();
  mocks.actor.mockResolvedValue(ACTOR);
  mocks.memberships.mockResolvedValue([CLASS_A]);
  mocks.secret.mockResolvedValue(true);
  mocks.reserve.mockImplementation(fakeReserve);
  mocks.admin.mockResolvedValue({
    from: (table: string) => fakeQuery(table),
    schema: () => ({ from: (table: string) => fakeQuery(table), rpc: fakeRpc }),
  });
});

describe('resend eligibility', () => {
  const base: ResendReport = {
    id: id('01'),
    user_email: 'learner@example.com',
    delivery_status: 'draft',
    delivered_at: null,
    delivery_requested_at: null,
    generation_status: 'ready',
    last_delivery_error: null,
    report_approval_status: 'APPROVED',
    report_stage: 'approved',
  };
  const queue = (change: Partial<ResendQueue> = {}): ResendQueue => ({
    report_id: id('01'),
    status: 'queued',
    delivery_kind: 'send',
    sent_at: null,
    last_error: null,
    next_attempt_at: ago(120),
    locked_at: null,
    provider_message_id: null,
    ...change,
  });
  const reason = (
    change: Partial<ResendReport>,
    q: ResendQueue | null = null
  ) => resendReason({ ...base, ...change }, q, NOW);
  const stuck = {
    delivery_status: 'queued',
    report_stage: 'queued',
    delivery_requested_at: ago(STUCK_QUEUED_AFTER_MINUTES + 1),
  };

  it('includes failed, stuck and approved-unsent reports', () => {
    expect(
      reason(
        {
          delivery_status: 'failed',
          last_delivery_error: 'Email provider rejected the delivery.',
        },
        queue({ status: 'failed' })
      )
    ).toBe('failed');
    expect(
      reason({
        delivery_status: 'blocked',
        last_delivery_error:
          'Periodic report email delivery is disabled for this workspace.',
      })
    ).toBe('failed');
    expect(reason(stuck, queue())).toBe('stuck');
    // Report says queued, but no queue row will ever deliver it.
    expect(reason(stuck, null)).toBe('stuck');
    expect(reason({})).toBe('held');
    // A finished test send does not make a report sent.
    expect(reason({}, queue({ status: 'sent', delivery_kind: 'test' }))).toBe(
      'held'
    );
  });

  it('excludes sent reports and any report that may have been sent', () => {
    expect(reason({ delivery_status: 'sent' })).toBeNull();
    expect(reason({ delivered_at: ago(10) })).toBeNull();
    expect(
      reason(
        { delivery_status: 'failed', last_delivery_error: 'x' },
        queue({ status: 'failed', sent_at: ago(10) })
      )
    ).toBeNull();
    expect(
      reason(
        { delivery_status: 'failed', last_delivery_error: 'x' },
        queue({ status: 'failed', provider_message_id: 'msg-1' })
      )
    ).toBeNull();
    expect(
      reason({}, queue({ status: 'sent', delivery_kind: 'send' }))
    ).toBeNull();
    for (const error of [
      UNKNOWN,
      'Delivery worker timed out. Delivery outcome is unknown; check provider logs before retrying.',
      'Provider accepted the email, but delivery tracking failed. Check provider logs before retrying.',
    ]) {
      expect(
        reason({ delivery_status: 'blocked', last_delivery_error: error })
      ).toBeNull();
      expect(
        reason(
          { delivery_status: 'failed', last_delivery_error: 'x' },
          queue({ status: 'blocked', last_error: error })
        )
      ).toBeNull();
    }
  });

  it('excludes in-flight reports: processing at any age, or queued under the threshold', () => {
    expect(
      reason(
        { delivery_status: 'processing', delivery_requested_at: ago(600) },
        queue({ status: 'processing', locked_at: ago(600) })
      )
    ).toBeNull();
    expect(reason(stuck, queue({ status: 'processing' }))).toBeNull();
    expect(
      reason({
        ...stuck,
        delivery_requested_at: ago(STUCK_QUEUED_AFTER_MINUTES - 1),
      })
    ).toBeNull();
    // Deferred by the worker: the next attempt is still ahead.
    expect(
      reason(
        stuck,
        queue({ next_attempt_at: new Date(NOW + 60_000).toISOString() })
      )
    ).toBeNull();
    // A lease taken in the last 15 minutes.
    expect(reason(stuck, queue({ locked_at: ago(5) }))).toBeNull();
    // A draft report with a waiting queue row is already requested.
    expect(reason({}, queue())).toBeNull();
  });

  it('excludes skipped, cancelled, unapproved and recipient or setup blockers', () => {
    expect(reason({ delivery_status: 'skipped' })).toBeNull();
    expect(reason({ delivery_status: 'cancelled' })).toBeNull();
    expect(reason({ report_approval_status: 'PENDING' })).toBeNull();
    expect(reason({ user_email: ' ' })).toBeNull();
    for (const error of [
      'Recipient is unsubscribed or blocked.',
      'Subject profile email is missing.',
      'Delivery gate blocked: disabled',
      'Report approval changed before rendering.',
    ])
      expect(
        reason({ delivery_status: 'blocked', last_delivery_error: error })
      ).toBeNull();
  });
});

describe('resend preview', () => {
  it('counts only eligible reports in this workspace and scope, by reason', async () => {
    const response = await preview();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      count: 3,
      reasons: { failed: 1, stuck: 1, held: 1 },
      limits: {
        maxReportsPerAction: RESEND_MAX_REPORTS_PER_ACTION,
        actionsPerWindow: RESEND_ACTIONS_PER_WINDOW,
        reportsPerHour: RESEND_REPORTS_PER_HOUR,
        stuckAfterMinutes: STUCK_QUEUED_AFTER_MINUTES,
      },
    });
    expect(store.rpcCalls).toEqual([]);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('re-checks a selection on the server and ignores foreign or ineligible ids', async () => {
    const ids = ['01', '04', '05', '08', '10', '11', '12'].map(id).join(',');
    const response = await preview(`?target=selection&reportIds=${ids}`);
    expect(await response.json()).toMatchObject({
      count: 1,
      reasons: { failed: 1, stuck: 0, held: 0 },
    });
  });

  it('limits a non-manage_users admin to their own classes', async () => {
    allow(['manage_users']);
    const response = await preview();
    expect((await response.json()).count).toBe(2);
    expect((await preview(`${scopeQuery}&groupId=${CLASS_B}`)).status).toBe(
      404
    );
  });

  it('rejects an empty scope', async () => {
    expect((await preview('?target=scope&cadence=monthly')).status).toBe(400);
  });
});

describe('resend action', () => {
  it('resends failed, stuck and approved-unsent reports from their confirmed state', async () => {
    const response = await resend(scopeBody());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      requested: 3,
      affected: 3,
      replayed: false,
    });
    expect(
      store.rpcCalls.map((call) => [call.p_report_id, call.p_expected_status])
    ).toEqual([
      [id('01'), 'failed'],
      [id('02'), 'queued'],
      [id('03'), 'draft'],
    ]);
    expect(queuedAgain()).toEqual([id('01'), id('02'), id('03')]);
    // One queue row per report: the stuck row was re-requested, not doubled.
    expect(
      store.queue.filter((row) => row.report_id === id('02'))
    ).toHaveLength(1);
    expect(
      store.rpcCalls.every(
        (call) => call.p_ws_id === WS && call.p_delivery_enabled === true
      )
    ).toBe(true);
  });

  it('writes an audit row: who, when, workspace, scope, action, count and ids', async () => {
    await resend(scopeBody({ groupId: CLASS_A, expectedCount: 2 }));
    expect(store.audit).toHaveLength(1);
    expect(store.audit[0]).toMatchObject({
      ws_id: WS,
      actor_user_id: ACTOR,
      action: 'resend',
      cadence: 'monthly',
      period_start: '2026-09-01',
      period_end: '2026-09-30',
      group_id: CLASS_A,
      requested_count: 2,
      affected_count: 2,
      report_ids: [id('01'), id('02')],
      status: 'completed',
      completed_at: expect.any(String),
    });
  });

  it('audits a selection with no period, class or cadence', async () => {
    const response = await resend({
      target: 'selection',
      reportIds: [id('01'), id('03')],
      expectedCount: 2,
      idempotencyKey: '00000000-0000-4000-8000-0000000000e1',
    });
    expect(response.status).toBe(200);
    expect(store.audit[0]).toMatchObject({
      action: 'resend',
      cadence: null,
      period_start: null,
      period_end: null,
      group_id: null,
      requested_count: 2,
      report_ids: [id('01'), id('03')],
    });
  });

  it('never double-sends: a stuck row a worker claims mid-action is left alone', async () => {
    // The worker takes the lease after the count, before the resend.
    store.beforeRpc = (args) => {
      if (args.p_report_id === id('02')) {
        const row = store.queue.find((q) => q.report_id === id('02'));
        if (row)
          Object.assign(row, { status: 'processing', locked_at: ago(0) });
        Object.assign(store.view[1] as Row, { delivery_status: 'processing' });
      }
    };
    const response = await resend(scopeBody());
    expect(await response.json()).toMatchObject({ requested: 3, affected: 2 });
    expect(queuedAgain()).toEqual([id('01'), id('03')]);
    expect(store.queue.find((q) => q.report_id === id('02'))?.status).toBe(
      'processing'
    );
    expect(store.audit[0]).toMatchObject({
      affected_count: 2,
      report_ids: [id('01'), id('03')],
    });
  });

  it('never resends a report another admin skipped mid-action', async () => {
    store.beforeRpc = (args) => {
      if (args.p_report_id === id('03'))
        Object.assign(store.view[2] as Row, { delivery_status: 'skipped' });
    };
    const response = await resend(scopeBody());
    expect(await response.json()).toMatchObject({ requested: 3, affected: 2 });
    expect(queuedAgain()).toEqual([id('01'), id('02')]);
    expect((store.view[2] as Row).delivery_status).toBe('skipped');
    expect(store.queue.some((q) => q.report_id === id('03'))).toBe(false);
  });

  it('never resends sent, processing, recently queued, unknown-outcome or skipped reports, even when selected', async () => {
    const ineligible = ['04', '05', '06', '07', '08', '09'].map(id);
    const response = await resend({
      target: 'selection',
      reportIds: ineligible,
      expectedCount: ineligible.length,
      idempotencyKey: '00000000-0000-4000-8000-0000000000e2',
    });
    expect(response.status).toBe(409);
    expect((await response.json()).count).toBe(0);
    expect(store.rpcCalls).toEqual([]);
    expect(store.audit).toEqual([]);
  });

  it('replays a re-click without acting again or charging the rate limit', async () => {
    const body = scopeBody();
    await resend(body);
    const calls = store.rpcCalls.length;
    const reserves = mocks.reserve.mock.calls.length;
    const replay = await resend(body);
    expect(await replay.json()).toMatchObject({ replayed: true, affected: 3 });
    expect(store.rpcCalls).toHaveLength(calls);
    expect(mocks.reserve).toHaveBeenCalledTimes(reserves);
    expect(store.audit).toHaveLength(1);
  });

  it('rejects a stale confirmation count without sending', async () => {
    const response = await resend(scopeBody({ expectedCount: 2 }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'RESEND_SCOPE_CHANGED',
      count: 3,
    });
    expect(store.rpcCalls).toEqual([]);
  });

  it('refuses when an email gate is off, before touching any report', async () => {
    mocks.secret.mockResolvedValueOnce(false);
    const response = await resend(scopeBody());
    expect(response.status).toBe(409);
    expect(store.rpcCalls).toEqual([]);
    expect(store.audit).toEqual([]);
  });

  it('sends nothing until the audit migration is applied', async () => {
    store.failAuditInsert = { code: '23514' };
    const response = await resend(scopeBody());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('RESEND_AUDIT_UPDATING');
    expect(store.rpcCalls).toEqual([]);
  });

  it('rejects client fields beyond the target, and selections over the cap', async () => {
    expect((await resend({ ...scopeBody(), action: 'send' })).status).toBe(400);
    const tooMany = Array.from(
      { length: RESEND_MAX_REPORTS_PER_ACTION + 1 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    );
    expect(
      (
        await resend({
          target: 'selection',
          reportIds: tooMany,
          expectedCount: 1,
          idempotencyKey: '00000000-0000-4000-8000-0000000000e3',
        })
      ).status
    ).toBe(400);
    expect(store.rpcCalls).toEqual([]);
  });

  it('caps one action at K reports even in a wide scope', async () => {
    for (let index = 0; index <= RESEND_MAX_REPORTS_PER_ACTION; index += 1)
      store.view.push(
        report(String(index).padStart(2, '0').slice(-2), {
          id: `00000000-0000-4000-8000-0000000d${String(index).padStart(4, '0')}`,
          created_at: '2026-09-15T00:00:00Z',
        })
      );
    const response = await resend(
      scopeBody({ expectedCount: RESEND_MAX_REPORTS_PER_ACTION })
    );
    expect(response.status).toBe(409);
    const scoped = (await response.json()).count;
    expect(scoped).toBeGreaterThan(RESEND_MAX_REPORTS_PER_ACTION);
    expect(store.rpcCalls).toEqual([]);
  });
});

describe('resend permissions and tenancy', () => {
  it.each([
    ['manage_user_report_automation'],
    ['send_user_group_report_emails'],
  ])('denies preview and resend without %s', async (missing) => {
    allow([missing]);
    expect((await preview()).status).toBe(403);
    expect((await resend(scopeBody())).status).toBe(403);
    expect(store.rpcCalls).toEqual([]);
    expect(store.audit).toEqual([]);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('denies a request without a resolved actor', async () => {
    mocks.actor.mockResolvedValue(null);
    expect((await resend(scopeBody())).status).toBe(403);
    expect(store.rpcCalls).toEqual([]);
  });

  it('never resends another workspace report, even by id', async () => {
    const foreign = [id('10'), id('11'), id('12')];
    const response = await resend({
      target: 'selection',
      reportIds: foreign,
      expectedCount: 3,
      idempotencyKey: '00000000-0000-4000-8000-0000000000e4',
    });
    expect(response.status).toBe(409);
    expect((await response.json()).count).toBe(0);
    expect(store.rpcCalls).toEqual([]);
    // The workspace comes from the route; a mixed selection acts only here.
    const mixed = await resend({
      target: 'selection',
      reportIds: [id('01'), ...foreign],
      expectedCount: 1,
      idempotencyKey: '00000000-0000-4000-8000-0000000000e5',
    });
    expect(mixed.status).toBe(200);
    expect(queuedAgain()).toEqual([id('01')]);
  });

  it('returns 404 for a class outside the admin reach', async () => {
    allow(['manage_users']);
    const response = await resend(scopeBody({ groupId: CLASS_B }));
    expect(response.status).toBe(404);
    expect(store.rpcCalls).toEqual([]);
  });
});

describe('resend rate limit', () => {
  const one = () =>
    resend({
      target: 'selection',
      reportIds: [id('03')],
      expectedCount: 1,
      idempotencyKey: `00000000-0000-4000-8000-${String(++keySeq).padStart(12, '0')}`,
    });

  it(`allows ${RESEND_ACTIONS_PER_WINDOW} actions per window per workspace, then answers 429`, async () => {
    for (let index = 0; index < RESEND_ACTIONS_PER_WINDOW; index += 1) {
      // Reset the report so every action has exactly one eligible report.
      Object.assign(store.view[2] as Row, { delivery_status: 'draft' });
      store.queue = store.queue.filter((row) => row.report_id !== id('03'));
      expect((await one()).status).toBe(200);
    }
    Object.assign(store.view[2] as Row, { delivery_status: 'draft' });
    store.queue = store.queue.filter((row) => row.report_id !== id('03'));
    const calls = store.rpcCalls.length;
    const audits = store.audit.length;
    const limited = await one();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(await limited.json()).toMatchObject({ code: 'RESEND_RATE_LIMITED' });
    expect(store.rpcCalls).toHaveLength(calls);
    expect(store.audit).toHaveLength(audits);
    const [[dimensions]] = mocks.reserve.mock.calls as [
      [[string, number, number, number][]],
    ];
    expect(dimensions.map(([key]) => key)).toEqual([
      expect.stringMatching(
        new RegExp(`^api-cost:v1:report-resend:actions:${WS}:\\d+$`)
      ),
      expect.stringMatching(
        new RegExp(`^api-cost:v1:report-resend:reports:${WS}:\\d+$`)
      ),
    ]);
  });

  it(`caps reports per hour at ${RESEND_REPORTS_PER_HOUR} across actions`, async () => {
    const hour = Math.floor(NOW / 3_600_000);
    store.budget.set(
      `api-cost:v1:report-resend:reports:${WS}:${hour}`,
      RESEND_REPORTS_PER_HOUR - 2
    );
    const response = await resend(scopeBody());
    expect(response.status).toBe(429);
    expect(store.rpcCalls).toEqual([]);
    expect((await one()).status).toBe(200);
  });

  it('is per workspace: another workspace budget does not apply', async () => {
    const window = Math.floor(NOW / 600_000);
    store.budget.set(
      `api-cost:v1:report-resend:actions:${OTHER_WS}:${window}`,
      RESEND_ACTIONS_PER_WINDOW
    );
    expect((await one()).status).toBe(200);
  });

  it('fails closed when the shared budget is unavailable', async () => {
    mocks.reserve.mockRejectedValueOnce(new Error('budget down'));
    const response = await one();
    expect(response.status).toBe(503);
    expect(store.rpcCalls).toEqual([]);
    expect(store.audit).toEqual([]);
  });
});
