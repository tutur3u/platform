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

import { POST as postCell } from './cells/route';
import { PUT as putRow } from './rows/route';

const params = (wsId: string, datasetId: string) => ({
  params: Promise.resolve({ wsId, datasetId }),
});

// The session user is modelled as a member of both workspaces, so only the
// dataset parent checks (not RLS) can stop a cross-dataset link.
describe('dataset cell writes stay inside one dataset', () => {
  let db: Db;

  beforeEach(() => {
    vi.clearAllMocks();
    db = seedDb();
    mocks.createClient.mockImplementation(async () => createFakeSupabase(db));
    mocks.createAdminClient.mockImplementation(async () =>
      createFakeSupabase(db)
    );
  });

  const cellsFor = (rowId: string) =>
    db.workspace_dataset_cells?.filter((cell) => cell.row_id === rowId);

  it('rejects a cell that points at a row of another dataset', async () => {
    const response = await postCell(
      request(`${datasetUrl('ws-a', 'ds-a')}/cells`, {
        method: 'POST',
        body: { rowId: 'row-b', columnId: 'col-a', data: 'injected-by-a' },
      }),
      params('ws-a', 'ds-a')
    );

    expect(response.status).toBe(404);
    expect(cellsFor('row-b')).toEqual(
      seedDb().workspace_dataset_cells?.slice(1)
    );
  });

  it('rejects a cell that points at a column of another dataset', async () => {
    const response = await postCell(
      request(`${datasetUrl('ws-a', 'ds-a')}/cells`, {
        method: 'POST',
        body: { rowId: 'row-a', columnId: 'col-b', data: 'foreign-column' },
      }),
      params('ws-a', 'ds-a')
    );

    expect(response.status).toBe(404);
    expect(db).toEqual(seedDb());
  });

  it('rejects a dataset that is not in the URL workspace', async () => {
    const response = await postCell(
      request(`${datasetUrl('ws-a', 'ds-b')}/cells`, {
        method: 'POST',
        body: { rowId: 'row-b', columnId: 'col-b', data: 'x' },
      }),
      params('ws-a', 'ds-b')
    );

    expect(response.status).toBe(404);
    expect(db).toEqual(seedDb());
  });

  it('accepts a cell whose row and column share the dataset', async () => {
    const response = await postCell(
      request(`${datasetUrl('ws-a', 'ds-a')}/cells`, {
        method: 'POST',
        body: { rowId: 'row-a', columnId: 'col-a', data: 'second' },
      }),
      params('ws-a', 'ds-a')
    );

    expect(response.status).toBe(200);
    expect(cellsFor('row-a')).toHaveLength(2);
  });

  it('rejects a row update that targets a row of another dataset', async () => {
    const response = await putRow(
      request(`${datasetUrl('ws-a', 'ds-a')}/rows`, {
        method: 'PUT',
        body: { rowId: 'row-b', row: { 'field-a': 'injected-by-a' } },
      }),
      params('ws-a', 'ds-a')
    );

    expect(response.status).toBe(404);
    expect(db).toEqual(seedDb());
  });

  it('updates a row of the same dataset', async () => {
    const response = await putRow(
      request(`${datasetUrl('ws-a', 'ds-a')}/rows`, {
        method: 'PUT',
        body: { rowId: 'row-a', row: { 'field-a': 'updated' } },
      }),
      params('ws-a', 'ds-a')
    );

    expect(response.status).toBe(200);
    expect(cellsFor('row-a')).toContainEqual(
      expect.objectContaining({ column_id: 'col-a', data: 'updated' })
    );
  });
});

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: async () => undefined };
});
