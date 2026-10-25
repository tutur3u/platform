import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeSupabase,
  type Db,
  datasetUrl,
  request,
  seedDb,
} from '../dataset-route-fixtures';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  logApiKeyUsage: vi.fn(),
  requestHeaders: new Headers(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));

vi.mock('next/headers', () => ({
  headers: async () => mocks.requestHeaders,
}));

vi.mock('@tuturuuu/auth/api-keys', async () => {
  const { validateFixtureApiKey } = await import('../dataset-route-fixtures');
  return {
    logApiKeyUsage: mocks.logApiKeyUsage,
    validateApiKey: async (key: string) => validateFixtureApiKey(key),
  };
});

vi.mock('@/lib/workspace-api-key', async () => {
  const { validateFixtureApiKey } = await import('../dataset-route-fixtures');
  return {
    validateWorkspaceApiKey: async (wsId: string, key: string) =>
      validateFixtureApiKey(key)?.wsId === wsId,
  };
});

import { GET as getFull } from './full/route';
import { DELETE, PUT } from './route';

function params(wsId: string, datasetId: string) {
  return { params: Promise.resolve({ wsId, datasetId }) };
}

describe('dataset routes bind API-key access to the URL workspace', () => {
  let db: Db;

  beforeEach(() => {
    vi.clearAllMocks();
    db = seedDb();
    mocks.requestHeaders = new Headers({ API_KEY: 'ttr_key_a' });
    mocks.createAdminClient.mockImplementation(async () =>
      createFakeSupabase(db)
    );
    mocks.createClient.mockImplementation(async () => createFakeSupabase(db));
  });

  const datasetB = () =>
    db.workspace_datasets?.find((row) => row.id === 'ds-b');

  describe('workspace A key + workspace B dataset', () => {
    it('GET /full does not return workspace B cells', async () => {
      const response = await getFull(
        request(`${datasetUrl('ws-a', 'ds-b')}/full`),
        params('ws-a', 'ds-b')
      );

      expect(response.status).toBe(404);
      expect(JSON.stringify(await response.json())).not.toContain('b-secret');
    });

    it('PUT does not update workspace B', async () => {
      const response = await PUT(
        request(datasetUrl('ws-a', 'ds-b'), {
          method: 'PUT',
          body: { name: 'pwned' },
        }),
        params('ws-a', 'ds-b')
      );

      expect(response.status).toBe(404);
      expect(datasetB()).toMatchObject({ name: 'Dataset B', ws_id: 'ws-b' });
    });

    it('DELETE does not delete workspace B', async () => {
      const response = await DELETE(
        request(datasetUrl('ws-a', 'ds-b'), { method: 'DELETE' }),
        params('ws-a', 'ds-b')
      );

      expect(response.status).toBe(404);
      expect(datasetB()).toBeDefined();
    });
  });

  describe('same-workspace API key access', () => {
    it('GET /full returns only the requested dataset cells', async () => {
      const response = await getFull(
        request(`${datasetUrl('ws-a', 'ds-a')}/full`),
        params('ws-a', 'ds-a')
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        data: [{ row_id: 'row-a', cells: { value: 'a' } }],
      });
      expect(mocks.createAdminClient).toHaveBeenCalled();
    });

    it('PUT updates allowlisted fields', async () => {
      const response = await PUT(
        request(datasetUrl('ws-a', 'ds-a'), {
          method: 'PUT',
          body: { id: 'ds-a', name: 'Renamed', description: 'Updated' },
        }),
        params('ws-a', 'ds-a')
      );

      expect(response.status).toBe(200);
      expect(db.workspace_datasets?.find((row) => row.id === 'ds-a')).toEqual({
        id: 'ds-a',
        ws_id: 'ws-a',
        name: 'Renamed',
        description: 'Updated',
      });
      expect(datasetB()).toMatchObject({ name: 'Dataset B' });
    });

    it('DELETE removes only the requested dataset', async () => {
      const response = await DELETE(
        request(datasetUrl('ws-a', 'ds-a'), { method: 'DELETE' }),
        params('ws-a', 'ds-a')
      );

      expect(response.status).toBe(200);
      expect(db.workspace_datasets?.map((row) => row.id)).toEqual(['ds-b']);
    });
  });

  describe('update payload allowlist', () => {
    it('rejects reparenting through ws_id', async () => {
      const response = await PUT(
        request(datasetUrl('ws-a', 'ds-a'), {
          method: 'PUT',
          body: { name: 'Moved', ws_id: 'ws-b' },
        }),
        params('ws-a', 'ds-a')
      );

      expect(response.status).toBe(400);
      expect(db.workspace_datasets?.find((row) => row.id === 'ds-a')).toEqual(
        seedDb().workspace_datasets?.[0]
      );
    });

    it('rejects unknown fields and a mismatched body id', async () => {
      const unknownField = await PUT(
        request(datasetUrl('ws-a', 'ds-a'), {
          method: 'PUT',
          body: { name: 'x', created_at: '2000-01-01' },
        }),
        params('ws-a', 'ds-a')
      );
      const otherId = await PUT(
        request(datasetUrl('ws-a', 'ds-a'), {
          method: 'PUT',
          body: { id: 'ds-b', name: 'x' },
        }),
        params('ws-a', 'ds-a')
      );

      expect(unknownField.status).toBe(400);
      expect(otherId.status).toBe(400);
      expect(db).toEqual(seedDb());
    });
  });

  describe('API key authorization', () => {
    it('rejects a key issued for another workspace', async () => {
      const response = await DELETE(
        request(datasetUrl('ws-b', 'ds-b'), { method: 'DELETE' }),
        params('ws-b', 'ds-b')
      );

      expect(response.status).toBe(401);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      expect(datasetB()).toBeDefined();
    });

    it('rejects a same-workspace key without the ai_lab permission', async () => {
      mocks.requestHeaders = new Headers({ API_KEY: 'ttr_key_a_no_ai_lab' });

      const response = await DELETE(
        request(datasetUrl('ws-a', 'ds-a'), { method: 'DELETE' }),
        params('ws-a', 'ds-a')
      );

      expect(response.status).toBe(403);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      expect(db).toEqual(seedDb());
    });
  });

  describe('session access', () => {
    beforeEach(() => {
      mocks.requestHeaders = new Headers();
    });

    it('uses the RLS client and still binds the dataset to the URL workspace', async () => {
      const crossWorkspace = await DELETE(
        request(datasetUrl('ws-a', 'ds-b'), { method: 'DELETE' }),
        params('ws-a', 'ds-b')
      );
      const sameWorkspace = await PUT(
        request(datasetUrl('ws-a', 'ds-a'), {
          method: 'PUT',
          body: { name: 'Session rename' },
        }),
        params('ws-a', 'ds-a')
      );

      expect(crossWorkspace.status).toBe(404);
      expect(datasetB()).toBeDefined();
      expect(sameWorkspace.status).toBe(200);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    });
  });

  describe('API key usage logging', () => {
    const usageLogs = () =>
      mocks.logApiKeyUsage.mock.calls.map(([entry]) => entry);

    beforeEach(() => {
      mocks.requestHeaders = new Headers({
        API_KEY: 'ttr_key_a',
        'user-agent': 'probe-agent/1.0',
      });
    });

    it('records an allowed same-workspace request', async () => {
      const response = await getFull(
        request(`${datasetUrl('ws-a', 'ds-a')}/full?limit=5`),
        params('ws-a', 'ds-a')
      );

      expect(response.status).toBe(200);
      expect(usageLogs()).toEqual([
        {
          apiKeyId: 'key-a',
          wsId: 'ws-a',
          endpoint: '/api/v1/workspaces/ws-a/datasets/ds-a/full',
          method: 'GET',
          statusCode: 200,
          ipAddress: expect.any(String),
          userAgent: 'probe-agent/1.0',
          responseTimeMs: expect.any(Number),
          errorMessage: null,
        },
      ]);
    });

    it('records a denied cross-workspace attempt without the request body', async () => {
      const response = await PUT(
        request(datasetUrl('ws-a', 'ds-b'), {
          method: 'PUT',
          body: { name: 'pwned-body-value' },
        }),
        params('ws-a', 'ds-b')
      );

      expect(response.status).toBe(404);
      expect(usageLogs()).toEqual([
        expect.objectContaining({
          apiKeyId: 'key-a',
          wsId: 'ws-a',
          endpoint: '/api/v1/workspaces/ws-a/datasets/ds-b',
          method: 'PUT',
          statusCode: 404,
          errorMessage: 'Dataset not found in workspace',
        }),
      ]);
      expect(JSON.stringify(usageLogs())).not.toContain('pwned-body-value');
      expect(JSON.stringify(usageLogs())).not.toContain('ttr_key_a');
    });

    it('records permission and workspace-mismatch denials under the key workspace', async () => {
      const otherWorkspace = await DELETE(
        request(datasetUrl('ws-b', 'ds-b'), { method: 'DELETE' }),
        params('ws-b', 'ds-b')
      );
      mocks.requestHeaders = new Headers({ API_KEY: 'ttr_key_a_no_ai_lab' });
      const noPermission = await DELETE(
        request(datasetUrl('ws-a', 'ds-a'), { method: 'DELETE' }),
        params('ws-a', 'ds-a')
      );

      expect(otherWorkspace.status).toBe(401);
      expect(noPermission.status).toBe(403);
      expect(usageLogs()).toEqual([
        expect.objectContaining({
          apiKeyId: 'key-a',
          wsId: 'ws-a',
          endpoint: '/api/v1/workspaces/ws-b/datasets/ds-b',
          method: 'DELETE',
          statusCode: 401,
          errorMessage: 'API key workspace mismatch',
        }),
        expect.objectContaining({
          apiKeyId: 'key-a2',
          wsId: 'ws-a',
          method: 'DELETE',
          statusCode: 403,
          errorMessage: 'API key lacks ai_lab permission',
        }),
      ]);
    });

    it('records rejected update payloads', async () => {
      const response = await PUT(
        request(datasetUrl('ws-a', 'ds-a'), {
          method: 'PUT',
          body: { name: 'Moved', ws_id: 'ws-b' },
        }),
        params('ws-a', 'ds-a')
      );

      expect(response.status).toBe(400);
      expect(usageLogs()).toEqual([
        expect.objectContaining({ method: 'PUT', statusCode: 400 }),
      ]);
    });

    it('does not log session requests or unverifiable keys', async () => {
      mocks.requestHeaders = new Headers();
      await DELETE(
        request(datasetUrl('ws-a', 'ds-a'), { method: 'DELETE' }),
        params('ws-a', 'ds-a')
      );
      mocks.requestHeaders = new Headers({ API_KEY: 'ttr_unknown' });
      const unknownKey = await DELETE(
        request(datasetUrl('ws-a', 'ds-b'), { method: 'DELETE' }),
        params('ws-a', 'ds-b')
      );

      expect(unknownKey.status).toBe(401);
      expect(mocks.logApiKeyUsage).not.toHaveBeenCalled();
    });
  });
});
