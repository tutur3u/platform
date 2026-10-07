import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  session: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
  createClient: async () => ({}),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  normalizeWorkspaceId: async () => 'workspace-1',
  verifySecret: async () => false,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.session,
}));
vi.mock('@/lib/post-email-queue', () => ({
  cancelQueuedPostEmails: vi.fn(),
  enqueueApprovedPostEmails: vi.fn(),
  getPostEmailQueueRows: vi.fn(),
  hasPostEmailBeenSent: vi.fn(),
  summarizePostEmailQueue: vi.fn(),
}));
vi.mock('@/lib/post-email-queue/enqueue-access', () => ({
  resolvePostEmailEnqueueAccess: async () => ({ allowed: false }),
}));

import { PUT } from './put';

const context = { params: Promise.resolve({ wsId: 'workspace-1' }) };
type Call = { table: string; method: string; args: unknown[] };
function database(linked = true) {
  const calls: Call[] = [];
  const rows = [
    { id: 'own', user_ws_id: 'workspace-1', group_ws_id: 'workspace-1' },
    { id: 'foreign-group', user_ws_id: 'workspace-1', group_ws_id: 'foreign' },
    {
      id: 'foreign-subject',
      user_ws_id: 'foreign',
      group_ws_id: 'workspace-1',
    },
    { id: 'foreign-both', user_ws_id: 'foreign', group_ws_id: 'foreign' },
  ].map((row) => ({
    ...row,
    report_approval_status: 'PENDING',
    delivery_status: 'draft',
  }));
  const from = (table: string) => {
    const filters = new Map<string, unknown>();
    const builder: Record<string, unknown> = {};
    const selected = () =>
      table === 'external_user_monthly_reports_workspace_view'
        ? rows.filter((row) =>
            [...filters].every(
              ([key, value]) => row[key as keyof typeof row] === value
            )
          )
        : [];
    for (const method of ['select', 'eq', 'in', 'update'])
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        if (method === 'eq') filters.set(String(args[0]), args[1]);
        return builder;
      };
    builder.maybeSingle = async () => ({
      data:
        table === 'workspace_user_linked_users'
          ? linked
            ? { virtual_user_id: 'workspace-actor' }
            : null
          : (selected()[0] ?? null),
      error: null,
    });
    // biome-ignore lint/suspicious/noThenProperty: actual awaited PostgREST builder contract.
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: selected(), error: null }).then(resolve);
    return builder;
  };
  mocks.admin.mockResolvedValue({
    from,
    schema: () => ({ from, rpc: vi.fn() }),
  });
  return calls;
}
function request(action: string, itemId?: string) {
  return new Request('https://platform.example.invalid/api/approvals', {
    method: 'PUT',
    body: JSON.stringify({
      action,
      kind: 'reports',
      itemId,
      reason: 'Human correction required',
    }),
  });
}
function writes(calls: Call[]) {
  return calls.filter((call) => call.method === 'update');
}
describe('Web periodic approval initial subject and group tenancy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions.mockResolvedValue({
      containsPermission: () => true,
      withoutPermission: () => true,
    });
    mocks.session.mockResolvedValue({ user: { id: 'verified-actor' } });
  });
  it.each(['approve', 'reject'])(
    'denies %s of own subject in foreign group with zero writes',
    async (action) => {
      const calls = database();
      const response = await PUT(request(action, 'foreign-group'), context);
      expect.soft(response.status).toBe(404);
      expect.soft(writes(calls)).toEqual([]);
    }
  );
  it.each(['approve', 'reject'])(
    'preserves %s foreign-subject denial',
    async (action) => {
      const calls = database();
      const response = await PUT(request(action, 'foreign-subject'), context);
      expect(response.status).toBe(404);
      expect(writes(calls)).toEqual([]);
    }
  );
  it.each(['approve', 'reject'])(
    'preserves permitted %s own-subject/own-group path and trusted attribution',
    async (action) => {
      const calls = database();
      const response = await PUT(request(action, 'own'), context);
      expect(response.status).toBe(200);
      expect(writes(calls)).toHaveLength(1);
      expect(writes(calls)[0]?.args[0]).toMatchObject(
        action === 'approve'
          ? {
              report_approval_status: 'APPROVED',
              approved_by: 'workspace-actor',
            }
          : {
              report_approval_status: 'REJECTED',
              rejected_by: 'workspace-actor',
            }
      );
    }
  );
  it('selects only own-subject AND own-group entries for the existing batch path', async () => {
    const calls = database();
    const response = await PUT(request('approveAll'), context);
    expect(response.status).toBe(200);
    expect(calls.find((call) => call.method === 'in')?.args).toEqual([
      'id',
      ['own'],
    ]);
  });
  it('preserves existing permission denial without report updates', async () => {
    mocks.permissions.mockResolvedValue({
      containsPermission: () => false,
      withoutPermission: () => true,
    });
    const calls = database();
    const response = await PUT(request('approve', 'own'), context);
    expect(response.status).toBe(403);
    expect(writes(calls)).toEqual([]);
  });
  it('preserves missing actor-link denial without report writes', async () => {
    const calls = database(false);
    const response = await PUT(request('approve', 'own'), context);
    expect(response.status).toBe(403);
    expect(writes(calls)).toEqual([]);
  });
});
