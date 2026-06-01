import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cancelQueuedPostEmails: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  enqueueApprovedPostEmails: vi.fn(),
  getPermissions: vi.fn(),
  getPostEmailQueueRows: vi.fn(),
  hasPostEmailBeenSent: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  summarizePostEmailQueue: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

vi.mock('@/lib/post-email-queue', () => ({
  cancelQueuedPostEmails: (
    ...args: Parameters<typeof mocks.cancelQueuedPostEmails>
  ) => mocks.cancelQueuedPostEmails(...args),
  enqueueApprovedPostEmails: (
    ...args: Parameters<typeof mocks.enqueueApprovedPostEmails>
  ) => mocks.enqueueApprovedPostEmails(...args),
  getPostEmailQueueRows: (
    ...args: Parameters<typeof mocks.getPostEmailQueueRows>
  ) => mocks.getPostEmailQueueRows(...args),
  hasPostEmailBeenSent: (
    ...args: Parameters<typeof mocks.hasPostEmailBeenSent>
  ) => mocks.hasPostEmailBeenSent(...args),
  summarizePostEmailQueue: (
    ...args: Parameters<typeof mocks.summarizePostEmailQueue>
  ) => mocks.summarizePostEmailQueue(...args),
}));

import { GET, PUT } from './route';

type QueryResult = {
  count?: number | null;
  data: unknown;
  error: null;
};

function createThenableQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    order: vi.fn(() => query),
    range: vi.fn(() => Promise.resolve(result)),
    select: vi.fn(() => query),
  };

  Object.defineProperty(query, 'then', {
    value: (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  });

  return query;
}

function createAdminMock(results: QueryResult[] = []) {
  const privateDb = {
    from: vi.fn(() => {
      const result = results.shift();
      if (!result) {
        throw new Error('Unexpected private table query');
      }
      return createThenableQuery(result);
    }),
  };

  return {
    admin: {
      schema: vi.fn(() => privateDb),
    },
    privateDb,
  };
}

function permissions(permissionIds: string[]) {
  const permissionSet = new Set(permissionIds);

  return {
    containsPermission: vi.fn((permission: string) =>
      permissionSet.has(permission)
    ),
    permissions: permissionIds,
    withoutPermission: vi.fn(
      (permission: string) => !permissionSet.has(permission)
    ),
  };
}

describe('workspace approvals API post permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.getPostEmailQueueRows.mockResolvedValue([]);
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.summarizePostEmailQueue.mockReturnValue({
      cancelled: 0,
      failed: 0,
      pending: 0,
      processing: 0,
      sent: 0,
    });
  });

  it('rejects post approval list access for send-email-only users', async () => {
    const { admin, privateDb } = createAdminMock();
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.getPermissions.mockResolvedValue(
      permissions(['send_user_group_post_emails'])
    );

    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/users/approvals?kind=posts'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Unauthorized',
    });
    expect(privateDb.from).not.toHaveBeenCalled();
  });

  it('allows post approval list access for approve_posts users', async () => {
    const { admin } = createAdminMock([
      { count: 0, data: [], error: null },
      { data: [], error: null },
    ]);
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.getPermissions.mockResolvedValue(permissions(['approve_posts']));

    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/users/approvals?kind=posts'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [],
      totalCount: 0,
      totalPages: 0,
    });
  });

  it('rejects post approval mutations for send-email-only users', async () => {
    const { admin, privateDb } = createAdminMock();
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.getPermissions.mockResolvedValue(
      permissions(['send_user_group_post_emails'])
    );

    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/users/approvals',
      {
        body: JSON.stringify({
          action: 'approve',
          itemId:
            '00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002',
          kind: 'posts',
        }),
        method: 'PUT',
      }
    );
    const response = await PUT(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Unauthorized',
    });
    expect(mocks.resolveAuthenticatedSessionUser).not.toHaveBeenCalled();
    expect(privateDb.from).not.toHaveBeenCalled();
  });
});
