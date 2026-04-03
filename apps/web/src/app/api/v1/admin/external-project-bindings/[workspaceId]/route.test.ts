import { beforeEach, describe, expect, it, vi } from 'vitest';

const { accessMocks } = vi.hoisted(() => ({
  accessMocks: {
    requireRootExternalProjectsAdmin: vi.fn(),
    resolveWorkspaceExternalProjectBinding: vi.fn(),
  },
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireRootExternalProjectsAdmin:
    accessMocks.requireRootExternalProjectsAdmin,
  resolveWorkspaceExternalProjectBinding:
    accessMocks.resolveWorkspaceExternalProjectBinding,
}));

import { GET, PATCH } from './route';

describe('admin external project binding route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns current bindings for root admins', async () => {
    accessMocks.requireRootExternalProjectsAdmin.mockResolvedValue({
      admin: {},
      ok: true,
    });
    accessMocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
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

  it('updates bindings through the root-managed rpc', async () => {
    const rpcMock = vi.fn().mockResolvedValue({ error: null });

    accessMocks.requireRootExternalProjectsAdmin.mockResolvedValue({
      admin: {
        rpc: rpcMock,
      },
      ok: true,
    });
    accessMocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
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
    expect(rpcMock).toHaveBeenCalledWith(
      'set_workspace_external_project_binding',
      {
        p_destination_ws_id: 'ws-1',
        p_next_canonical_id: 'junly-main',
      }
    );
  });
});
