import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeSupabase,
  type Db,
  datasetsUrl,
  request,
  seedDb,
} from './dataset-route-fixtures';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  logApiKeyUsage: vi.fn(),
  requestHeaders: new Headers(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: { id: 'actor-a' },
    authError: null,
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async ({ wsId }: { wsId: string }) => ({
    wsId,
    withoutPermission: () => false,
  }),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));

vi.mock('next/headers', () => ({
  headers: async () => mocks.requestHeaders,
}));

vi.mock('@tuturuuu/auth/api-keys', async () => {
  const { validateFixtureApiKey } = await import('./dataset-route-fixtures');
  return {
    logApiKeyUsage: mocks.logApiKeyUsage,
    validateApiKey: async (key: string) => validateFixtureApiKey(key),
  };
});

vi.mock('@/lib/workspace-api-key', async () => {
  const { validateFixtureApiKey } = await import('./dataset-route-fixtures');
  return {
    validateWorkspaceApiKey: async (wsId: string, key: string) =>
      validateFixtureApiKey(key)?.wsId === wsId,
  };
});

import { GET } from './route';

const params = (wsId: string) => ({ params: Promise.resolve({ wsId }) });

describe('dataset collection GET', () => {
  let db: Db;

  beforeEach(() => {
    vi.clearAllMocks();
    db = seedDb();
    mocks.createAdminClient.mockImplementation(async () =>
      createFakeSupabase(db)
    );
    mocks.createClient.mockImplementation(async () => createFakeSupabase(db));
  });

  it('lists only the key workspace datasets for a key with ai_lab', async () => {
    mocks.requestHeaders = new Headers({ API_KEY: 'ttr_key_a' });

    const response = await GET(request(datasetsUrl('ws-a')), params('ws-a'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [seedDb().workspace_datasets?.[0]],
      count: 1,
    });
    expect(mocks.logApiKeyUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: 'key-a',
        endpoint: '/api/v1/workspaces/ws-a/datasets',
        method: 'GET',
        statusCode: 200,
      })
    );
  });

  it('rejects and logs a same-workspace key without ai_lab', async () => {
    mocks.requestHeaders = new Headers({ API_KEY: 'ttr_key_a_no_ai_lab' });

    const response = await GET(request(datasetsUrl('ws-a')), params('ws-a'));

    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain('Dataset A');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.logApiKeyUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: 'key-a2',
        statusCode: 403,
        errorMessage: 'API key lacks ai_lab permission',
      })
    );
  });

  it('rejects a key for another workspace before any admin query', async () => {
    mocks.requestHeaders = new Headers({ API_KEY: 'ttr_key_a' });

    const response = await GET(request(datasetsUrl('ws-b')), params('ws-b'));

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('serves authorized session callers through admin with the array response', async () => {
    mocks.requestHeaders = new Headers();

    const response = await GET(request(datasetsUrl('ws-a')), params('ws-a'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      seedDb().workspace_datasets?.[0],
    ]);
    expect(mocks.createAdminClient).toHaveBeenCalled();
    expect(mocks.logApiKeyUsage).not.toHaveBeenCalled();
  });
});

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: async () => undefined };
});
