import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  workspace: vi.fn(),
  actor: vi.fn(),
  link: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: mocks.link,
}));
vi.mock('../../../../src/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.permissions,
}));
vi.mock('../../../../src/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: mocks.workspace,
  resolveRequestActorAuthUid: mocks.actor,
}));

import { PUT } from '../../../../src/routes/users/reports/[reportId]/route';

const identity = {
  id: 'report-1',
  user_id: 'subject-1',
  group_id: 'group-1',
};
const existing = { ...identity, generation_mode: 'manual' };
const context = {
  params: Promise.resolve({ wsId: 'workspace-1', reportId: identity.id }),
};
type Call = { table: string; method: string; args: unknown[] };
type Result = { data: unknown; error: unknown };

function database(
  result: Result = { data: [identity], error: null },
  read: Result = { data: existing, error: null }
) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const response = () =>
      table === 'workspace_configs'
        ? { data: { value: 'true' }, error: null }
        : table === 'external_user_monthly_reports_workspace_view'
          ? read
          : result;
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'update']) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      };
    }
    builder.maybeSingle = async () => response();
    // biome-ignore lint/suspicious/noThenProperty: emulate the awaited PostgREST builder.
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(response()).then(resolve);
    return builder;
  };
  mocks.admin.mockResolvedValue({ from, schema: () => ({ from }) });
  return calls;
}
function request(body: unknown) {
  return new Request('https://example.test/report', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
function writes(calls: Call[]) {
  return calls.filter((call) => call.table === 'external_user_monthly_reports');
}

// These are handler/transport regressions, not SQL or provider evidence.
describe('Ordinary report draft PUT acknowledgement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspace.mockResolvedValue('workspace-1');
    mocks.permissions.mockResolvedValue({ containsPermission: () => true });
  });

  it('acknowledges exactly one original report/user/group after a tenant read', async () => {
    const calls = database();
    const response = await PUT(
      request({ content: 'Synthetic draft' }),
      context
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    const readCalls = calls.filter(
      (call) => call.table === 'external_user_monthly_reports_workspace_view'
    );
    expect(readCalls).toEqual([
      {
        table: 'external_user_monthly_reports_workspace_view',
        method: 'select',
        args: ['id, user_id, group_id, generation_mode'],
      },
      {
        table: 'external_user_monthly_reports_workspace_view',
        method: 'eq',
        args: ['id', identity.id],
      },
      {
        table: 'external_user_monthly_reports_workspace_view',
        method: 'eq',
        args: ['user_ws_id', 'workspace-1'],
      },
    ]);
    expect(writes(calls).filter((call) => call.method === 'eq')).toEqual(
      ['id', 'user_id', 'group_id'].map((key) => ({
        table: 'external_user_monthly_reports',
        method: 'eq',
        args: [key, identity[key as keyof typeof identity]],
      }))
    );
    expect(writes(calls).at(-1)).toEqual({
      table: 'external_user_monthly_reports',
      method: 'select',
      args: ['id, user_id, group_id'],
    });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it('rejects a zero-row write after the tenant read succeeded', async () => {
    database({ data: [], error: null });
    const response = await PUT(request({ title: 'Synthetic draft' }), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: 'Report save was not acknowledged',
    });
  });

  it.each([
    ['null', null],
    ['missing data', undefined],
    ['non-array', identity],
    ['null row', [null]],
    ['empty row', [{}]],
    ['missing subject', [{ id: identity.id, group_id: identity.group_id }]],
    ['foreign report', [{ ...identity, id: 'other-report' }]],
    ['foreign subject', [{ ...identity, user_id: 'other-subject' }]],
    ['foreign group', [{ ...identity, group_id: 'other-group' }]],
    ['duplicate acknowledgement', [identity, identity]],
  ])('rejects %s acknowledgement', async (_name, data) => {
    database({ data, error: null });
    const response = await PUT(
      request({ feedback: 'Synthetic feedback' }),
      context
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: 'Report save was not acknowledged',
    });
  });

  it('keeps query errors on the existing 500 path even with a matching row', async () => {
    database({ data: [identity], error: { code: 'XX000' } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await PUT(request({ feedback: '' }), context);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        message: 'Internal server error',
      });
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it('preserves the existing delivery-lock conflict', async () => {
    database({
      data: null,
      error: {
        code: '55P03',
        message: 'Report delivery is in progress. Try again after it finishes.',
      },
    });
    const response = await PUT(request({ feedback: '' }), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: 'Report delivery is in progress. Try again after it finishes.',
    });
  });

  it.each([
    { title: '', content: '', feedback: '' },
    {
      title: '  Synthetic title\nsecond line  ',
      content: '\nObservation\r\n\nAnother line  \n',
      feedback: '  Guidance\n\nNext step\n',
    },
  ])(
    'preserves exact supplied text and the PENDING transition %j',
    async (body) => {
      const calls = database();
      const response = await PUT(request(body), context);
      expect(response.status).toBe(200);
      const payload = writes(calls).find((call) => call.method === 'update')
        ?.args[0];
      expect(payload).toMatchObject({
        ...body,
        report_approval_status: 'PENDING',
        approved_by: null,
        approved_at: null,
        rejected_by: null,
        rejected_at: null,
        rejection_reason: null,
      });
    }
  );

  it('does not mutate when the tenant read has no report', async () => {
    const calls = database(undefined, { data: null, error: null });
    const response = await PUT(request({ title: '' }), context);
    expect(response.status).toBe(404);
    expect(writes(calls)).toEqual([]);
  });
});
