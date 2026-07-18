import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWorkspaceExternalProjectScopedStudioData: vi.fn(),
  getWorkspaceExternalProjectStudioData: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/external-projects/cms-capabilities', () => ({
  getExternalProjectCmsEditorCapabilities: vi.fn(() => ({ enabled: true })),
}));

vi.mock('@/lib/external-projects/store', () => ({
  getWorkspaceExternalProjectStudioData: (
    ...args: Parameters<typeof mocks.getWorkspaceExternalProjectStudioData>
  ) => mocks.getWorkspaceExternalProjectStudioData(...args),
}));

vi.mock('@/lib/external-projects/store-studio-scope', () => ({
  getWorkspaceExternalProjectScopedStudioData: (
    ...args: Parameters<
      typeof mocks.getWorkspaceExternalProjectScopedStudioData
    >
  ) => mocks.getWorkspaceExternalProjectScopedStudioData(...args),
}));

const studio = {
  assets: [],
  blocks: [],
  collections: [],
  entries: [],
  fieldDefinitions: [],
  importJobs: [],
  loadingData: null,
  publishEvents: [],
};

describe('external-project studio route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin: { kind: 'admin-db' },
      binding: { adapter: 'exocorpse', enabled: true },
      normalizedWorkspaceId: 'workspace-id',
      ok: true,
    });
    mocks.getWorkspaceExternalProjectStudioData.mockResolvedValue(studio);
    mocks.getWorkspaceExternalProjectScopedStudioData.mockResolvedValue(studio);
  });

  it('loads only requested collections for branded admin sections', async () => {
    const { GET } = await import('./route');
    const request = new Request(
      'https://tuturuuu.com/api/v1/workspaces/workspace-id/external-projects?collectionSlugs=stories,tags&collectionSlugs=stories'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'workspace-id' }),
    });

    expect(response.status).toBe(200);
    expect(
      mocks.getWorkspaceExternalProjectScopedStudioData
    ).toHaveBeenCalledWith(
      'workspace-id',
      ['stories', 'tags'],
      expect.anything()
    );
    expect(mocks.getWorkspaceExternalProjectStudioData).not.toHaveBeenCalled();
  });

  it('preserves the complete studio response when no scope is requested', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'https://tuturuuu.com/api/v1/workspaces/workspace-id/external-projects'
      ),
      { params: Promise.resolve({ wsId: 'workspace-id' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.getWorkspaceExternalProjectStudioData).toHaveBeenCalledWith(
      'workspace-id',
      expect.anything()
    );
    expect(
      mocks.getWorkspaceExternalProjectScopedStudioData
    ).not.toHaveBeenCalled();
  });

  it('rejects malformed collection scopes after authorization', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'https://tuturuuu.com/api/v1/workspaces/workspace-id/external-projects?collectionSlugs=stories%2Fprivate'
      ),
      { params: Promise.resolve({ wsId: 'workspace-id' }) }
    );

    expect(response.status).toBe(400);
    expect(
      mocks.getWorkspaceExternalProjectScopedStudioData
    ).not.toHaveBeenCalled();
  });
});
