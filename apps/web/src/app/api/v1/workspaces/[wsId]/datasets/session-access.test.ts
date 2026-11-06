import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeSupabase,
  type Db,
  datasetsUrl,
  datasetUrl,
  request,
  seedDb,
} from './dataset-route-fixtures';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  resolveUser: vi.fn(),
  getPermissions: vi.fn(),
  from: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveUser,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@tuturuuu/auth/api-keys', () => ({
  validateApiKey: vi.fn(),
  logApiKeyUsage: vi.fn(),
}));

import * as cells from './[datasetId]/cells/route';
import * as column from './[datasetId]/columns/[columnId]/route';
import * as columns from './[datasetId]/columns/route';
import * as columnSync from './[datasetId]/columns/sync/route';
import * as detect from './[datasetId]/duplicates/detect/route';
import * as remove from './[datasetId]/duplicates/remove/route';
import * as full from './[datasetId]/full/route';
import * as item from './[datasetId]/route';
import * as rowClear from './[datasetId]/rows/clear/route';
import * as rows from './[datasetId]/rows/route';
import * as rowSync from './[datasetId]/rows/sync/route';
import * as collection from './route';

type Context = {
  params: Promise<{ wsId: string; datasetId: string; columnId: string }>;
};
type Handler = (request: NextRequest, context: Context) => Promise<Response>;
type RouteCase = {
  name: string;
  method: string;
  handler: Handler;
  collection?: boolean;
};
const routes: RouteCase[] = [
  { name: 'list', method: 'GET', handler: collection.GET, collection: true },
  {
    name: 'create',
    method: 'POST',
    handler: collection.POST,
    collection: true,
  },
  { name: 'update', method: 'PUT', handler: item.PUT },
  { name: 'delete', method: 'DELETE', handler: item.DELETE },
  { name: 'full', method: 'GET', handler: full.GET },
  { name: 'rows read', method: 'GET', handler: rows.GET },
  { name: 'rows insert', method: 'POST', handler: rows.POST },
  { name: 'rows update', method: 'PUT', handler: rows.PUT },
  { name: 'rows delete', method: 'DELETE', handler: rows.DELETE },
  { name: 'rows sync', method: 'POST', handler: rowSync.POST },
  { name: 'rows clear', method: 'POST', handler: rowClear.POST },
  { name: 'cells read', method: 'GET', handler: cells.GET },
  { name: 'cells insert', method: 'POST', handler: cells.POST },
  { name: 'cells update', method: 'PUT', handler: cells.PUT },
  { name: 'cells delete', method: 'DELETE', handler: cells.DELETE },
  { name: 'columns read', method: 'GET', handler: columns.GET },
  { name: 'columns insert', method: 'POST', handler: columns.POST },
  { name: 'columns delete', method: 'DELETE', handler: columns.DELETE },
  { name: 'column update', method: 'PUT', handler: column.PUT },
  { name: 'column delete', method: 'DELETE', handler: column.DELETE },
  { name: 'columns sync', method: 'POST', handler: columnSync.POST },
  { name: 'duplicate detect', method: 'POST', handler: detect.POST },
  { name: 'duplicate remove', method: 'POST', handler: remove.POST },
];
const context = (
  wsId = 'ws-a',
  datasetId = 'ds-a',
  columnId = 'col-a'
): Context => ({ params: Promise.resolve({ wsId, datasetId, columnId }) });
const invoke = (route: RouteCase, wsId: string, datasetId: string) =>
  route.handler(
    request(
      route.collection ? datasetsUrl(wsId) : datasetUrl(wsId, datasetId),
      {
        method: route.method,
        ...(route.method === 'GET'
          ? {}
          : {
              body: {
                name: 'attempt',
                ws_id: 'ws-b',
                dataset_id: 'ds-b',
                rowId: 'row-b',
                columnId: 'col-b',
                data: 'injected',
              },
            }),
      }
    ),
    context(wsId, datasetId, 'col-b')
  );

describe('every dataset endpoint enforces session workspace access', () => {
  let db: Db;
  beforeEach(() => {
    vi.clearAllMocks();
    db = seedDb();
    mocks.createClient.mockResolvedValue({
      from: () => {
        throw new Error('unexpected session data query');
      },
    });
    mocks.resolveUser.mockResolvedValue({
      user: { id: 'actor-a' },
      authError: null,
    });
    mocks.getPermissions.mockImplementation(
      async ({ wsId }: { wsId: string }) =>
        wsId === 'ws-a' ? { wsId, withoutPermission: () => false } : null
    );
    mocks.from.mockImplementation((table: string) =>
      createFakeSupabase(db).from(table)
    );
    mocks.createAdminClient.mockResolvedValue({ from: mocks.from });
  });

  it.each(routes)(
    '$name: anonymous is 401 before any dataset query',
    async (route) => {
      mocks.resolveUser.mockResolvedValue({ user: null, authError: null });
      const response = await invoke(route, 'ws-a', 'ds-a');
      expect(response.status).toBe(401);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.getPermissions).not.toHaveBeenCalled();
    }
  );
  it.each(routes)(
    '$name: a non-member gets 404 without a dataset query',
    async (route) => {
      const response = await invoke(route, 'ws-b', 'ds-b');
      expect(response.status).toBe(404);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
      expect(db).toEqual(seedDb());
    }
  );
  it.each(routes.filter((route) => !route.collection))(
    '$name: guessing a foreign dataset under an allowed workspace is 404',
    async (route) => {
      const response = await invoke(route, 'ws-a', 'ds-b');
      expect(response.status).toBe(404);
      expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
        'workspace_datasets',
      ]);
      expect(db).toEqual(seedDb());
    }
  );
  it.each(routes)(
    '$name: missing ai_lab denies access before dataset queries',
    async (route) => {
      mocks.getPermissions.mockResolvedValue({
        wsId: 'ws-a',
        withoutPermission: () => true,
      });
      expect((await invoke(route, 'ws-a', 'ds-a')).status).toBe(403);
      expect(mocks.from).not.toHaveBeenCalled();
    }
  );
  it('lists and reads member data via admin while preserving response contracts', async () => {
    expect(
      await (
        await collection.GET(request(datasetsUrl('ws-a')), context())
      ).json()
    ).toEqual([seedDb().workspace_datasets?.[0]]);
    const response = await full.GET(
      request(datasetUrl('ws-a', 'ds-a')),
      context()
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain('a');
    for (const handler of [cells.GET, rows.GET, columns.GET]) {
      const res = await handler(request(datasetUrl('ws-a', 'ds-a')), context());
      expect(res.status).toBe(200);
      expect(JSON.stringify(await res.json())).not.toContain('b-secret');
    }
  });
  it('creates member datasets with the verified workspace', async () => {
    const response = await collection.POST(
      request(datasetsUrl('ws-a'), {
        method: 'POST',
        body: { name: 'member dataset' },
      }),
      context()
    );
    expect(response.status).toBe(200);
    expect(db.workspace_datasets?.at(-1)).toMatchObject({
      name: 'member dataset',
      ws_id: 'ws-a',
    });
  });
  it('rejects a client-supplied workspace in dataset creation', async () => {
    const response = await collection.POST(
      request(datasetsUrl('ws-a'), {
        method: 'POST',
        body: { name: 'injected', ws_id: 'ws-b' },
      }),
      context()
    );
    expect(response.status).toBe(400);
    expect(db).toEqual(seedDb());
  });
  it('creates a same-dataset member cell', async () => {
    const response = await cells.POST(
      request(datasetUrl('ws-a', 'ds-a'), {
        method: 'POST',
        body: { rowId: 'row-a', columnId: 'col-a', data: 'new-value' },
      }),
      context()
    );
    expect(response.status).toBe(200);
    expect(db.workspace_dataset_cells?.at(-1)).toMatchObject({
      dataset_id: 'ds-a',
      row_id: 'row-a',
      column_id: 'col-a',
      data: 'new-value',
    });
  });
  it.each([column.PUT, column.DELETE])(
    'a foreign column id cannot be mutated under an allowed dataset',
    async (handler) => {
      const response = await handler(
        request(datasetUrl('ws-a', 'ds-a'), {
          method: 'PUT',
          body: { name: 'injected' },
        }),
        context('ws-a', 'ds-a', 'col-b')
      );
      expect(response.status).toBe(404);
      expect(db).toEqual(seedDb());
    }
  );
  it.each([cells.POST, cells.PUT, cells.DELETE])(
    'foreign row/cell parents cannot be read into or mutated under an allowed dataset',
    async (handler) => {
      const response = await handler(
        request(datasetUrl('ws-a', 'ds-a'), {
          method: 'POST',
          body: { rowId: 'row-b', columnId: 'col-b', data: 'injected' },
        }),
        context()
      );
      expect(response.status).toBe(404);
      expect(db).toEqual(seedDb());
    }
  );
  it.each([detect.POST, remove.POST])(
    'duplicate helpers retain the authorized dataset scope',
    async (handler) => {
      const response = await handler(
        request(datasetUrl('ws-a', 'ds-a'), { method: 'POST', body: {} }),
        context()
      );
      expect(response.status).toBe(200);
      expect(
        db.workspace_dataset_cells?.find((cell) => cell.id === 'cell-b')?.data
      ).toBe('b-secret');
    }
  );
});

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: async () => undefined };
});
