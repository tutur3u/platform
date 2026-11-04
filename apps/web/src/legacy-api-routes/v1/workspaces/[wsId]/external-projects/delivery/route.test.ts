import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildWorkspaceExternalProjectDeliveryPayload: vi.fn(),
  createAdminClient: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  ifNoneMatchMatches: vi.fn(),
  resolveWorkspaceExternalProjectBinding: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess:
    mocks.requireWorkspaceExternalProjectAccess,
  resolveWorkspaceExternalProjectBinding: (
    ...args: Parameters<typeof mocks.resolveWorkspaceExternalProjectBinding>
  ) => mocks.resolveWorkspaceExternalProjectBinding(...args),
}));

vi.mock('@/lib/external-projects/cache', () => ({
  EXTERNAL_PROJECT_PRIVATE_CACHE_CONTROL: 'private, no-store',
  EXTERNAL_PROJECT_PUBLIC_CACHE_CONTROL: 'public, max-age=60',
  externalProjectAssetCacheTag: (id: string) => `asset-${id}`,
  workspaceExternalProjectCacheTag: (id: string) => `workspace-${id}`,
}));

vi.mock('@/lib/external-projects/http-cache', () => ({
  ifNoneMatchMatches: mocks.ifNoneMatchMatches,
  MAX_VERCEL_CACHE_TAGS: 32,
}));

vi.mock('@/lib/external-projects/page-versions', () => ({
  getPublishedPageVersion: vi.fn(),
}));

vi.mock('@/lib/external-projects/store', () => ({
  buildWorkspaceExternalProjectDeliveryPayload: (
    ...args: Parameters<
      typeof mocks.buildWorkspaceExternalProjectDeliveryPayload
    >
  ) => mocks.buildWorkspaceExternalProjectDeliveryPayload(...args),
}));

describe('external project delivery route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.ifNoneMatchMatches.mockReturnValue(false);
    mocks.createAdminClient.mockResolvedValue({ kind: 'admin-db' });
    mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
      canonical_project: { id: 'canonical-project' },
      enabled: true,
    });
    mocks.buildWorkspaceExternalProjectDeliveryPayload.mockResolvedValue({
      collections: [],
      workspaceId: '123e4567-e89b-12d3-a456-426614174000',
      revision: '1',
    });
  });

  it.each([401, 403])(
    'denies preview with status %i before delivery reads',
    async (status) => {
      const denied = Response.json({ error: 'Denied' }, { status });
      mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
        ok: false,
        response: denied,
      });
      const { GET } = await import('./route');
      const request = new Request('https://example.com/delivery?preview=true');
      const response = await GET(request, {
        params: Promise.resolve({ wsId: 'preview-workspace' }),
      });
      expect(response).toBe(denied);
      expect(mocks.requireWorkspaceExternalProjectAccess).toHaveBeenCalledWith({
        mode: 'edit',
        request,
        wsId: 'preview-workspace',
      });
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      expect(
        mocks.resolveWorkspaceExternalProjectBinding
      ).not.toHaveBeenCalled();
      expect(
        mocks.buildWorkspaceExternalProjectDeliveryPayload
      ).not.toHaveBeenCalled();
    }
  );

  it('serves drafts only through edit access with private no-store caching', async () => {
    const binding = {
      enabled: true,
      canonical_project: { id: 'preview-project' },
    };
    const admin = { kind: 'preview-admin' };
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      ok: true,
      binding,
      admin,
      normalizedWorkspaceId: 'preview-workspace',
    });
    const { GET } = await import('./route');
    const request = new Request('https://example.com/delivery?preview=true');
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'alias' }),
    });
    expect(response.status).toBe(200);
    expect(mocks.requireWorkspaceExternalProjectAccess).toHaveBeenCalledWith({
      mode: 'edit',
      request,
      wsId: 'alias',
    });
    expect(
      mocks.buildWorkspaceExternalProjectDeliveryPayload
    ).toHaveBeenCalledWith(
      { binding, includeDrafts: true, workspaceId: 'preview-workspace' },
      admin
    );
    expect(await response.json()).toEqual({
      collections: [],
      workspaceId: '123e4567-e89b-12d3-a456-426614174000',
      revision: '1',
    });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Vercel-Cache-Tag')).toBeNull();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.resolveWorkspaceExternalProjectBinding).not.toHaveBeenCalled();
  });

  it('retains CDN cache headers and workspace purge tag on a 304', async () => {
    mocks.ifNoneMatchMatches.mockReturnValue(true);
    const { GET } = await import('./route');
    const workspaceId = '123e4567-e89b-12d3-a456-426614174000';
    const response = await GET(
      new Request('https://example.com/delivery', {
        headers: { 'if-none-match': 'fixture-etag' },
      }),
      { params: Promise.resolve({ wsId: workspaceId }) }
    );
    expect(response.status).toBe(304);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe(
      'max-age=86400, stale-while-revalidate=43200'
    );
    expect(response.headers.get('Vercel-Cache-Tag')).toContain(
      `workspace-${workspaceId}`
    );
  });

  it('returns 409 when no enabled CMS binding exists', async () => {
    mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValueOnce({
      enabled: false,
    });
    const { GET } = await import('./route');
    const response = await GET(new Request('https://example.com/delivery'), {
      params: Promise.resolve({ wsId: '123e4567-e89b-12d3-a456-426614174000' }),
    });
    expect(response.status).toBe(409);
    expect(
      mocks.buildWorkspaceExternalProjectDeliveryPayload
    ).not.toHaveBeenCalled();
  });

  it('rejects a malformed workspace ID before making database calls', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'https://tuturuuu.com/api/v1/workspaces/not-a-uuid/external-projects/delivery'
      ),
      { params: Promise.resolve({ wsId: 'not-a-uuid' }) }
    );

    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.resolveWorkspaceExternalProjectBinding).not.toHaveBeenCalled();
    expect(
      mocks.buildWorkspaceExternalProjectDeliveryPayload
    ).not.toHaveBeenCalled();
  });

  it('continues to deliver for a valid workspace UUID', async () => {
    const { GET } = await import('./route');
    const workspaceId = '123e4567-e89b-12d3-a456-426614174000';
    const response = await GET(
      new Request(
        `https://tuturuuu.com/api/v1/workspaces/${workspaceId}/external-projects/delivery`
      ),
      { params: Promise.resolve({ wsId: workspaceId }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe(
      'max-age=86400, stale-while-revalidate=43200'
    );
    expect(response.headers.get('Vercel-Cache-Tag')).toContain(
      `workspace-${workspaceId}`
    );
    expect(mocks.resolveWorkspaceExternalProjectBinding).toHaveBeenCalledWith(
      workspaceId,
      { kind: 'admin-db' }
    );
    expect(
      mocks.buildWorkspaceExternalProjectDeliveryPayload
    ).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId, includeDrafts: false }),
      { kind: 'admin-db' }
    );
  });
});
