// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createFakeEdgeCache } from '@/lib/external-projects/edge-cache-test-utils';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createWorkspaceStorageSignedReadUrl: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/constants', () => ({
  resolveWorkspaceId: () => 'ws-1',
}));
vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess:
    mocks.requireWorkspaceExternalProjectAccess,
  resolveWorkspaceExternalProjectBinding: async () => ({
    canonical_project: { id: 'canonical-1' },
    enabled: true,
  }),
}));
vi.mock('@/lib/external-projects/store', () => ({
  deleteWorkspaceExternalProjectAsset: vi.fn(),
  updateWorkspaceExternalProjectAsset: vi.fn(),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: Error,
  createWorkspaceStorageSignedReadUrl:
    mocks.createWorkspaceStorageSignedReadUrl,
  resolveWorkspaceStorageProvider: async () => ({ provider: 'r2' }),
}));

import { assetBytesDigest } from '@/lib/external-projects/asset-publication-bytes';
import { assetPublicationProofId } from '@/lib/external-projects/published-assets';

const updated_at = '2026-11-20T09:00:00Z';
const published_at = '2026-11-20T10:00:00Z';
const content = 'published bytes';
const revision = '20261120090000';
const url =
  'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1';

let fake: ReturnType<typeof createFakeEdgeCache>;
let parent: Record<string, unknown>;
let version: number;
let queries: number;
let upstream: ReturnType<typeof vi.fn>;

function install() {
  parent = {
    status: 'published',
    updated_at: published_at,
    published_at,
    metadata: {},
    workspace_external_project_collections: { slug: 'games', config: {} },
  };
  const asset = {
    id: 'asset-1',
    entry_id: 'entry-1',
    updated_at,
    source_url: null,
    storage_path: 'external-projects/custom/games/index.png',
    workspace_external_project_entries: parent,
  };
  const digest = assetBytesDigest(new TextEncoder().encode(content));
  const proofQuery = {
    select: () => proofQuery,
    eq: () => proofQuery,
    in: async () => {
      queries++;
      return {
        data: [
          {
            id: assetPublicationProofId('ws-1', 'canonical-1', {
              id: 'entry-1',
              published_at,
              updated_at: published_at,
            }),
            entry_id: 'entry-1',
            published_at,
            entry_updated_at: published_at,
            asset_revisions: {
              [asset.id]: { revision: updated_at, sha256: digest },
            },
          },
        ],
      };
    },
  };
  const assetQuery = {
    select: () => assetQuery,
    eq: () => assetQuery,
    single: async () => {
      queries++;
      return { data: asset };
    },
  };
  const versionQuery = {
    select: () => versionQuery,
    eq: () => versionQuery,
    maybeSingle: async () => ({ data: { version }, error: null }),
  };
  mocks.createAdminClient.mockResolvedValue({
    from: () => assetQuery,
    schema: () => ({
      from: (table: string) =>
        table === 'workspace_external_project_delivery_versions'
          ? versionQuery
          : proofQuery,
    }),
  });
  mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValue(
    'https://storage.example.test/revision'
  );
  upstream = vi.fn(
    async () =>
      new Response(content, { headers: { 'content-type': 'image/png' } })
  );
  vi.stubGlobal('fetch', upstream);
  return digest;
}

async function load() {
  vi.resetModules();
  const route = await import('./route');
  const params = {
    params: Promise.resolve({ wsId: 'ws-1', assetId: 'asset-1' }),
  };
  return (query = `?v=${revision}`, headers: Record<string, string> = {}) =>
    route.GET(new Request(`${url}${query}`, { headers }), params);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T05:00:00Z'));
  fake = createFakeEdgeCache();
  (globalThis as { caches?: unknown }).caches = { default: fake.cache };
  version = 5;
  queries = 0;
});

afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('serves a revision-pinned public asset from the edge cache without verifying again', async () => {
  const digest = install();
  const get = await load();
  const miss = await get();
  expect(miss.status).toBe(200);
  expect(miss.headers.get('cache-control')).toBe(
    'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
  );
  expect(miss.headers.get('etag')).toBe(`"${digest}"`);
  expect(miss.headers.get('x-tuturuuu-delivery-cache')).toBe('MISS');
  expect(await miss.text()).toBe(content);
  expect(fake.calls.put).toHaveLength(1);
  expect(fake.calls.put[0]).toContain('/asset/v1/ws-1/asset-1/');
  expect(fake.calls.put[0]).toMatch(/\/original\/5$/);

  const verified = queries;
  const bytesFetched = upstream.mock.calls.length;
  const hit = await get();
  expect(hit.status).toBe(200);
  expect(hit.headers.get('x-tuturuuu-delivery-cache')).toBe('HIT');
  expect(await hit.text()).toBe(content);
  expect(queries).toBe(verified);
  expect(upstream).toHaveBeenCalledTimes(bytesFetched);

  const conditional = await get(`?v=${revision}`, {
    'if-none-match': `"${digest}"`,
  });
  expect(conditional.status).toBe(304);
  expect(queries).toBe(verified);

  const partial = await get(`?v=${revision}`, { range: 'bytes=0-8' });
  expect(partial.status).toBe(206);
  expect(partial.headers.get('content-range')).toBe('bytes 0-8/15');
  expect(await partial.text()).toBe('published');
});

it('answers a range on a cold cache correctly and still stores the full body', async () => {
  install();
  const get = await load();
  const partial = await get(`?v=${revision}`, { range: 'bytes=10-' });
  expect(partial.status).toBe(206);
  expect(await partial.text()).toBe('bytes');
  expect(fake.calls.put).toHaveLength(1);
  const full = await get();
  expect(full.headers.get('x-tuturuuu-delivery-cache')).toBe('HIT');
  expect(await full.text()).toBe(content);
});

it('does not serve an unpublished asset from the cache after a version bump', async () => {
  install();
  const get = await load();
  expect((await get()).status).toBe(200);
  expect((await get()).headers.get('x-tuturuuu-delivery-cache')).toBe('HIT');

  parent.status = 'draft';
  version = 6;
  vi.setSystemTime(new Date('2026-11-24T05:00:03Z'));
  mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({ ok: false });
  const after = await get();
  expect(after.status).toBe(404);
  expect(after.headers.get('cache-control')).toContain('no-store');
  expect(fake.calls.put).toHaveLength(1);
});

it('stays private and never touches the cache when fenced', async () => {
  install();
  vi.stubEnv('CMS_DELIVERY_EDGE_CACHE', '0');
  const get = await load();
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('x-tuturuuu-delivery-cache')).toBeNull();
  expect(fake.calls.match).toHaveLength(0);
  expect(fake.calls.put).toHaveLength(0);
});

it('stays private without a revision pin', async () => {
  install();
  const get = await load();
  const response = await get('');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(fake.calls.match).toHaveLength(0);
  expect(fake.calls.put).toHaveLength(0);
});

it('never stores a response that failed verification', async () => {
  install();
  const get = await load();
  upstream.mockImplementationOnce(async () => {
    parent.status = 'draft';
    return new Response(content);
  });
  mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({ ok: false });
  expect((await get()).status).toBe(404);
  expect(fake.calls.put).toHaveLength(0);
});
