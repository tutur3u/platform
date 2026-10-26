import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildWorkspaceExternalProjectDeliveryPayload: vi.fn(),
  createAdminClient: vi.fn(),
  resolveWorkspaceExternalProjectBinding: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: vi.fn(),
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
  ifNoneMatchMatches: vi.fn(() => false),
  MAX_VERCEL_CACHE_TAGS: 32,
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
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ kind: 'admin-db' });
    mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
      canonical_project: { id: 'canonical-project' },
      enabled: true,
    });
    mocks.buildWorkspaceExternalProjectDeliveryPayload.mockResolvedValue({
      collections: [],
      revision: 1,
    });
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
