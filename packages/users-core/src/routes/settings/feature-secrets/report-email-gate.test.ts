import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  resolve: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/users-core/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/users-core/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: mocks.resolve,
}));
vi.mock('next/navigation', () => ({ unstable_rethrow: vi.fn() }));

import { PUT } from './[secretName]/route';

const flag = 'ENABLE_REPORT_EMAIL_SENDING';
function request(value: unknown = 'true', secretName = flag) {
  return PUT(
    new Request('https://contacts.example/api/gate', {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
    { params: Promise.resolve({ wsId: 'workspace-alias', secretName }) }
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue('workspace-1');
  mocks.permissions.mockResolvedValue({
    withoutPermission: () => false,
    containsPermission: () => true,
  });
  mocks.select.mockResolvedValue({
    data: [{ id: 'flag-1' }, { id: 'flag-2' }],
    error: null,
  });
  const builder = { eq: mocks.eq, select: mocks.select };
  mocks.eq.mockReturnValue(builder);
  mocks.update.mockReturnValue(builder);
  mocks.insert.mockResolvedValue({ error: null });
  mocks.admin.mockResolvedValue({
    from: vi.fn((table: string) => {
      expect(table).toBe('workspace_secrets');
      return { update: mocks.update, insert: mocks.insert };
    }),
  });
});
it('permits the explicitly authorized report flag without returning credentials and repairs all matching duplicate flags', async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ message: 'success' });
  expect(mocks.update).toHaveBeenCalledWith({ value: 'true' });
  expect(mocks.permissions).toHaveBeenCalledWith(
    'workspace-1',
    expect.any(Request)
  );
  expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'workspace-1');
  expect(mocks.eq).toHaveBeenCalledWith('name', flag);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it.each(['manage_workspace_secrets', 'send_user_group_report_emails'])(
  'denies the report flag without %s',
  async (missing) => {
    mocks.permissions.mockResolvedValue({
      withoutPermission: (p: string) => p === missing,
      containsPermission: (p: string) => p !== missing,
    });
    expect((await request()).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  }
);
it('denies a missing session before secret access', async () => {
  mocks.permissions.mockResolvedValue(null);
  expect((await request()).status).toBe(404);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it.each(['credential-value', 'TRUE', true, 0, null])(
  'rejects nonliteral gate value %s',
  async (value) => {
    expect((await request(value)).status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  }
);
it.each(['ENABLE_EMAIL_SENDING', 'SMTP_PASSWORD', 'unknown'])(
  'does not expose or alter unrelated secret %s',
  async (name) => {
    expect((await request('true', name)).status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
  }
);
it('inserts only the report flag when it has never been configured', async () => {
  mocks.select.mockResolvedValue({ data: [], error: null });
  expect((await request('false')).status).toBe(200);
  expect(mocks.insert).toHaveBeenCalledWith({
    name: flag,
    value: 'false',
    ws_id: 'workspace-1',
  });
});

it('retains the existing topic-only administrator permission contract', async () => {
  mocks.permissions.mockResolvedValue({
    withoutPermission: (p: string) => p === 'send_user_group_report_emails',
    containsPermission: (p: string) => p !== 'send_user_group_report_emails',
  });
  expect((await request('true', 'ENABLE_TOPIC_ANNOUNCEMENTS')).status).toBe(
    200
  );
});
it('rejects malformed JSON without a write', async () => {
  const response = await PUT(
    new Request('https://contacts.example/api/gate', {
      method: 'PUT',
      body: '{broken',
    }),
    { params: Promise.resolve({ wsId: 'workspace-alias', secretName: flag }) }
  );
  expect(response.status).toBe(400);
  expect(mocks.admin).not.toHaveBeenCalled();
});
