import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveWorkspaceRouteAccess: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: (
    ...args: Parameters<typeof mocks.resolveWorkspaceRouteAccess>
  ) => mocks.resolveWorkspaceRouteAccess(...args),
}));

vi.mock('@/lib/workspace-invite-links', () => ({
  normalizeInviteLinkDetails: (value: unknown) => value,
}));

const WORKSPACE_ID = 'workspace-requested';
const RESOLVED_WORKSPACE_ID = 'workspace-resolved';
const LINK_ID = 'invite-link-1';

function existingLinkQuery() {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.single = vi.fn(async () => ({
    data: { id: LINK_ID, ws_id: RESOLVED_WORKSPACE_ID },
    error: null,
  }));
  return query;
}

describe('/api/workspaces/[wsId]/invite-links/[linkId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: {
        membershipType: 'MEMBER',
        wsId: RESOLVED_WORKSPACE_ID,
      },
      user: { id: 'user-1' },
    });
  });

  it('updates through satellite access and scopes both reads and writes', async () => {
    const existing = existingLinkQuery();
    const updateQuery: Record<string, ReturnType<typeof vi.fn>> = {};
    updateQuery.update = vi.fn(() => updateQuery);
    updateQuery.eq = vi.fn(() => updateQuery);
    updateQuery.select = vi.fn(() => updateQuery);
    updateQuery.single = vi.fn(async () => ({
      data: { id: LINK_ID, max_uses: 8 },
      error: null,
    }));
    let inviteLinkCalls = 0;
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => {
        inviteLinkCalls += 1;
        return inviteLinkCalls === 1 ? existing : updateQuery;
      }),
    });
    const { PATCH } = await import('./route');
    const request = new Request('http://localhost/invite-link', {
      body: JSON.stringify({ maxUses: 8 }),
      method: 'PATCH',
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ linkId: LINK_ID, wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.resolveWorkspaceRouteAccess).toHaveBeenCalledWith(
      request,
      WORKSPACE_ID,
      ['manage_workspace_members']
    );
    expect(existing.eq).toHaveBeenCalledWith('ws_id', RESOLVED_WORKSPACE_ID);
    expect(updateQuery.eq).toHaveBeenCalledWith('ws_id', RESOLVED_WORKSPACE_ID);
  });

  it('deletes through satellite access and keeps the delete workspace-scoped', async () => {
    const existing = existingLinkQuery();
    const deleteEq = vi.fn();
    deleteEq
      .mockReturnValueOnce({ eq: deleteEq })
      .mockResolvedValueOnce({ error: null });
    const deleteQuery = { delete: vi.fn(() => ({ eq: deleteEq })) };
    let inviteLinkCalls = 0;
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => {
        inviteLinkCalls += 1;
        return inviteLinkCalls === 1 ? existing : deleteQuery;
      }),
    });
    const { DELETE } = await import('./route');
    const request = new Request('http://localhost/invite-link', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ linkId: LINK_ID, wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(200);
    expect(deleteEq).toHaveBeenNthCalledWith(1, 'id', LINK_ID);
    expect(deleteEq).toHaveBeenNthCalledWith(2, 'ws_id', RESOLVED_WORKSPACE_ID);
  });
});
