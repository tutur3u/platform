import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  secret: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifySecret: mocks.secret,
}));
vi.mock('../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.permissions,
}));
vi.mock('../../../lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => 'workspace-1',
}));

import { GET, POST } from './[reportId]/delivery/route';

const context = {
  params: Promise.resolve({ wsId: 'personal', reportId: 'report-1' }),
};
const report = {
  id: 'report-1',
  user_id: 'user-1',
  user_email: 'user@example.com',
  report_approval_status: 'APPROVED',
  delivery_status: 'draft',
};
function database(
  overrides: Record<string, unknown> = {},
  errorTable?: string
) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const rows: Record<string, unknown> = {
    external_user_monthly_reports_workspace_view: report,
    user_report_email_queue: null,
    ...overrides,
  };
  const from = (table: string) => {
    const result = () => ({
      data: rows[table] ?? null,
      error: table === errorTable ? new Error('db failed') : null,
    });
    const proxy = new Proxy(Promise.resolve(), {
      get(_target, property) {
        if (property === 'then') {
          const promise = Promise.resolve(result());
          return promise.then.bind(promise);
        }
        return (...args: unknown[]) => {
          calls.push({ table, method: String(property), args });
          return proxy;
        };
      },
    });
    return proxy;
  };
  mocks.admin.mockResolvedValue({ schema: () => ({ from, rpc: mocks.rpc }) });
  return calls;
}
function request(action: string) {
  return new Request('https://example.com/api/delivery', {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

describe('periodic report delivery route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions.mockResolvedValue({ containsPermission: () => true });
    mocks.secret.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({
      data: { code: 200, queued: true, status: 'queued' },
      error: null,
    });
  });
  it('requires view permission before loading private diagnostics', async () => {
    mocks.permissions.mockResolvedValue({ containsPermission: () => false });
    expect((await GET(request('preview'), context)).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('scopes diagnostics to the normalized workspace and disables caching', async () => {
    const calls = database();
    const response = await GET(request('preview'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(calls).toContainEqual({
      table: 'external_user_monthly_reports_workspace_view',
      method: 'eq',
      args: ['user_ws_id', 'workspace-1'],
    });
    expect(calls).toContainEqual({
      table: 'user_report_email_queue',
      method: 'eq',
      args: ['ws_id', 'workspace-1'],
    });
  });
  it('does not query delivery history for a report outside the workspace', async () => {
    const calls = database({
      external_user_monthly_reports_workspace_view: null,
    });
    expect((await GET(request('preview'), context)).status).toBe(404);
    expect(calls.some((call) => call.table === 'user_report_email_queue')).toBe(
      false
    );
  });
  it('returns an error rather than a misleading empty delivery history', async () => {
    database({}, 'user_report_email_queue');
    expect((await GET(request('preview'), context)).status).toBe(500);
  });
  it('previews without adding a delivery', async () => {
    const calls = database();
    const response = await POST(request('preview'), context);
    expect(await response.json()).toMatchObject({
      queued: false,
      preview: { recipient: 'user@example.com' },
    });
    expect(calls.some((call) => call.method === 'upsert')).toBe(false);
  });
  it.each(['queued', 'processing', 'sent'])(
    'rejects a repeat send while %s',
    async (status) => {
      const calls = database({
        external_user_monthly_reports_workspace_view: {
          ...report,
          delivery_status: status,
        },
      });
      expect((await POST(request('send'), context)).status).toBe(409);
      expect(calls.some((call) => call.method === 'upsert')).toBe(false);
    }
  );
  it.each(['PENDING', 'REJECTED'])(
    'does not queue a %s report',
    async (status) => {
      const calls = database({
        external_user_monthly_reports_workspace_view: {
          ...report,
          report_approval_status: status,
        },
      });
      expect((await POST(request('send'), context)).status).toBe(409);
      expect(calls.some((call) => call.method === 'upsert')).toBe(false);
    }
  );
  it('blocks sends while either email gate is disabled', async () => {
    const calls = database();
    mocks.secret.mockResolvedValue(false);
    expect((await POST(request('send'), context)).status).toBe(409);
    expect(calls.some((call) => call.method === 'upsert')).toBe(false);
  });
  it('returns the atomic request conflict without claiming it queued a delivery', async () => {
    database();
    mocks.rpc.mockResolvedValue({
      data: { code: 409, message: 'Delivery is already active or sent.' },
      error: null,
    });
    const response = await POST(request('send'), context);
    expect(response.status).toBe(409);
    expect((await response.json()).queued).not.toBe(true);
  });
  it('cannot mark a sent report cancelled', async () => {
    const calls = database({
      external_user_monthly_reports_workspace_view: {
        ...report,
        delivery_status: 'sent',
      },
    });
    expect((await POST(request('cancel'), context)).status).toBe(409);
    expect(calls.some((call) => call.method === 'update')).toBe(false);
  });
  it('queues an approved report to the workspace user email', async () => {
    const calls = database();
    expect((await POST(request('send'), context)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('request_periodic_report_delivery', {
      p_report_id: 'report-1',
      p_ws_id: 'workspace-1',
      p_action: 'send',
    });
    expect(
      calls.some((call) => call.method === 'upsert' || call.method === 'update')
    ).toBe(false);
  });
});
