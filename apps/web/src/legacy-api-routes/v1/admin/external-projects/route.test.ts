import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireRootExternalProjectsAdminMock, storeMocks } = vi.hoisted(() => ({
  requireRootExternalProjectsAdminMock: vi.fn(),
  storeMocks: {
    createCanonicalExternalProject: vi.fn(),
    listCanonicalExternalProjects: vi.fn(),
  },
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireRootExternalProjectsAdmin: requireRootExternalProjectsAdminMock,
}));

vi.mock('@/lib/external-projects/store', () => ({
  createCanonicalExternalProject: storeMocks.createCanonicalExternalProject,
  listCanonicalExternalProjects: storeMocks.listCanonicalExternalProjects,
}));

import { GET, POST } from './route';

describe('admin external projects route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the access response when root permission is missing', async () => {
    requireRootExternalProjectsAdminMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
      }),
    });

    const response = await GET(
      new Request('http://localhost/api/v1/admin/external-projects')
    );

    expect(response.status).toBe(403);
  });

  it('lists canonical projects for root admins', async () => {
    requireRootExternalProjectsAdminMock.mockResolvedValue({
      admin: {},
      ok: true,
      user: { id: 'user-1' },
    });
    storeMocks.listCanonicalExternalProjects.mockResolvedValue([
      { id: 'junly-main' },
    ]);

    const response = await GET(
      new Request('http://localhost/api/v1/admin/external-projects')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ id: 'junly-main' }]);
  });

  it('creates canonical projects for root admins', async () => {
    requireRootExternalProjectsAdminMock.mockResolvedValue({
      admin: {},
      ok: true,
      user: { id: 'user-1' },
    });
    storeMocks.createCanonicalExternalProject.mockResolvedValue({
      id: 'junly-main',
    });

    const response = await POST(
      new Request('http://localhost/api/v1/admin/external-projects', {
        body: JSON.stringify({
          adapter: 'junly',
          allowed_collections: ['research-projects'],
          allowed_features: [],
          delivery_profile: {},
          display_name: 'Junly',
          id: 'junly-main',
          is_active: true,
          metadata: {},
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })
    );

    expect(response.status).toBe(201);
    expect(storeMocks.createCanonicalExternalProject).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        id: 'junly-main',
      }),
      {}
    );
  });
});
