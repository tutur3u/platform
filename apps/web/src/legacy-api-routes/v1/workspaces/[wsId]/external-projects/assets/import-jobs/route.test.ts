import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createManagedAssetImportJob: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/external-projects/managed-asset-import', () => ({
  createManagedAssetImportJob: (
    ...args: Parameters<typeof mocks.createManagedAssetImportJob>
  ) => mocks.createManagedAssetImportJob(...args),
  ManagedAssetImportValidationError: class extends Error {},
}));

const assetIds = (count: number) =>
  Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
  );

function createRequest(count: number) {
  return new Request(
    'http://localhost/api/v1/workspaces/personal/external-projects/assets/import-jobs',
    {
      body: JSON.stringify({ assetIds: assetIds(count) }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

describe('managed asset import job route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin: { role: 'admin-client' },
      binding: { adapter: 'exocorpse', canonical_id: 'exocorpse' },
      normalizedWorkspaceId: 'ws-normalized',
      ok: true,
      user: { id: 'user-1' },
    });
    mocks.createManagedAssetImportJob.mockResolvedValue({ id: 'job-1' });
  });

  it('creates a job at the protected-report-safe limit', async () => {
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/assets/import-jobs/route'
    );
    const response = await POST(createRequest(75), {
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(response.status).toBe(201);
    expect(mocks.createManagedAssetImportJob).toHaveBeenCalledWith(
      expect.objectContaining({ assetIds: assetIds(75) }),
      { role: 'admin-client' }
    );
  });

  it('rejects oversized jobs before writing an invalid report', async () => {
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/assets/import-jobs/route'
    );
    const response = await POST(createRequest(76), {
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(response.status).toBe(400);
    expect(mocks.createManagedAssetImportJob).not.toHaveBeenCalled();
  });
});
