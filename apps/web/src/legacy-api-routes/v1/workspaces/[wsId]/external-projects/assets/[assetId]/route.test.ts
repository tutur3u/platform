import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
  createWorkspaceStorageSignedReadUrl: vi.fn(),
  createAdminClient: vi.fn(),
  deleteWorkspaceExternalProjectAsset: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  resolveWorkspaceExternalProjectBinding: vi.fn(),
  resolveWorkspaceStorageProvider: vi.fn(),
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

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: mocks.WorkspaceStorageError,
  createWorkspaceStorageSignedReadUrl: (
    ...args: Parameters<typeof mocks.createWorkspaceStorageSignedReadUrl>
  ) => mocks.createWorkspaceStorageSignedReadUrl(...args),
  resolveWorkspaceStorageProvider: (
    ...args: Parameters<typeof mocks.resolveWorkspaceStorageProvider>
  ) => mocks.resolveWorkspaceStorageProvider(...args),
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
    mocks.resolveWorkspaceStorageProvider.mockResolvedValue({
      misconfigured: false,
      provider: 'supabase',
    });
  });

  it('forwards Supabase image transform params when resolving an asset', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'asset-1',
        metadata: {},
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

    mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValue(
      'https://signed.example.com/cover.png'
    );
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: selectMock,
      })),
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route'
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

    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenCalledWith(
      'ws-1',
      'external-projects/yoola/artworks/entry-one/cover.png',
      {
        expiresIn: 7 * 24 * 60 * 60,
        provider: 'supabase',
        requireExists: true,
        transform: {
          format: undefined,
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

  it('resolves R2-backed assets through the workspace storage provider', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'asset-1',
        metadata: {},
        source_url: null,
        storage_path: 'external-projects/yoola/games/mine/cover.png',
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

    mocks.resolveWorkspaceStorageProvider.mockResolvedValue({
      misconfigured: false,
      provider: 'r2',
    });
    mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValue(
      'https://r2.example.com/signed-cover.png'
    );
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: selectMock,
      })),
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1?width=1600&height=1600&resize=cover&quality=82'
      ),
      {
        params: Promise.resolve({
          assetId: 'asset-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenCalledWith(
      'ws-1',
      'external-projects/yoola/games/mine/cover.png',
      {
        expiresIn: 7 * 24 * 60 * 60,
        provider: 'r2',
        requireExists: true,
        transform: undefined,
      }
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://r2.example.com/signed-cover.png'
    );
  });

  it('falls back from stale R2 metadata to Supabase with image transforms', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'asset-1',
        metadata: {
          provider: 'r2',
        },
        source_url: null,
        storage_path: 'external-projects/theguyser/gallery/hero.png',
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

    mocks.createWorkspaceStorageSignedReadUrl
      .mockRejectedValueOnce(
        new mocks.WorkspaceStorageError('Storage object not found', 404)
      )
      .mockResolvedValueOnce('https://supabase.example.com/signed-hero.png');
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: selectMock,
      })),
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1?width=900&height=600&resize=cover'
      ),
      {
        params: Promise.resolve({
          assetId: 'asset-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenNthCalledWith(
      1,
      'ws-1',
      'external-projects/theguyser/gallery/hero.png',
      {
        expiresIn: 7 * 24 * 60 * 60,
        provider: 'r2',
        requireExists: true,
        transform: undefined,
      }
    );
    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenNthCalledWith(
      2,
      'ws-1',
      'external-projects/theguyser/gallery/hero.png',
      {
        expiresIn: 7 * 24 * 60 * 60,
        provider: 'supabase',
        requireExists: true,
        transform: {
          format: undefined,
          height: 600,
          resize: 'cover',
          width: 900,
        },
      }
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://supabase.example.com/signed-hero.png'
    );
  });

  it('falls back from a missing Supabase object to R2', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'asset-1',
        metadata: {},
        source_url: null,
        storage_path: 'external-projects/yoola/gallery/cover.png',
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

    mocks.createWorkspaceStorageSignedReadUrl
      .mockRejectedValueOnce(
        new mocks.WorkspaceStorageError('Storage object not found', 404)
      )
      .mockResolvedValueOnce('https://r2.example.com/fallback-cover.png');
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: selectMock,
      })),
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1'
      ),
      {
        params: Promise.resolve({
          assetId: 'asset-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenNthCalledWith(
      1,
      'ws-1',
      'external-projects/yoola/gallery/cover.png',
      {
        expiresIn: 7 * 24 * 60 * 60,
        provider: 'supabase',
        requireExists: true,
        transform: undefined,
      }
    );
    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenNthCalledWith(
      2,
      'ws-1',
      'external-projects/yoola/gallery/cover.png',
      {
        expiresIn: 7 * 24 * 60 * 60,
        provider: 'r2',
        requireExists: true,
        transform: undefined,
      }
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://r2.example.com/fallback-cover.png'
    );
  });

  it('returns 404 when neither storage provider has the asset object', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'asset-1',
        metadata: {},
        source_url: null,
        storage_path: 'external-projects/theguyser/gallery/missing.png',
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

    mocks.createWorkspaceStorageSignedReadUrl
      .mockRejectedValueOnce(
        new mocks.WorkspaceStorageError('Storage object not found', 404)
      )
      .mockRejectedValueOnce(
        new mocks.WorkspaceStorageError('Storage object not found', 404)
      );
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: selectMock,
      })),
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1'
      ),
      {
        params: Promise.resolve({
          assetId: 'asset-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Asset not available',
    });
  });

  it('rejects incomplete transform query params', async () => {
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(),
      storage: {
        from: vi.fn(),
      },
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route'
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

  it('does not resolve stored assets outside external project storage', async () => {
    const createSignedUrlMock = vi.fn();
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'asset-1',
        metadata: {},
        source_url: null,
        storage_path: 'finance/private-payroll.csv',
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
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1'
      ),
      {
        params: Promise.resolve({
          assetId: 'asset-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(404);
    expect(createSignedUrlMock).not.toHaveBeenCalled();
    expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();
  });

  it('passes the authorized workspace to asset updates', async () => {
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin: {},
      normalizedWorkspaceId: 'ws-1',
      ok: true,
      user: {
        id: 'user-1',
      },
    });
    mocks.updateWorkspaceExternalProjectAsset.mockResolvedValue({
      id: 'asset-1',
    });

    const { PATCH } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route'
    );

    const response = await PATCH(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1',
        {
          body: JSON.stringify({
            alt_text: 'Updated alt text',
          }),
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({
          assetId: 'asset-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.updateWorkspaceExternalProjectAsset).toHaveBeenCalledWith(
      'asset-1',
      expect.objectContaining({
        actorId: 'user-1',
        alt_text: 'Updated alt text',
        workspaceId: 'ws-1',
      }),
      {}
    );
  });

  it('rejects asset updates that point outside external project storage', async () => {
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin: {},
      normalizedWorkspaceId: 'ws-1',
      ok: true,
      user: {
        id: 'user-1',
      },
    });

    const { PATCH } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route'
    );

    const response = await PATCH(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1',
        {
          body: JSON.stringify({
            storage_path: 'finance/private-payroll.csv',
          }),
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({
          assetId: 'asset-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(mocks.updateWorkspaceExternalProjectAsset).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid payload',
    });
  });
});
