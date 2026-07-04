import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  getPostEmailMaxAgeCutoff: vi.fn(),
  privateRpc: vi.fn(),
  serverLoggerError: vi.fn(),
}));

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
}));

vi.mock('@/lib/post-email-queue', () => ({
  getPostEmailMaxAgeCutoff: (
    ...args: Parameters<typeof mocks.getPostEmailMaxAgeCutoff>
  ) => mocks.getPostEmailMaxAgeCutoff(...args),
}));

import { GET } from './route';

describe('post filter options route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({
      schema: vi.fn((schema: string) => {
        expect(schema).toBe('private');
        return { rpc: mocks.privateRpc };
      }),
    });
    mocks.getPermissions.mockResolvedValue({ containsPermission: vi.fn() });
    mocks.getPostEmailMaxAgeCutoff.mockReturnValue('2026-05-01T00:00:00.000Z');
    mocks.privateRpc.mockResolvedValue({
      data: [
        {
          amount: 2,
          id: 'group-1',
          label: 'Group 1',
          option_scope: 'include_group',
        },
        {
          amount: 1,
          id: 'group-2',
          label: 'Group 2',
          option_scope: 'exclude_group',
        },
        {
          amount: null,
          id: 'user-1',
          label: 'User 1',
          option_scope: 'user',
        },
      ],
      error: null,
    });
  });

  it('rejects unauthorized callers before creating an admin client', async () => {
    mocks.getPermissions.mockResolvedValueOnce(null);

    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/posts/filter-options'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: 'Unauthorized',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.privateRpc).not.toHaveBeenCalled();
  });

  it('loads filter options through the admin-owned private RPC', async () => {
    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/posts/filter-options?includedGroups=group-a&includedGroups=group-b'
    );

    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      excludedUserGroups: [{ amount: 1, id: 'group-2', name: 'Group 2' }],
      userGroups: [{ amount: 2, id: 'group-1', name: 'Group 1' }],
      users: [{ full_name: 'User 1', id: 'user-1' }],
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      request,
      wsId: 'ws-1',
    });
    expect(mocks.createAdminClient).toHaveBeenCalled();
    expect(mocks.privateRpc).toHaveBeenCalledWith(
      'get_workspace_post_review_filter_options',
      {
        p_cutoff: '2026-05-01T00:00:00.000Z',
        p_included_group_ids: ['group-a', 'group-b'],
        p_ws_id: 'ws-1',
      }
    );
  });

  it('logs private RPC failures through the server logger', async () => {
    const error = { message: 'rpc failed' };
    mocks.privateRpc.mockResolvedValueOnce({ data: null, error });

    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/posts/filter-options'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Failed to load filter options',
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error loading post filter options',
      { error }
    );
  });
});
