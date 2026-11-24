import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeEdgeCache } from '@/lib/external-projects/edge-cache-test-utils';

const WS = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_WS = '223e4567-e89b-12d3-a456-426614174000';

const mocks = vi.hoisted(() => ({
  buildWorkspaceExternalProjectDeliveryPayload: vi.fn(),
  createAdminClient: vi.fn(),
  readDeliveryState: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  resolveWorkspaceExternalProjectBinding: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (...args: unknown[]) =>
    mocks.requireWorkspaceExternalProjectAccess(...args),
  resolveWorkspaceExternalProjectBinding: (...args: unknown[]) =>
    mocks.resolveWorkspaceExternalProjectBinding(...args),
}));

vi.mock('@/lib/external-projects/delivery-state', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/external-projects/delivery-state')
  >()),
  readDeliveryState: (...args: unknown[]) => mocks.readDeliveryState(...args),
}));

vi.mock('@/lib/external-projects/store', () => ({
  buildWorkspaceExternalProjectDeliveryPayload: (...args: unknown[]) =>
    mocks.buildWorkspaceExternalProjectDeliveryPayload(...args),
}));

const enabledState = (version: number) => ({
  adapter: 'custom',
  bindingFingerprint: 'fp',
  canonicalId: 'canonical',
  canonicalProject: { id: 'canonical' },
  enabled: true,
  settings: null,
  version,
});

async function get(wsId: string, init?: RequestInit, query = '') {
  const { GET } = await import('./route');
  return GET(
    new Request(
      `https://tuturuuu.com/api/v1/workspaces/${wsId}/external-projects/delivery${query}`,
      init
    ),
    { params: Promise.resolve({ wsId }) }
  );
}

describe('external project delivery route edge cache', () => {
  let fake: ReturnType<typeof createFakeEdgeCache>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fake = createFakeEdgeCache();
    (globalThis as { caches?: unknown }).caches = { default: fake.cache };
    mocks.createAdminClient.mockResolvedValue({ kind: 'admin-db' });
    mocks.readDeliveryState.mockResolvedValue(enabledState(4));
    mocks.buildWorkspaceExternalProjectDeliveryPayload.mockResolvedValue({
      collections: [],
      revision: 'rev-4',
    });
  });

  afterEach(() => {
    delete (globalThis as { caches?: unknown }).caches;
    vi.unstubAllEnvs();
  });

  it('serves a public versioned response and then a cache hit without a build', async () => {
    const miss = await get(WS);
    expect(miss.status).toBe(200);
    expect(miss.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=5, stale-while-revalidate=30'
    );
    expect(miss.headers.get('etag')).toBe('W/"rev-4-v4"');
    expect(miss.headers.get('x-tuturuuu-delivery-version')).toBe('4');
    expect(miss.headers.get('x-tuturuuu-delivery-cache')).toBe('MISS');
    expect(miss.headers.get('vercel-cdn-cache-control')).toBeNull();

    const hit = await get(WS, { headers: { 'if-none-match': 'W/"rev-4-v4"' } });
    expect(hit.status).toBe(304);
    expect(hit.headers.get('x-tuturuuu-delivery-cache')).toBe('HIT');
    expect(
      mocks.buildWorkspaceExternalProjectDeliveryPayload
    ).toHaveBeenCalledTimes(1);
    expect(
      mocks.buildWorkspaceExternalProjectDeliveryPayload
    ).toHaveBeenCalledWith(
      expect.objectContaining({ includeDrafts: false, workspaceId: WS }),
      { kind: 'admin-db' }
    );
    expect(mocks.resolveWorkspaceExternalProjectBinding).not.toHaveBeenCalled();
  });

  it('keeps two workspaces on separate cache keys', async () => {
    await get(WS);
    await get(OTHER_WS);
    expect(fake.calls.put).toHaveLength(2);
    expect(fake.calls.put[0]).toContain(WS);
    expect(fake.calls.put[1]).toContain(OTHER_WS);
    expect(
      mocks.buildWorkspaceExternalProjectDeliveryPayload
    ).toHaveBeenCalledTimes(2);
  });

  it('answers an unbound workspace 404 with no-store and stores nothing', async () => {
    mocks.readDeliveryState.mockResolvedValue({
      ...enabledState(0),
      canonicalProject: null,
      enabled: false,
    });
    const response = await get(WS);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(fake.calls.put).toHaveLength(0);
  });

  it('answers a build failure 500 with no-store and stores nothing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.buildWorkspaceExternalProjectDeliveryPayload.mockRejectedValue(
      new Error('db down')
    );
    const response = await get(WS);
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(fake.calls.put).toHaveLength(0);
    error.mockRestore();
  });

  it('never reads or writes the edge cache for a preview', async () => {
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin: { kind: 'preview-db' },
      binding: { canonical_id: 'canonical', enabled: true },
      normalizedWorkspaceId: WS,
      ok: true,
    });
    mocks.buildWorkspaceExternalProjectDeliveryPayload.mockResolvedValue({
      collections: [],
      revision: 'draft',
    });
    const response = await get(WS, undefined, '?preview=true');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-tuturuuu-delivery-cache')).toBeNull();
    expect(
      mocks.buildWorkspaceExternalProjectDeliveryPayload
    ).toHaveBeenCalledWith(expect.objectContaining({ includeDrafts: true }), {
      kind: 'preview-db',
    });
    expect(fake.calls.match).toHaveLength(0);
    expect(fake.calls.put).toHaveLength(0);
    expect(mocks.readDeliveryState).not.toHaveBeenCalled();
  });

  it('refuses a rejected preview without touching the edge cache', async () => {
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    const response = await get(WS, undefined, '?preview=true');
    expect(response.status).toBe(403);
    expect(fake.calls.match).toHaveLength(0);
    expect(fake.calls.put).toHaveLength(0);
  });

  it('bypasses the edge cache and the state read when fenced', async () => {
    vi.stubEnv('CMS_DELIVERY_EDGE_CACHE', '0');
    mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
      canonical_project: { id: 'canonical' },
      enabled: true,
    });
    const response = await get(WS);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-tuturuuu-delivery-cache')).toBe('BYPASS');
    expect(mocks.readDeliveryState).not.toHaveBeenCalled();
    expect(fake.calls.match).toHaveLength(0);
    expect(fake.calls.put).toHaveLength(0);
  });

  it('falls back to the uncached read while the counter migration is missing', async () => {
    const { DeliveryStateUnavailableError } =
      await import('@/lib/external-projects/delivery-state');
    mocks.readDeliveryState.mockRejectedValue(
      new DeliveryStateUnavailableError('missing function', 'PGRST202')
    );
    mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
      canonical_project: { id: 'canonical' },
      enabled: true,
    });
    const response = await get(WS);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(fake.calls.put).toHaveLength(0);
  });
});
