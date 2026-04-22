import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  deleteWorkspaceExternalProjectAsset: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  resolveWorkspaceExternalProjectBinding: vi.fn(),
  resolveWorkspaceId: vi.fn(),
  updateWorkspaceExternalProjectAsset: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/constants', () => ({
  resolveWorkspaceId: (...args: Parameters<typeof mocks.resolveWorkspaceId>) =>
    mocks.resolveWorkspaceId(...args),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
  resolveWorkspaceExternalProjectBinding: (
    ...args: Parameters<typeof mocks.resolveWorkspaceExternalProjectBinding>
  ) => mocks.resolveWorkspaceExternalProjectBinding(...args),
}));

vi.mock('@/lib/external-projects/store', () => ({
  deleteWorkspaceExternalProjectAsset: (
    ...args: Parameters<typeof mocks.deleteWorkspaceExternalProjectAsset>
  ) => mocks.deleteWorkspaceExternalProjectAsset(...args),
  updateWorkspaceExternalProjectAsset: (
    ...args: Parameters<typeof mocks.updateWorkspaceExternalProjectAsset>
  ) => mocks.updateWorkspaceExternalProjectAsset(...args),
}));

describe('external project asset route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.resolveWorkspaceId.mockReturnValue('ws-1');
    mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
      canonical_project: { id: 'canonical-1' },
      enabled: true,
    });
  });

  it('forwards Supabase image transform params when resolving an asset', async () => {
    const createSignedUrlMock = vi.fn().mockResolvedValue({
      data: {
        signedUrl: 'https://signed.example.com/cover.png',
      },
      error: null,
    });
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'asset-1',
        source_url: null,
        storage_path: 'external-projects/yoola/artworks/entry-one/cover.png',
        workspace_external_project_entries: {
          status: 'published',
        },
        ws_id: 'ws-1',
      },
      error: null,
    });
    const eqWorkspaceIdMock = vi.fn(() => ({ single: singleMock }));
    const eqAssetIdMock = vi.fn(() => ({ eq: eqWorkspaceIdMock }));
    const selectMock = vi.fn(() => ({ eq: eqAssetIdMock }));

    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: selectMock,
      })),
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: createSignedUrlMock,
        })),
      },
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1?width=1200&height=1200&resize=cover&quality=80'
      ),
      {
        params: Promise.resolve({
          assetId: 'asset-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(createSignedUrlMock).toHaveBeenCalledWith(
      'ws-1/external-projects/yoola/artworks/entry-one/cover.png',
      60 * 60,
      {
        transform: {
          height: 1200,
          quality: 80,
          resize: 'cover',
          width: 1200,
        },
      }
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://signed.example.com/cover.png'
    );
  });

  it('rejects incomplete transform query params', async () => {
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(),
      storage: {
        from: vi.fn(),
      },
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1?quality=80'
      ),
      {
        params: Promise.resolve({
          assetId: 'asset-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid transform query',
    });
  });
});
