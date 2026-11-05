import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  actor: vi.fn(),
  link: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: mocks.link,
}));
vi.mock('../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.permissions,
}));
vi.mock('../../../lib/user-groups/groups-utils', () => ({
  getUserGroupMembershipsForActor: vi.fn(),
}));
vi.mock('../../../lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => 'workspace-1',
  resolveRequestActorAuthUid: mocks.actor,
}));

import { PUT } from './[reportId]/route';
import { POST } from './route';

// Synthetic fixture only.
const userId = '10000000-0000-4000-8000-000000000001';
const groupId = '20000000-0000-4000-8000-000000000001';
const october = { period_start: '2026-10-01', period_end: '2026-10-31' };
type Call = { table: string; method: string; args: unknown[] };
type Existing = {
  delivery_status: string;
  delivered_at: string | null;
  period_start?: string | null;
  period_end?: string | null;
};

function database({
  existing = { delivery_status: 'draft', delivered_at: null },
  duplicate = false,
  insertError = null as { code: string; message: string } | null,
}: {
  existing?: Existing;
  duplicate?: boolean;
  insertError?: { code: string; message: string } | null;
} = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let writes = false;
    let inserted = false;
    const read = () =>
      table === 'workspace_configs'
        ? { value: 'true' }
        : table === 'external_user_monthly_reports_workspace_view'
          ? {
              id: 'report-1',
              user_id: userId,
              group_id: groupId,
              generation_mode: 'manual',
              ...existing,
            }
          : table === 'external_user_monthly_reports'
            ? duplicate
              ? { id: 'existing-report' }
              : null
            : { id: 'scope-1' };
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'limit', 'insert', 'update'])
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        if (method === 'insert') inserted = true;
        if (['insert', 'update'].includes(method)) writes = true;
        return builder;
      };
    builder.maybeSingle = async () => ({ data: read(), error: null });
    builder.single = async () =>
      inserted && insertError
        ? { data: null, error: insertError }
        : { data: inserted ? { id: 'report-new' } : read(), error: null };
    // biome-ignore lint/suspicious/noThenProperty: emulate the awaited PostgREST builder.
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(
        table === 'external_user_monthly_reports' && writes
          ? {
              data: [{ id: 'report-1', user_id: userId, group_id: groupId }],
              error: null,
            }
          : { data: read(), error: null }
      ).then(resolve);
    return builder;
  };
  mocks.admin.mockResolvedValue({ from, schema: () => ({ from }) });
  return calls;
}
const put = (body: unknown) =>
  PUT(
    new Request('https://example.test/report', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ wsId: 'workspace-1', reportId: 'report-1' }) }
  );
const post = (body: unknown) =>
  POST(
    new Request('https://example.test/reports', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ wsId: 'workspace-1' }) }
  );
const updateOf = (calls: Call[]) =>
  calls.find(
    (call) =>
      call.table === 'external_user_monthly_reports' && call.method === 'update'
  )?.args[0] as Record<string, unknown> | undefined;
const canEditOnly = {
  containsPermission: (permission: string) => permission !== 'approve_reports',
};
const canApprove = { containsPermission: () => true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue('actor-1');
  mocks.link.mockResolvedValue({ virtual_user_id: 'workspace-actor-1' });
});

describe('C1: moving a sent report to another month', () => {
  it.each([
    ['delivery_status sent', { delivery_status: 'sent', delivered_at: null }],
    [
      'delivered_at set',
      { delivery_status: 'draft', delivered_at: '2026-11-03T02:00:00Z' },
    ],
  ])(
    'needs approve_reports once the report is sent (%s)',
    async (_label, existing) => {
      mocks.permissions.mockResolvedValue(canEditOnly);
      const calls = database({ existing });
      expect((await put(october)).status).toBe(403);
      expect(updateOf(calls)).toBeUndefined();
      // Only a month change reads the delivery state.
      expect(calls).toContainEqual({
        table: 'external_user_monthly_reports_workspace_view',
        method: 'select',
        args: [
          'id, user_id, group_id, generation_mode, delivery_status, delivered_at',
        ],
      });
    }
  );

  it('lets an approver move a sent report', async () => {
    mocks.permissions.mockResolvedValue(canApprove);
    const calls = database({
      existing: {
        delivery_status: 'sent',
        delivered_at: '2026-11-03T02:00:00Z',
      },
    });
    expect((await put(october)).status).toBe(200);
    expect(updateOf(calls)).toMatchObject(october);
  });

  it('lets any editor move an unsent report', async () => {
    mocks.permissions.mockResolvedValue(canEditOnly);
    const calls = database();
    expect((await put(october)).status).toBe(200);
    expect(updateOf(calls)).toMatchObject(october);
  });

  it('keeps content edits on a sent report unchanged for editors', async () => {
    mocks.permissions.mockResolvedValue(canEditOnly);
    database({ existing: { delivery_status: 'sent', delivered_at: null } });
    expect((await put({ feedback: 'Follow-up note' })).status).toBe(200);
  });
});

describe('C2: every period change is attributed in the audit trail', () => {
  it('records the acting staff member on a period change', async () => {
    mocks.permissions.mockResolvedValue(canEditOnly);
    const calls = database();
    expect((await put(october)).status).toBe(200);
    // audit.record_version snapshots old and new rows of this update; the
    // activity log attributes service-role writes through updated_by.
    expect(updateOf(calls)).toMatchObject({
      ...october,
      updated_by: 'workspace-actor-1',
    });
    expect(mocks.link).toHaveBeenCalledWith(
      'workspace-1',
      'actor-1',
      expect.anything()
    );
  });

  it('refuses a period change it cannot attribute', async () => {
    mocks.permissions.mockResolvedValue(canEditOnly);
    mocks.link.mockResolvedValue(null);
    const calls = database();
    expect((await put(october)).status).toBe(403);
    expect(updateOf(calls)).toBeUndefined();
  });
});

describe('one report per student, class and month', () => {
  const create = {
    user_id: userId,
    group_id: groupId,
    title: 'Báo cáo 10/2026',
    content: 'Observation',
    feedback: 'Next step',
    cadence: 'monthly',
    ...october,
  };
  beforeEach(() => mocks.permissions.mockResolvedValue(canApprove));

  it('returns 409 when the month already has a report', async () => {
    const calls = database({ duplicate: true });
    const response = await post(create);
    expect(response.status).toBe(409);
    expect(calls.some((call) => call.method === 'insert')).toBe(false);
  });

  it('returns 409, not 500, when the insert hits a unique constraint', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    database({
      insertError: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "idx_external_user_monthly_reports_unique_report"',
      },
    });
    const response = await post(create);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: 'Duplicate report exists',
    });
    errors.mockRestore();
  });
});
