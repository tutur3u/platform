import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: {
    requireCmsRootExternalProjectsAdmin: vi.fn(),
  },
  store: {
    createCanonicalExternalProject: vi.fn(),
    listCanonicalExternalProjects: vi.fn(),
    updateCanonicalExternalProject: vi.fn(),
  },
}));

vi.mock('@/lib/external-projects/admin-access', () => ({
  requireCmsRootExternalProjectsAdmin:
    mocks.access.requireCmsRootExternalProjectsAdmin,
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
  createCanonicalExternalProject: mocks.store.createCanonicalExternalProject,
  listCanonicalExternalProjects: mocks.store.listCanonicalExternalProjects,
  updateCanonicalExternalProject: mocks.store.updateCanonicalExternalProject,
}));

vi.mock('@/lib/external-projects/constants', () => ({
  EXTERNAL_PROJECT_ADAPTER_OPTIONS: ['junly', 'yoola'],
}));

import { PATCH } from './[canonicalId]/route';
import { GET, POST } from './route';

describe('CMS admin site template routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the app-session access response when root access is missing', async () => {
    mocks.access.requireCmsRootExternalProjectsAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
      }),
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.store.listCanonicalExternalProjects).not.toHaveBeenCalled();
  });

  it('creates a site template for CMS root admins', async () => {
    mocks.access.requireCmsRootExternalProjectsAdmin.mockResolvedValue({
      admin: { client: 'admin' },
      ok: true,
      user: { id: 'user-1' },
    });
    mocks.store.createCanonicalExternalProject.mockResolvedValue({
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
    expect(mocks.store.createCanonicalExternalProject).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        id: 'junly-main',
      }),
      { client: 'admin' }
    );
  });

  it('updates a site template for CMS root admins', async () => {
    mocks.access.requireCmsRootExternalProjectsAdmin.mockResolvedValue({
      admin: { client: 'admin' },
      ok: true,
      user: { id: 'user-1' },
    });
    mocks.store.updateCanonicalExternalProject.mockResolvedValue({
      id: 'junly-main',
    });

    const response = await PATCH(
      new Request(
        'http://localhost/api/v1/admin/external-projects/junly-main',
        {
          body: JSON.stringify({
            display_name: 'Junly Studio',
            is_active: false,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({ canonicalId: 'junly-main' }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.store.updateCanonicalExternalProject).toHaveBeenCalledWith(
      'junly-main',
      expect.objectContaining({
        actorId: 'user-1',
        display_name: 'Junly Studio',
        is_active: false,
      }),
      { client: 'admin' }
    );
  });
});
