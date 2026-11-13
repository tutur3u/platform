import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiKey: null as string | null,
  canReadWorkspaceUsers: vi.fn(),
  createAdminClient: vi.fn(),
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
  createAdminClient: mocks.createAdminClient,
  createClient: vi.fn(),
}));
vi.mock('../../lib/workspace-api-key', () => ({
  validateWorkspaceApiKey: mocks.validateWorkspaceApiKey,
}));
vi.mock('../../lib/workspace-user-read-access', () => ({
  canReadWorkspaceUsers: mocks.canReadWorkspaceUsers,
  redactWorkspaceUser: (user: unknown) => user,
}));
vi.mock('./workspace-user-create', () => ({
  handleCreateWorkspaceUserRequest: vi.fn(),
}));

import { GET } from './list';

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

describe('workspace users API-key authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiKey = 'invalid-key';
    mocks.rpc.mockImplementation(() => rpcQuery());
    mocks.createAdminClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.validateWorkspaceApiKey.mockResolvedValue(false);
  });

  it('rejects an invalid key before creating an admin client or querying', async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: 'Invalid API key' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('queries after a valid key is authenticated', async () => {
    mocks.validateWorkspaceApiKey.mockResolvedValue(true);
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(
      mocks.validateWorkspaceApiKey.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.createAdminClient.mock.invocationCallOrder[0]!);
  });
});
