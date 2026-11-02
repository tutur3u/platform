import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiKey: null as string | null,
  getFinanceRouteContext: vi.fn(),
  rpc: vi.fn(),
  validateWorkspaceApiKey: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => mocks.apiKey }),
}));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.getFinanceRouteContext,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: async () => ({}),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ rpc: mocks.rpc }),
  createClient: vi.fn(),
}));
vi.mock('../../lib/workspace-api-key', () => ({
  validateWorkspaceApiKey: mocks.validateWorkspaceApiKey,
}));
vi.mock('../../lib/workspace-user-read-access', () => ({
  canReadWorkspaceUsers: () => true,
  redactWorkspaceUser: (user: unknown) => user,
}));
vi.mock('./workspace-user-create', () => ({
  handleCreateWorkspaceUserRequest: vi.fn(),
}));

import { GET } from './list';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';

function rpcQuery() {
  const query = {
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    // biome-ignore lint/suspicious/noThenProperty: mimics a PostgREST builder.
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: [{ id: 'learner' }], count: 1, error: null }),
  };
  return query;
}

function request(search = '') {
  const url = new URL(
    `https://contacts.example.com/api/v1/workspaces/ws/users${search}`
  );
  return { nextUrl: url, url: url.toString() } as never;
}

const params = { params: Promise.resolve({ wsId: 'ws' }) };

describe('GET workspace basic users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiKey = null;
    mocks.rpc.mockImplementation(() => rpcQuery());
    mocks.getFinanceRouteContext.mockImplementation(async () => ({
      context: {
        normalizedWsId: 'normalized-ws',
        permissions: {},
        sbAdmin: { rpc: mocks.rpc },
      },
    }));
    mocks.validateWorkspaceApiKey.mockResolvedValue(true);
  });

  it('lists every workspace user when no group is given (today)', async () => {
    const response = await GET(request('?q=Ada&limit=20'), params);
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_workspace_users',
      expect.objectContaining({
        _ws_id: 'normalized-ws',
        included_groups: [],
        search_query: 'Ada',
      }),
      { count: 'exact' }
    );
  });

  it('narrows the list to members of the given group', async () => {
    const response = await GET(request(`?groupId=${GROUP_ID}`), params);
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_workspace_users',
      expect.objectContaining({
        _ws_id: 'normalized-ws',
        included_groups: [GROUP_ID],
      }),
      { count: 'exact' }
    );
  });

  it('rejects a malformed group id before querying', async () => {
    const response = await GET(request('?groupId=not-a-uuid'), params);
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('applies the same group filter for API-key callers', async () => {
    mocks.apiKey = 'key';
    const response = await GET(request(`?groupId=${GROUP_ID}`), params);
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_workspace_users',
      expect.objectContaining({ _ws_id: 'ws', included_groups: [GROUP_ID] }),
      { count: 'exact' }
    );
  });
});
