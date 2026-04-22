import { beforeEach, describe, expect, it, vi } from 'vitest';

const { accessMocks, storeMocks } = vi.hoisted(() => ({
  accessMocks: {
    requireRootExternalProjectsAdmin: vi.fn(),
  },
  storeMocks: {
    listExternalProjectWorkspaceBindingSummaries: vi.fn(),
  },
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireRootExternalProjectsAdmin:
    accessMocks.requireRootExternalProjectsAdmin,
}));

vi.mock('@/lib/external-projects/store', () => ({
  listExternalProjectWorkspaceBindingSummaries:
    storeMocks.listExternalProjectWorkspaceBindingSummaries,
}));

import { GET } from './route';

describe('admin external project bindings index route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the access response when root permission is missing', async () => {
    accessMocks.requireRootExternalProjectsAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
      }),
    });

    const response = await GET(
      new Request('http://localhost/api/v1/admin/external-project-bindings')
    );

    expect(response.status).toBe(403);
  });

  it('lists workspace binding summaries for root admins', async () => {
    accessMocks.requireRootExternalProjectsAdmin.mockResolvedValue({
      admin: {},
      ok: true,
    });
    storeMocks.listExternalProjectWorkspaceBindingSummaries.mockResolvedValue([
      { id: 'ws-1', name: 'Workspace 1' },
    ]);

    const response = await GET(
      new Request('http://localhost/api/v1/admin/external-project-bindings')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: 'ws-1', name: 'Workspace 1' },
    ]);
  });
});
