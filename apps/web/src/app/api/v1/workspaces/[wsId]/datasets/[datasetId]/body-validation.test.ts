import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeSupabase,
  type Db,
  datasetUrl,
  request,
  seedDb,
} from '../dataset-route-fixtures';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
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
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@tuturuuu/auth/api-keys', () => ({
  validateApiKey: vi.fn(),
  logApiKeyUsage: vi.fn(),
}));

import { NextRequest } from 'next/server';
import {
  DELETE as deleteCell,
  POST as postCell,
  PUT as putCell,
} from './cells/route';
import { PUT as putColumn } from './columns/[columnId]/route';
import { POST as postColumn } from './columns/route';

const params = (wsId: string, datasetId: string) => ({
  params: Promise.resolve({ wsId, datasetId }),
});
const columnParams = (columnId: string) => ({
  params: Promise.resolve({ wsId: 'ws-a', datasetId: 'ds-a', columnId }),
});
const base = datasetUrl('ws-a', 'ds-a');

describe('dataset write routes validate request bodies', () => {
  let db: Db;

  beforeEach(() => {
    vi.clearAllMocks();
    db = seedDb();
    mocks.createClient.mockImplementation(async () => createFakeSupabase(db));
    mocks.createAdminClient.mockImplementation(async () =>
      createFakeSupabase(db)
    );
  });

  describe('POST columns', () => {
    it('creates a column for a valid body', async () => {
      const response = await postColumn(
        request(`${base}/columns`, { method: 'POST', body: { name: ' f ' } }),
        params('ws-a', 'ds-a')
      );
      expect(response.status).toBe(200);
      expect(db.workspace_dataset_columns).toContainEqual(
        expect.objectContaining({ dataset_id: 'ds-a', name: 'f' })
      );
    });

    it.each([{}, { name: 5 }, { name: null }, []])(
      'returns 400 for invalid body %j',
      async (body) => {
        const response = await postColumn(
          request(`${base}/columns`, { method: 'POST', body }),
          params('ws-a', 'ds-a')
        );
        expect(response.status).toBe(400);
        expect(db).toEqual(seedDb());
      }
    );

    it('returns 400 for malformed JSON', async () => {
      const response = await postColumn(
        new NextRequest(`${base}/columns`, { method: 'POST', body: '{' }),
        params('ws-a', 'ds-a')
      );
      expect(response.status).toBe(400);
    });

    it('ignores extra fields', async () => {
      const response = await postColumn(
        request(`${base}/columns`, {
          method: 'POST',
          body: { name: 'g', dataset_id: 'ds-b', id: 'evil' },
        }),
        params('ws-a', 'ds-a')
      );
      expect(response.status).toBe(200);
      expect(db.workspace_dataset_columns).toContainEqual(
        expect.objectContaining({ dataset_id: 'ds-a', name: 'g' })
      );
      expect(db.workspace_dataset_columns?.some((c) => c.id === 'evil')).toBe(
        false
      );
    });
  });

  describe('PUT columns/[columnId]', () => {
    it('renames a column for a valid body', async () => {
      const response = await putColumn(
        request(`${base}/columns/col-a`, {
          method: 'PUT',
          body: { name: 'n' },
        }),
        columnParams('col-a')
      );
      expect(response.status).toBe(200);
      expect(db.workspace_dataset_columns?.[0]?.name).toBe('n');
    });

    it('returns 400 when name is not a string', async () => {
      const response = await putColumn(
        request(`${base}/columns/col-a`, { method: 'PUT', body: { name: 1 } }),
        columnParams('col-a')
      );
      expect(response.status).toBe(400);
      expect(db).toEqual(seedDb());
    });

    it('ignores extra fields', async () => {
      const response = await putColumn(
        request(`${base}/columns/col-a`, {
          method: 'PUT',
          body: { name: 'n', dataset_id: 'ds-b' },
        }),
        columnParams('col-a')
      );
      expect(response.status).toBe(200);
      expect(db.workspace_dataset_columns?.[0]).toEqual(
        expect.objectContaining({ dataset_id: 'ds-a', name: 'n' })
      );
    });
  });

  describe('cells', () => {
    it('accepts valid POST, PUT and DELETE bodies', async () => {
      const key = { rowId: 'row-a', columnId: 'col-a' };
      const post = await postCell(
        request(`${base}/cells`, {
          method: 'POST',
          body: { ...key, data: { any: 'json' } },
        }),
        params('ws-a', 'ds-a')
      );
      expect(post.status).toBe(200);
      const put = await putCell(
        request(`${base}/cells`, {
          method: 'PUT',
          body: { ...key, data: 'next' },
        }),
        params('ws-a', 'ds-a')
      );
      expect(put.status).toBe(200);
      const del = await deleteCell(
        request(`${base}/cells`, { method: 'DELETE', body: key }),
        params('ws-a', 'ds-a')
      );
      expect(del.status).toBe(200);
    });

    it.each([
      {},
      { rowId: 'row-a' },
      { rowId: 1, columnId: 'col-a' },
      { rowId: '', columnId: 'col-a' },
      { rowId: 'row-a', columnId: { $ne: null } },
    ])('returns 400 on POST/PUT/DELETE for invalid body %j', async (body) => {
      for (const [handler, method] of [
        [postCell, 'POST'],
        [putCell, 'PUT'],
        [deleteCell, 'DELETE'],
      ] as const) {
        const response = await handler(
          request(`${base}/cells`, { method, body }),
          params('ws-a', 'ds-a')
        );
        expect(response.status).toBe(400);
      }
      expect(db).toEqual(seedDb());
    });

    it('ignores extra fields instead of persisting them', async () => {
      const response = await postCell(
        request(`${base}/cells`, {
          method: 'POST',
          body: {
            rowId: 'row-a',
            columnId: 'col-a',
            data: 'x',
            dataset_id: 'ds-b',
          },
        }),
        params('ws-a', 'ds-a')
      );
      expect(response.status).toBe(200);
      const created = db.workspace_dataset_cells?.at(-1);
      expect(created).toEqual(
        expect.objectContaining({ dataset_id: 'ds-a', data: 'x' })
      );
    });
  });
});
