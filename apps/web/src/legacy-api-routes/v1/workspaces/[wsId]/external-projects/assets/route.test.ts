import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkspaceExternalProjectAsset: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/external-projects/store', () => ({
  createWorkspaceExternalProjectAsset: (
    ...args: Parameters<typeof mocks.createWorkspaceExternalProjectAsset>
  ) => mocks.createWorkspaceExternalProjectAsset(...args),
}));

describe('external project asset creation route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin: {},
      normalizedWorkspaceId: 'ws-1',
      ok: true,
      user: {
        id: 'user-1',
      },
    });
  });

  it('rejects asset creation that points outside external project storage', async () => {
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/assets/route'
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/assets',
        {
          body: JSON.stringify({
            asset_type: 'image',
            entry_id: '00000000-0000-4000-8000-000000000001',
            storage_path: 'finance/private-payroll.csv',
          }),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(mocks.createWorkspaceExternalProjectAsset).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid payload',
    });
  });

  it('creates assets with external project storage paths', async () => {
    mocks.createWorkspaceExternalProjectAsset.mockResolvedValue({
      asset_type: 'image',
      id: 'asset-1',
      storage_path: 'external-projects/yoola/artworks/cover.png',
    });

    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/assets/route'
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/assets',
        {
          body: JSON.stringify({
            asset_type: 'image',
            entry_id: '00000000-0000-4000-8000-000000000001',
            storage_path: 'external-projects/yoola/artworks/cover.png',
          }),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(201);
    expect(mocks.createWorkspaceExternalProjectAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        storage_path: 'external-projects/yoola/artworks/cover.png',
        workspaceId: 'ws-1',
      }),
      {}
    );
  });
});
