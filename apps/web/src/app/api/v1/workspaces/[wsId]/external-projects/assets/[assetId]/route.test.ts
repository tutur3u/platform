// @vitest-environment node
vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({ ok: true });
    mocks.resolveWorkspaceStorageProvider.mockResolvedValue({
      misconfigured: false,
      provider: 'supabase',
    });
  });

  afterEach(() => vi.unstubAllEnvs());
  it('proves only the current public asset revision and signs public storage for one minute', async () => {
    const { GET, HEAD } = await import('./route');
    const updated_at = '2026-11-20T09:00:00Z';
    const published_at = '2026-11-20T10:00:00Z';
    const parent = {
      status: 'published',
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
    mocks.createAdminClient.mockResolvedValue({
      from: (table: string) => ({
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        in: async () => ({ data: [] }),
        single: async () => ({ data: asset }),
        limit: async () => ({
          data:
            table === 'workspace_external_project_publish_events'
              ? [
                  {
                    entry_id: asset.entry_id,
                    payload: {
                      assetPublicationAt: published_at,
                      publishedAssetManifest: { [asset.id]: updated_at },
                    },
                  },
                ]
              : [],
        }),
      }),
    });
    const params = {
      params: Promise.resolve({ wsId: 'ws-1', assetId: asset.id }),
    };
    const url =
      'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1';
    const revision = '20261120090000';
    const probe = (entry = asset.entry_id, version = revision) =>
      HEAD(
        new Request(`${url}?entry=${entry}&v=${version}`, { method: 'HEAD' }),
        params
      );
    const allowed = await probe();
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('x-tuturuuu-published-asset-revision')).toBe(
      revision
    );
    expect(allowed.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    expect((await probe('other-entry')).status).toBe(404);
    expect((await probe(asset.entry_id, 'old')).status).toBe(404);
    expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();

    mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValueOnce(
      'https://storage.example.test/revision'
    );
    const response = await GET(new Request(`${url}?v=${revision}`), params);
    expect(response.status).toBe(307);
    expect(response.headers.has('x-tuturuuu-published-asset-revision')).toBe(
      false
    );
    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenCalledWith(
      'ws-1',
      asset.storage_path,
      expect.objectContaining({ expiresIn: 60 })
    );

    parent.status = 'draft';
    expect((await probe()).status).toBe(404);
    expect(mocks.requireWorkspaceExternalProjectAccess).not.toHaveBeenCalled();
  });

  it('preserves public sources and returns 404 for invalid legacy private sources', async () => {
    vi.stubEnv('SECURITY_EGRESS_ENFORCEMENT_ENABLED', 'true');
    vi.stubEnv('SUPABASE_SERVER_URL', 'https://storage.example.test');
    const { GET } =
      await import('@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route');
    for (const [source, status] of [
      [
        'https://storage.example.test/storage/v1/object/public/avatars/a.png',
        307,
      ],
      [
        'https://storage.example.test/storage/v1/object/sign/workspaces/ws-2/a.png?token=test-only',
        404,
      ],
      ['malformed', 404],
    ] as const) {
      const single = vi.fn(async () => ({
        data: {
          id: 'asset-1',
          source_url: source,
          metadata: {},
          storage_path: null,
          workspace_external_project_entries: { status: 'published' },
          ws_id: 'ws-1',
        },
        error: null,
      }));
      mocks.createAdminClient.mockResolvedValue({
        from: () => ({
          select: () => ({ eq: () => ({ eq: () => ({ single }) }) }),
        }),
      });
      const response = await GET(
        new Request(
          'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1'
        ),
        {
          params: Promise.resolve({ wsId: 'ws-1', assetId: 'asset-1' }),
        }
      );
      expect(response.status).toBe(status);
      if (status === 307) expect(response.headers.get('location')).toBe(source);
    }
  });

  it('returns the same response for missing and inaccessible draft assets', async () => {
    const single = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { workspace_external_project_entries: { status: 'draft' } },
        error: null,
      });
    mocks.createAdminClient.mockResolvedValue({
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ single }) }) }),
      }),
    });
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      ok: false,
    });
    const { GET } =
      await import('@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route');
    const read = () =>
      GET(
        new Request(
          'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1'
        ),
        { params: Promise.resolve({ wsId: 'ws-1', assetId: 'asset-1' }) }
      );
    const missing = await read();
    const denied = await read();

    expect(missing.status).toBe(404);
    expect(denied.status).toBe(missing.status);
    expect(await denied.json()).toEqual(await missing.json());
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

    const { GET } =
      await import('@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route');

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

    const { GET } =
      await import('@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route');

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

    const { GET } =
      await import('@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route');

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

    const { GET } =
      await import('@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route');

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

    const { GET } =
      await import('@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route');

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

    const { GET } =
      await import('@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route');

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

    const { GET } =
      await import('@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route');

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

  it.each(['entry_id', 'block_id'])(
    'SR-250 rejects a foreign %s before updating',
    async (field) => {
      const eq = vi.fn();
      const query = {
        select: vi.fn(),
        eq,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      query.select.mockReturnValue(query);
      eq.mockReturnValue(query);
      mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
        ok: true,
        normalizedWorkspaceId: 'ws-1',
        user: { id: 'user-1' },
        admin: { from: () => query },
      });
      mocks.updateWorkspaceExternalProjectAsset.mockResolvedValue({
        id: 'asset-1',
      });
      const { PATCH } = await import('./route');
      const response = await PATCH(
        new Request('http://localhost/api/asset', {
          method: 'PATCH',
          body: JSON.stringify({
            [field]: '11111111-1111-4111-8111-111111111111',
          }),
        }),
        { params: Promise.resolve({ wsId: 'ws-1', assetId: 'asset-1' }) }
      );
      expect(response.status).toBe(404);
      expect(eq).toHaveBeenCalledWith('ws_id', 'ws-1');
      expect(mocks.updateWorkspaceExternalProjectAsset).not.toHaveBeenCalled();
    }
  );

  it('passes the authorized workspace to asset updates', async () => {
    const eq = vi.fn();
    const query = {
      select: vi.fn(),
      eq,
      maybeSingle: async () => ({ data: { id: 'entry' }, error: null }),
    };
    query.select.mockReturnValue(query);
    eq.mockReturnValue(query);
    const admin = { from: () => query };
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin,
      normalizedWorkspaceId: 'ws-1',
      ok: true,
      user: {
        id: 'user-1',
      },
    });
    mocks.updateWorkspaceExternalProjectAsset.mockResolvedValue({
      id: 'asset-1',
    });

    const { PATCH } =
      await import('@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route');

    const response = await PATCH(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1',
        {
          body: JSON.stringify({
            alt_text: 'Updated alt text',
            entry_id: '11111111-1111-4111-8111-111111111111',
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
      admin
    );
    expect(eq).toHaveBeenCalledWith('ws_id', 'ws-1');
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

    const { PATCH } =
      await import('@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/route');

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
