import { beforeEach, describe, expect, it, vi } from 'vitest';

const { accessMocks, storeMocks } = vi.hoisted(() => ({
  accessMocks: {
    requireRootExternalProjectsAdmin: vi.fn(),
  },
  storeMocks: {
    listWorkspaceExternalProjectBindingAudits: vi.fn(),
  },
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireRootExternalProjectsAdmin:
    accessMocks.requireRootExternalProjectsAdmin,
}));

vi.mock('@/lib/external-projects/store', () => ({
  listWorkspaceExternalProjectBindingAudits:
    storeMocks.listWorkspaceExternalProjectBindingAudits,
}));

import { GET } from './route';

describe('admin external project audits route', () => {
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
      new Request('http://localhost/api/v1/admin/external-project-audits')
    );

    expect(response.status).toBe(403);
  });

  it('lists binding audits for root admins', async () => {
    accessMocks.requireRootExternalProjectsAdmin.mockResolvedValue({
      admin: {},
      ok: true,
      user: { id: 'user-1' },
    });
    storeMocks.listWorkspaceExternalProjectBindingAudits.mockResolvedValue([
      { id: 'audit-1' },
    ]);

    const response = await GET(
      new Request('http://localhost/api/v1/admin/external-project-audits')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ id: 'audit-1' }]);
  });
});
