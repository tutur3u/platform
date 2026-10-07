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

const userId = '10000000-0000-4000-8000-000000000001';
const groupId = '20000000-0000-4000-8000-000000000001';
const create = {
  user_id: userId,
  group_id: groupId,
  title: 'Teacher report',
  content: 'Human observation',
  feedback: 'Human next step',
  generation_mode: 'manual',
};
type Call = { table: string; method: string; args: unknown[] };
function database(approvalEnabled = false, existing = true) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let writes = false;
    const result = () => ({
      data:
        table === 'workspace_configs'
          ? { value: String(approvalEnabled) }
          : table === 'external_user_monthly_reports_workspace_view'
            ? existing
              ? { id: 'report-1', generation_mode: 'manual' }
              : null
            : table === 'external_user_monthly_reports'
              ? writes
                ? { id: 'report-1' }
                : null
              : { id: 'scope-1' },
      error: null,
    });
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'limit', 'insert', 'update'])
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        if (['insert', 'update'].includes(method)) writes = true;
        return builder;
      };
    builder.maybeSingle = async () => result();
    builder.single = async () => result();
    // biome-ignore lint/suspicious/noThenProperty: faithfully emulate the awaited PostgREST builder.
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve);
    return builder;
  };
  mocks.admin.mockResolvedValue({ from, schema: () => ({ from }) });
  return calls;
}
function request(body: unknown) {
  return new Request('https://example.com/report', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
const context = {
  params: Promise.resolve({ wsId: 'workspace-1', reportId: 'report-1' }),
};
function written(calls: Call[], method: string) {
  return calls.find(
    (call) =>
      call.table === 'external_user_monthly_reports' && call.method === method
  )?.args[0] as Record<string, unknown>;
}
describe('Report create/edit requires an explicit approval action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue('actor-1');
    mocks.link.mockResolvedValue({ virtual_user_id: 'workspace-actor-1' });
    mocks.permissions.mockResolvedValue({ containsPermission: () => true });
  });
  it('creates a pending manual report even when the legacy approval flag is disabled', async () => {
    const calls = database(false);
    expect((await POST(request(create), context)).status).toBe(200);
    expect(written(calls, 'insert')).toMatchObject({
      report_approval_status: 'PENDING',
    });
    expect(written(calls, 'insert').approved_by).toBeUndefined();
  });
  it.each([false, true])(
    'keeps ordinary approver edits pending with approval flag %s',
    async (enabled) => {
      const calls = database(enabled);
      expect(
        (await PUT(request({ feedback: 'New human feedback' }), context)).status
      ).toBe(200);
      expect(written(calls, 'update')).toMatchObject({
        report_approval_status: 'PENDING',
        approved_by: null,
        approved_at: null,
      });
    }
  );
  it.each([
    { title: 'New report title' },
    { manager_instruction: 'Review attendance carefully' },
    { manager_instruction: null },
    { content: 'New report content' },
    { score: 4 },
    { scores: [2, 4] },
    { scores: null },
    { cadence: 'weekly' },
    { period_start: '2026-07-01' },
    { period_end: '2026-07-31' },
    { generation_mode: 'ai' },
    { generation_status: 'generating' },
    { generation_status: 'failed' },
  ])('invalidates ordinary reviewable changes %j', async (body) => {
    const calls = database(true);
    expect((await PUT(request(body), context)).status).toBe(200);
    expect(written(calls, 'update')).toMatchObject({
      report_approval_status: 'PENDING',
      approved_by: null,
      approved_at: null,
    });
  });
  it('owns approval timestamps and attribution even when the caller supplies spoofed values', async () => {
    const calls = database();
    const before = Date.now();
    expect(
      (
        await PUT(
          request({
            report_approval_status: 'APPROVED',
            approved_at: '1999-12-31T23:59:59.000Z',
            approved_by: 'foreign-actor',
          }),
          context
        )
      ).status
    ).toBe(200);
    const update = written(calls, 'update');
    expect(update.approved_by).toBe('workspace-actor-1');
    expect(
      new Date(update.approved_at as string).getTime()
    ).toBeGreaterThanOrEqual(before);
  });
  it('owns rejection timestamps and attribution despite caller spoofing', async () => {
    const calls = database();
    const before = Date.now();
    expect(
      (
        await PUT(
          request({
            report_approval_status: 'REJECTED',
            rejected_at: '1999-12-31T23:59:59.000Z',
            rejected_by: 'foreign-actor',
            rejection_reason: 'Review needs correction',
          }),
          context
        )
      ).status
    ).toBe(200);
    const update = written(calls, 'update');
    expect(update.rejected_by).toBe('workspace-actor-1');
    expect(
      new Date(update.rejected_at as string).getTime()
    ).toBeGreaterThanOrEqual(before);
    expect(update.approved_at).toBeNull();
    expect(update.approved_by).toBeNull();
  });
  it('preserves the explicit permitted approval path with server-resolved actor', async () => {
    const calls = database();
    expect(
      (await PUT(request({ report_approval_status: 'APPROVED' }), context))
        .status
    ).toBe(200);
    expect(written(calls, 'update')).toMatchObject({
      report_approval_status: 'APPROVED',
      approved_by: 'workspace-actor-1',
    });
  });
  it('denies explicit approval without approve permission and makes no write', async () => {
    const calls = database();
    mocks.permissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission !== 'approve_reports',
    });
    expect(
      (await PUT(request({ report_approval_status: 'APPROVED' }), context))
        .status
    ).toBe(403);
    expect(calls.some((call) => call.method === 'update')).toBe(false);
  });
  it('denies a report absent from the authenticated workspace with no write', async () => {
    const calls = database(false, false);
    expect(
      (await PUT(request({ report_approval_status: 'APPROVED' }), context))
        .status
    ).toBe(404);
    expect(calls.some((call) => call.method === 'update')).toBe(false);
    expect(calls).toContainEqual({
      table: 'external_user_monthly_reports_workspace_view',
      method: 'eq',
      args: ['user_ws_id', 'workspace-1'],
    });
  });
  it('denies unauthenticated create before database access', async () => {
    mocks.actor.mockResolvedValue(null);
    expect((await POST(request(create), context)).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
