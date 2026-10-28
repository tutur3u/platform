import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  creatorId: 'owner-user',
  resolveWorkspaceRouteAccess: vi.fn(),
  writes: [] as Array<{ rows: unknown; table: string }>,
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.resolveWorkspaceRouteAccess,
}));

function createQuery(table: string) {
  const result = () =>
    table === 'workspaces'
      ? { data: { creator_id: mocks.creatorId }, error: null }
      : { data: { id: 'new-role' }, error: null };
  const query: Record<string, unknown> = {};
  for (const op of ['delete', 'eq', 'in', 'select']) query[op] = () => query;
  for (const op of ['insert', 'upsert']) {
    query[op] = (rows: unknown) => {
      mocks.writes.push({ rows, table });
      return query;
    };
  }
  query.maybeSingle = async () => result();
  query.single = async () => result();
  // biome-ignore lint/suspicious/noThenProperty: mimics the awaitable query builder.
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve);
  return query;
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: vi.fn((table: string) => createQuery(table)),
  })),
}));

import { PUT } from './default/route';
import { POST } from './route';

const permissions = [
  { enabled: true, id: 'manage_subscription' },
  { enabled: true, id: 'manage_finance' },
];

const writtenPermissions = (table: string) =>
  mocks.writes
    .filter((write) => write.table === table)
    .flatMap((write) => write.rows as Array<{ permission: string }>)
    .map((row) => row.permission);

function request(method: 'POST' | 'PUT') {
  return new Request('http://localhost/roles', {
    body: JSON.stringify({ name: 'Finance', permissions }),
    method,
  });
}

const params = { params: Promise.resolve({ wsId: 'workspace-id' }) };

describe('workspace role writes with creator-grant permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writes.length = 0;
    mocks.creatorId = 'owner-user';
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: { wsId: 'workspace-id' },
      user: { id: 'admin-user' },
    });
  });

  it('drops manage_subscription when a non-creator creates a role', async () => {
    const response = await POST(request('POST'), params);

    expect(response.status).toBe(200);
    expect(writtenPermissions('workspace_role_permissions')).toEqual([
      'manage_finance',
    ]);
  });

  it('keeps manage_subscription when the creator creates a role', async () => {
    mocks.creatorId = 'admin-user';
    const response = await POST(request('POST'), params);

    expect(response.status).toBe(200);
    expect(writtenPermissions('workspace_role_permissions')).toEqual([
      'manage_subscription',
      'manage_finance',
    ]);
  });

  it('drops manage_subscription when a non-creator saves default permissions', async () => {
    const response = await PUT(request('PUT'), params);

    expect(response.status).toBe(200);
    expect(writtenPermissions('workspace_default_permissions')).toEqual([
      'manage_finance',
    ]);
  });

  it('keeps manage_subscription when the creator saves default permissions', async () => {
    mocks.creatorId = 'admin-user';
    const response = await PUT(request('PUT'), params);

    expect(response.status).toBe(200);
    expect(writtenPermissions('workspace_default_permissions')).toEqual([
      'manage_subscription',
      'manage_finance',
    ]);
  });
});
