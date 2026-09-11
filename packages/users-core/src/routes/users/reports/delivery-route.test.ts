import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  secret: vi.fn(),
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
    let operation = 'select';
    const result = () => ({
      data:
        table === 'user_report_email_queue' && operation === 'upsert'
          ? rows[table]
            ? null
            : { id: 'queue-1' }
          : table === 'user_report_email_queue' &&
              operation === 'update' &&
              ['queued', 'processing', 'sent'].includes(
                (rows[table] as { status?: string })?.status ?? ''
              )
            ? null
            : (rows[table] ?? null),
      error: table === errorTable ? new Error('db failed') : null,
    });
    const proxy = new Proxy(Promise.resolve(), {
      get(_target, property) {
        if (property === 'then') {
          const promise = Promise.resolve(result());
          return promise.then.bind(promise);
        }
        return (...args: unknown[]) => {
          if (['upsert', 'update'].includes(String(property)))
            operation = String(property);
          calls.push({ table, method: String(property), args });
          return proxy;
        };
      },
    });
    return proxy;
  };
  mocks.admin.mockResolvedValue({ schema: () => ({ from }) });
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
  it('does not overwrite an active queue row when a stale report still says draft', async () => {
    const calls = database({
      user_report_email_queue: { id: 'queue-1', status: 'processing' },
    });
    expect((await POST(request('send'), context)).status).toBe(409);
    expect(calls).toContainEqual({
      table: 'user_report_email_queue',
      method: 'or',
      args: [
        'and(status.in.(failed,blocked,cancelled),or(sent_at.is.null,delivery_kind.eq.test)),and(status.eq.sent,delivery_kind.eq.test)',
      ],
    });
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
    expect(calls).toContainEqual(
      expect.objectContaining({
        table: 'user_report_email_queue',
        method: 'upsert',
        args: [
          expect.objectContaining({
            recipient_email: 'user@example.com',
            ws_id: 'workspace-1',
            delivery_kind: 'send',
          }),
          { onConflict: 'report_id', ignoreDuplicates: true },
        ],
      })
    );
  });
});
