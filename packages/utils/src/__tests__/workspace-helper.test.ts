import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateAdminClient, mockCreateClient } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mockCreateAdminClient,
  createClient: mockCreateClient,
}));

import {
  getWorkspace,
  getWorkspaces,
  normalizeWorkspaceId,
} from '../workspace-helper';

describe('workspace-helper tier lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a workspace tier through workspace_subscriptions without joining protected product tables', async () => {
    const workspaceQuery = createSingleWorkspaceQuery({
      id: 'ws-1',
      name: 'Workspace One',
      personal: false,
      workspace_members: [{ user_id: 'user-1' }],
    });
    const subscriptionQuery = createSubscriptionLookupQuery([
      {
        ws_id: 'ws-1',
        created_at: '2026-03-10T00:00:00.000Z',
        status: 'active',
        workspace_subscription_products: { tier: 'PRO' },
      },
    ]);

    mockCreateClient.mockResolvedValue(
      createUserClient({
        userId: 'user-1',
        workspaceQuery,
      })
    );
    mockCreateAdminClient.mockResolvedValue(
      createAdminClient({ subscriptionQuery })
    );

    const workspace = await getWorkspace('ws-1');

    expect(workspace?.id).toBe('ws-1');
    expect(workspace?.joined).toBe(true);
    expect(workspace?.tier).toBe('PRO');
    expect(workspaceQuery.select).toHaveBeenCalledWith(
      '*, workspace_members!inner(user_id)'
    );
    expect(subscriptionQuery.select).toHaveBeenCalledWith(
      'ws_id, created_at, status, workspace_subscription_products(tier)'
    );
  });

  it('hydrates workspace list tiers from the subscription lookup query', async () => {
    const workspacesQuery = createWorkspacesQuery([
      {
        id: 'ws-1',
        name: 'Workspace One',
        avatar_url: null,
        logo_url: null,
        personal: false,
        created_at: '2026-03-10T00:00:00.000Z',
        workspace_members: [{ user_id: 'user-1' }],
      },
      {
        id: 'ws-2',
        name: 'Workspace Two',
        avatar_url: null,
        logo_url: null,
        personal: false,
        created_at: '2026-03-11T00:00:00.000Z',
        workspace_members: [{ user_id: 'user-1' }],
      },
    ]);
    const subscriptionQuery = createSubscriptionLookupQuery([
      {
        ws_id: 'ws-1',
        created_at: '2026-03-10T00:00:00.000Z',
        status: 'active',
        workspace_subscription_products: { tier: 'PLUS' },
      },
      {
        ws_id: 'ws-2',
        created_at: '2026-03-11T00:00:00.000Z',
        status: 'canceled',
        workspace_subscription_products: { tier: 'ENTERPRISE' },
      },
    ]);

    mockCreateClient.mockResolvedValue(
      createUserClient({
        userId: 'user-1',
        workspacesQuery,
      })
    );
    mockCreateAdminClient.mockResolvedValue(
      createAdminClient({ subscriptionQuery })
    );

    const workspaces = await getWorkspaces();

    expect(workspaces).toEqual([
      expect.objectContaining({ id: 'ws-1', tier: 'PLUS' }),
      expect.objectContaining({ id: 'ws-2', tier: null }),
    ]);
    expect(workspacesQuery.select).toHaveBeenCalledWith(
      'id, name, avatar_url, logo_url, personal, created_at, workspace_members!inner(user_id)'
    );
    expect(subscriptionQuery.in).toHaveBeenCalledWith('ws_id', [
      'ws-1',
      'ws-2',
    ]);
  });
});

describe('normalizeWorkspaceId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps root workspace UUID unchanged without resolving personal workspace', async () => {
    const rootWorkspaceId = '00000000-0000-0000-0000-000000000000';
    const fromMock = vi.fn();
    const getUserMock = vi.fn();

    mockCreateClient.mockResolvedValue({
      auth: { getUser: getUserMock },
      from: fromMock,
    });

    const resolved = await normalizeWorkspaceId(rootWorkspaceId);

    expect(resolved).toBe(rootWorkspaceId);
    expect(getUserMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('maps internal slug to root workspace UUID without personal workspace lookup', async () => {
    const rootWorkspaceId = '00000000-0000-0000-0000-000000000000';
    const fromMock = vi.fn();
    const getUserMock = vi.fn();

    mockCreateClient.mockResolvedValue({
      auth: { getUser: getUserMock },
      from: fromMock,
    });

    const resolved = await normalizeWorkspaceId('internal');

    expect(resolved).toBe(rootWorkspaceId);
    expect(getUserMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('resolves personal slug to the authenticated user personal workspace', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };

    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({
      data: { id: 'personal-ws-id' },
      error: null,
    });

    const getUserMock = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    const fromMock = vi.fn((table: string) => {
      if (table !== 'workspaces') {
        throw new Error(`Unexpected table lookup: ${table}`);
      }
      return query;
    });

    mockCreateClient.mockResolvedValue({
      auth: { getUser: getUserMock },
      from: fromMock,
    });

    const resolved = await normalizeWorkspaceId('personal');

    expect(resolved).toBe('personal-ws-id');
    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('workspaces');
    expect(query.select).toHaveBeenCalledWith(
      'id, workspace_members!inner(user_id)'
    );
    expect(query.eq).toHaveBeenCalledWith('personal', true);
    expect(query.eq).toHaveBeenCalledWith(
      'workspace_members.user_id',
      'user-1'
    );
  });
});

function createUserClient({
  userId,
  workspaceQuery,
  workspacesQuery,
}: {
  userId: string;
  workspaceQuery?: ReturnType<typeof createSingleWorkspaceQuery>;
  workspacesQuery?: ReturnType<typeof createWorkspacesQuery>;
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId, email: 'user@example.com' } },
      }),
    },
    from: vi.fn((table: string) => {
      if (table !== 'workspaces') {
        throw new Error(`Unexpected table lookup: ${table}`);
      }

      if (workspaceQuery) return workspaceQuery;
      if (workspacesQuery) return workspacesQuery;

      throw new Error('Missing workspace query mock');
    }),
  };
}

function createAdminClient({
  subscriptionQuery,
}: {
  subscriptionQuery: ReturnType<typeof createSubscriptionLookupQuery>;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'workspace_subscriptions') {
        throw new Error(`Unexpected admin table lookup: ${table}`);
      }

      return subscriptionQuery;
    }),
  };
}

function createSingleWorkspaceQuery(data: Record<string, unknown>) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.single.mockResolvedValue({ data, error: null });

  return query;
}

function createWorkspacesQuery(data: Array<Record<string, unknown>>) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
  };

  query.select.mockReturnValue(query);
  query.eq.mockResolvedValue({ data, error: null });

  return query;
}

function createSubscriptionLookupQuery(data: Array<Record<string, unknown>>) {
  const query = {
    select: vi.fn(),
    in: vi.fn(),
  };

  query.select.mockReturnValue(query);
  query.in.mockResolvedValue({ data, error: null });

  return query;
}
