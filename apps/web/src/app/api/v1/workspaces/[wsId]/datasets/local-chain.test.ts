import { randomUUID } from 'node:crypto';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { request } from './dataset-route-fixtures';

const local = vi.hoisted(() => {
  const clients: {
    admin?: ReturnType<typeof createSupabaseClient<Database>>;
    session?: ReturnType<typeof createSupabaseClient<Database>>;
  } = {};
  return clients;
});
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => local.session,
  createAdminClient: async () => local.admin,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@tuturuuu/auth/api-keys', () => ({
  validateApiKey: vi.fn(),
  logApiKeyUsage: vi.fn(),
}));

import {
  POST as createCell,
  GET as readCells,
} from './[datasetId]/cells/route';
import { GET as readColumns } from './[datasetId]/columns/route';
import { GET as readRows } from './[datasetId]/rows/route';
import { POST as createDataset, GET as listDatasets } from './route';

const enabled = Boolean(process.env.DATASET_LOCAL_URL);
describe.skipIf(!enabled)(
  'dataset handlers on a disposable full local Supabase chain',
  () => {
    const wsA = randomUUID();
    const wsB = randomUUID();
    const dsA = randomUUID();
    const dsB = randomUUID();
    const rowA = randomUUID();
    const rowB = randomUUID();
    const colA = randomUUID();
    const colB = randomUUID();
    const params = (wsId = wsA, datasetId = dsA) => ({
      params: Promise.resolve({ wsId, datasetId }),
    });
    const url = (wsId = wsA, datasetId = dsA) =>
      `http://localhost/api/v1/workspaces/${wsId}/datasets/${datasetId}`;

    beforeAll(async () => {
      const origin = process.env.DATASET_LOCAL_URL;
      const serviceKey = process.env.DATASET_LOCAL_SERVICE_KEY;
      const anonKey = process.env.DATASET_LOCAL_ANON_KEY;
      if (
        !origin ||
        !serviceKey ||
        !anonKey ||
        !['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)
      ) {
        throw new Error('Disposable loopback Supabase configuration required');
      }
      const admin = createSupabaseClient<Database>(origin, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const session = createSupabaseClient<Database>(origin, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      local.admin = admin;
      local.session = session;
      const password = randomUUID() + randomUUID();
      const email = `dataset-${randomUUID()}@example.com`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user)
        throw new Error('Local member creation failed');
      const signedIn = await session.auth.signInWithPassword({
        email,
        password,
      });
      if (signedIn.error) throw new Error('Local member sign-in failed');
      const actor = created.data.user.id;
      // The other workspace belongs to a different actor; both are disposable.
      const other = await admin.auth.admin.createUser({
        email: `other-${randomUUID()}@example.com`,
        password,
        email_confirm: true,
      });
      if (other.error || !other.data.user)
        throw new Error('Local nonmember fixture failed');
      const fixtures = [
        await admin.from('workspaces').insert([
          { id: wsA, name: 'Dataset A', creator_id: actor, personal: false },
          {
            id: wsB,
            name: 'Dataset B',
            creator_id: other.data.user.id,
            personal: false,
          },
        ]),
        await admin.from('workspace_members').upsert([
          { ws_id: wsA, user_id: actor, type: 'MEMBER' },
          { ws_id: wsB, user_id: other.data.user.id, type: 'MEMBER' },
        ]),
        await admin.from('workspace_datasets').insert([
          { id: dsA, ws_id: wsA, name: 'Dataset A' },
          { id: dsB, ws_id: wsB, name: 'Dataset B' },
        ]),
        await admin.from('workspace_dataset_rows').insert([
          { id: rowA, dataset_id: dsA },
          { id: rowB, dataset_id: dsB },
        ]),
        await admin.from('workspace_dataset_columns').insert([
          { id: colA, dataset_id: dsA, name: 'a' },
          { id: colB, dataset_id: dsB, name: 'b' },
        ]),
      ];
      for (const result of fixtures)
        if (result.error)
          throw new Error(
            `Local fixture: ${result.error.code} ${result.error.message}`
          );
    }, 30_000);

    it('serves real signed-in member list/read/write while database client grants remain revoked', async () => {
      if (!local.session || !local.admin)
        throw new Error('Local fixture absent');
      const direct = await local.session
        .from('workspace_datasets')
        .select('id')
        .eq('ws_id', wsA);
      expect(direct.error?.code).toBe('42501');
      const listed = await listDatasets(request(url()), params());
      expect(listed.status).toBe(200);
      expect(await listed.json()).toEqual([
        expect.objectContaining({ id: dsA, ws_id: wsA }),
      ]);
      const created = await createDataset(
        request(url(), { method: 'POST', body: { name: 'Member-created' } }),
        params()
      );
      expect(created.status).toBe(200);
      const cell = await createCell(
        request(url(), {
          method: 'POST',
          body: { rowId: rowA, columnId: colA, data: 'member-value' },
        }),
        params()
      );
      expect(cell.status).toBe(200);
      for (const handler of [readRows, readCells, readColumns]) {
        const response = await handler(request(url()), params());
        expect(response.status).toBe(200);
      }
      const foreign = await readRows(request(url(wsA, dsB)), params(wsA, dsB));
      expect(foreign.status).toBe(404);
      const nonmember = await readRows(
        request(url(wsB, dsB)),
        params(wsB, dsB)
      );
      expect(nonmember.status).toBe(404);
      const crossCell = await local.admin
        .from('workspace_dataset_cells')
        .insert({
          dataset_id: dsA,
          row_id: rowB,
          column_id: colA,
          data: 'injected',
        });
      expect(crossCell.error?.code).toBe('23514');
    });
  }
);

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: async () => undefined };
});
