import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  adminSupabase: { client: 'admin' },
  createAdminClient: vi.fn(),
  getWorkspaceMembers: vi.fn(),
  isWorkspaceUuidLiteral: vi.fn((value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ),
  resolveWorkspaceRouteAccess: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isWorkspaceUuidLiteral: (
    ...args: Parameters<typeof mocks.isWorkspaceUuidLiteral>
  ) => mocks.isWorkspaceUuidLiteral(...args),
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: (
    ...args: Parameters<typeof mocks.resolveWorkspaceRouteAccess>
  ) => mocks.resolveWorkspaceRouteAccess(...args),
}));

vi.mock('@/lib/workspace-members', () => ({
  getWorkspaceMembers: (
    ...args: Parameters<typeof mocks.getWorkspaceMembers>
  ) => mocks.getWorkspaceMembers(...args),
}));

describe('workspace members enhanced route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.createAdminClient.mockResolvedValue(mocks.adminSupabase);
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: { wsId: WORKSPACE_ID },
      user: { id: 'user-1' },
    });
    mocks.getWorkspaceMembers.mockResolvedValue([
      { email: 'member@example.com', id: 'user-1', pending: false },
    ]);
  });

  it('authorizes the caller before loading members through the admin-backed path', async () => {
    const { GET } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/members/enhanced/route'
    );
    const request = new NextRequest(
      `http://localhost/api/workspaces/${WORKSPACE_ID}/members/enhanced?status=joined`
    );

    const response = await GET(request, {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { email: 'member@example.com', id: 'user-1', pending: false },
    ]);
    expect(mocks.resolveWorkspaceRouteAccess).toHaveBeenCalledWith(
      request,
      WORKSPACE_ID,
      ['manage_workspace_members', 'manage_workspace_roles']
    );
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.getWorkspaceMembers).toHaveBeenCalledWith({
      sbAdmin: mocks.adminSupabase,
      status: 'joined',
      supabase: mocks.adminSupabase,
      wsId: WORKSPACE_ID,
    });
  });

  it('uses the workspace id resolved by shared authorization for handles', async () => {
    const { GET } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/members/enhanced/route'
    );
    const request = new NextRequest(
      'http://localhost/api/workspaces/Team-Handle/members/enhanced'
    );

    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'Team-Handle' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.resolveWorkspaceRouteAccess).toHaveBeenCalledWith(
      request,
      'Team-Handle',
      ['manage_workspace_members', 'manage_workspace_roles']
    );
    expect(mocks.getWorkspaceMembers).toHaveBeenCalledWith(
      expect.objectContaining({ wsId: WORKSPACE_ID })
    );
  });

  it('returns the shared authorization response before admin access', async () => {
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { message: 'Workspace access denied' },
        { status: 403 }
      ),
    });

    const { GET } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/members/enhanced/route'
    );
    const request = new NextRequest(
      `http://localhost/api/workspaces/${WORKSPACE_ID}/members/enhanced`
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Workspace access denied',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.getWorkspaceMembers).not.toHaveBeenCalled();
  });

  it('rejects unresolved non-UUID workspace ids before member queries', async () => {
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: { wsId: '[locale]' },
      user: { id: 'user-1' },
    });

    const { GET } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/members/enhanced/route'
    );
    const request = new NextRequest(
      'http://localhost/api/workspaces/[locale]/members/enhanced'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: '[locale]' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Workspace not found',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.getWorkspaceMembers).not.toHaveBeenCalled();
  });
});
