import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invalidateWorkspaceExternalProjectCache } from './cache';
import {
  deleteWorkspaceExternalProjectEntry,
  publishWorkspaceExternalProjectEntry,
} from './store';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), binding: vi.fn() }));
vi.mock('./access', () => ({
  requireRootExternalProjectsAdmin: async () => ({
    ok: true,
    admin: {},
    supabase: { rpc: mocks.rpc },
  }),
  resolveWorkspaceExternalProjectBinding: mocks.binding,
}));
vi.mock('@vercel/functions', () => ({ invalidateByTag: vi.fn() }));
const ws = '11111111-1111-4111-8111-111111111111';
const send = vi.fn(async () => new Response(null, { status: 204 }));
const writes: string[] = [];
function database() {
  return {
    rpc: async () => {
      writes.push('unpublish_rpc');
      return {
        data: { id: 'entry', published_page_version_id: null },
        error: null,
      };
    },
    from(table: string) {
      const result = { data: [], error: null };
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        limit: () => query,
        range: () => query,
        update: () => {
          writes.push(table);
          return query;
        },
        delete: () => {
          writes.push(table);
          return query;
        },
        insert: () => {
          writes.push(table);
          return query;
        },
        single: async () => ({
          data: { id: 'entry', status: 'draft' },
          error: null,
        }),
      };
      Object.defineProperty(query, 'then', {
        value: (resolve: (value: typeof result) => unknown) =>
          Promise.resolve(result).then(resolve),
      });
      return query;
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  writes.length = 0;
  send.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', send);
  vi.stubEnv(
    'CMS_RENDERER_SITES',
    JSON.stringify({
      'site.example': {
        id: 'site',
        workspaceId: ws,
        defaultLocale: 'vi',
        purgeToken: 'a'.repeat(43),
      },
    })
  );
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.binding.mockResolvedValue({ enabled: false });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function expectPurge() {
  expect(send).toHaveBeenCalledWith(
    'https://site.example/__cms/purge',
    expect.objectContaining({
      body: JSON.stringify({ scope: 'workspace' }),
      headers: {
        Authorization: `Bearer ${'a'.repeat(43)}`,
        'Content-Type': 'application/json',
      },
    })
  );
}
it('entry deletion purges the site after deleting its rows', async () => {
  await deleteWorkspaceExternalProjectEntry(
    'entry',
    { workspaceId: ws },
    database() as never
  );
  expect(writes).toContain('workspace_external_project_entries');
  expectPurge();
});
it('legacy unpublish purges the workspace after committing its event', async () => {
  await publishWorkspaceExternalProjectEntry(
    {
      actorId: 'actor',
      entryId: 'entry',
      workspaceId: ws,
      binding: {
        canonical_id: 'site',
        adapter: 'custom',
        canonical_project: { delivery_profile: {} },
      } as never,
      eventKind: 'unpublish',
      visibilityScope: 'public',
    },
    database() as never
  );
  expect(writes).toContain('unpublish_rpc');
  expectPurge();
});
it('binding disable purges the old trusted site after the binding RPC', async () => {
  const { PATCH } = await import(
    '@/legacy-api-routes/v1/admin/external-project-bindings/[workspaceId]/route'
  );
  await PATCH(
    new Request('https://api.example', {
      method: 'PATCH',
      body: JSON.stringify({ canonicalId: null }),
    }),
    { params: Promise.resolve({ workspaceId: ws }) }
  );
  expect(mocks.rpc).toHaveBeenCalled();
  expectPurge();
});
it('a failed purge rejects after the entry deletion commits', async () => {
  send.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(
    deleteWorkspaceExternalProjectEntry(
      'entry',
      { workspaceId: ws },
      database() as never
    )
  ).rejects.toThrow('committed');
  expect(writes).toContain('workspace_external_project_entries');
});
it('workspace invalidation sends no request for another workspace', async () => {
  await invalidateWorkspaceExternalProjectCache(
    '22222222-2222-4222-8222-222222222222'
  );
  expect(send).not.toHaveBeenCalled();
});
