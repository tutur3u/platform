import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: {
    requireCmsRootExternalProjectsAdmin: vi.fn(),
    resolveWorkspaceExternalProjectBinding: vi.fn(),
  },
  store: {
    updateWorkspaceExternalProjectBinding: vi.fn(),
  },
}));

vi.mock('@/lib/external-projects/admin-access', () => ({
  requireCmsRootExternalProjectsAdmin:
    mocks.access.requireCmsRootExternalProjectsAdmin,
}));

vi.mock('@/lib/external-projects/access', () => ({
  resolveWorkspaceExternalProjectBinding:
    mocks.access.resolveWorkspaceExternalProjectBinding,
}));

vi.mock('@/lib/external-projects/admin-store', () => ({
  CmsExternalProjectAdminError: class CmsExternalProjectAdminError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
  updateWorkspaceExternalProjectBinding:
    mocks.store.updateWorkspaceExternalProjectBinding,
}));

import { GET, PATCH } from './route';

describe('CMS admin site project connection route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the current site project connection for CMS root admins', async () => {
    mocks.access.requireCmsRootExternalProjectsAdmin.mockResolvedValue({
      admin: { client: 'admin' },
      ok: true,
      user: { id: 'user-1' },
    });
    mocks.access.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
      canonical_id: 'junly-main',
      enabled: true,
    });

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ workspaceId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      canonical_id: 'junly-main',
      enabled: true,
    });
  });

  it('updates a site project connection and records the CMS actor', async () => {
    mocks.access.requireCmsRootExternalProjectsAdmin.mockResolvedValue({
      admin: { client: 'admin' },
      ok: true,
      user: { id: 'user-1' },
    });
    mocks.store.updateWorkspaceExternalProjectBinding.mockResolvedValue({
      canonical_id: 'junly-main',
      enabled: true,
    });

    const response = await PATCH(
      new Request('http://localhost', {
        body: JSON.stringify({ canonicalId: 'junly-main' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      }),
      {
        params: Promise.resolve({ workspaceId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(
      mocks.store.updateWorkspaceExternalProjectBinding
    ).toHaveBeenCalledWith({
      actorId: 'user-1',
      canonicalId: 'junly-main',
      db: { client: 'admin' },
      workspaceId: 'ws-1',
    });
  });
});
