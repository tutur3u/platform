import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const adminRpcMock = vi.fn();
const rpcRangeMock = vi.fn();
const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof normalizeWorkspaceIdMock>
  ) => normalizeWorkspaceIdMock(...args),
}));

vi.mock('@/lib/require-attention-users', () => ({
  fetchRequireAttentionUserIds: vi.fn().mockResolvedValue(new Set()),
  withRequireAttentionFlag: vi.fn((users) => users),
}));

import { GET } from './route';

afterEach(() => {
  if (ORIGINAL_SUPABASE_URL === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  }
});

function createUsersDatabaseTableLookup() {
  return vi.fn((table: string) => {
    if (table !== 'workspace_user_groups_users') {
      throw new Error(`Unexpected table lookup: ${table}`);
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          })),
        })),
      })),
    };
  });
}

describe('workspace users database route query parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    normalizeWorkspaceIdMock.mockImplementation(async (wsId: string) => wsId);
    getPermissionsMock.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'view_users_private_info' ||
        permission === 'view_users_public_info',
    });

    rpcRangeMock.mockResolvedValue({
      data: [],
      error: null,
      count: 0,
    });
    const queryBuilderMock = {
      select: vi.fn(() => queryBuilderMock),
      order: vi.fn(() => queryBuilderMock),
      eq: vi.fn(() => queryBuilderMock),
      is: vi.fn(() => queryBuilderMock),
      gt: vi.fn(() => queryBuilderMock),
      range: rpcRangeMock,
    };
    adminRpcMock.mockReturnValue(queryBuilderMock);

    createAdminClientMock.mockResolvedValue({
      rpc: adminRpcMock,
      from: vi.fn(() => {
        throw new Error('Unexpected table lookup');
      }),
      schema: vi.fn(() => ({
        from: vi.fn(() => {
          throw new Error('Unexpected private table lookup');
        }),
      })),
    });
  });

  it('defaults omitted withPromotions to false while preserving repeated group filters', async () => {
    const request = new NextRequest(
      'http://localhost/api/v1/workspaces/ws-1/users/database?page=1&pageSize=10&status=active&linkStatus=virtual&requireAttention=all&groupMembership=all&includedGroups=group-a&includedGroups=group-b&excludedGroups=group-c',
      { method: 'GET' }
    );

    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    expect(adminRpcMock).toHaveBeenCalledWith(
      'get_workspace_users',
      {
        _ws_id: 'ws-1',
        included_groups: ['group-a', 'group-b'],
        excluded_groups: ['group-c'],
        search_query: '',
        include_archived: false,
        link_status: 'virtual',
        group_membership: 'all',
      },
      {
        count: 'exact',
      }
    );
    await expect(response.json()).resolves.toMatchObject({
      data: [],
      count: 0,
    });
  });

  it('derives archival_note from note for archived private rows', async () => {
    rpcRangeMock.mockResolvedValue({
      data: [
        {
          id: 'user-1',
          full_name: 'Alice',
          note: 'Moved to another class',
          archived: true,
          archived_until: null,
        },
      ],
      error: null,
      count: 1,
    });
    createAdminClientMock.mockResolvedValue({
      rpc: adminRpcMock,
      from: createUsersDatabaseTableLookup(),
      schema: vi.fn(() => ({
        from: vi.fn(() => {
          throw new Error('Unexpected private table lookup');
        }),
      })),
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/users/database?page=1&pageSize=10&status=archived'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          id: 'user-1',
          note: 'Moved to another class',
          archival_note: 'Moved to another class',
        },
      ],
      count: 1,
    });
  });

  it('omits archival_note for callers without private user info permission', async () => {
    getPermissionsMock.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'view_users_public_info',
    });
    rpcRangeMock.mockResolvedValue({
      data: [
        {
          id: 'user-1',
          full_name: 'Alice',
          note: 'Moved to another class',
          archived: true,
          archived_until: null,
        },
      ],
      error: null,
      count: 1,
    });
    createAdminClientMock.mockResolvedValue({
      rpc: adminRpcMock,
      from: createUsersDatabaseTableLookup(),
      schema: vi.fn(() => ({
        from: vi.fn(() => {
          throw new Error('Unexpected private table lookup');
        }),
      })),
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/users/database?page=1&pageSize=10&status=archived'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data[0]).toMatchObject({
      id: 'user-1',
      full_name: 'Alice',
    });
    expect(body.data[0]).not.toHaveProperty('note');
    expect(body.data[0]).not.toHaveProperty('archival_note');
  });

  it('canonicalizes Supabase public avatar URLs before returning rows', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      'https://current-project.supabase.co';
    rpcRangeMock.mockResolvedValue({
      data: [
        {
          id: 'user-1',
          full_name: 'Alice',
          avatar_url:
            'https://old-project.supabase.co/storage/v1/object/public/avatars/alice.jpg',
        },
      ],
      error: null,
      count: 1,
    });
    createAdminClientMock.mockResolvedValue({
      rpc: adminRpcMock,
      from: createUsersDatabaseTableLookup(),
      schema: vi.fn(() => ({
        from: vi.fn(() => {
          throw new Error('Unexpected private table lookup');
        }),
      })),
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/users/database?page=1&pageSize=10'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          avatar_url:
            'https://current-project.supabase.co/storage/v1/object/public/avatars/alice.jpg',
        },
      ],
    });
  });
});
