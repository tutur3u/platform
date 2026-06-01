import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  adminSupabase: { client: 'admin' },
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  getWorkspaceMembers: vi.fn(),
  isWorkspaceUuidLiteral: vi.fn((value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ),
  normalizeWorkspaceId: vi.fn(),
  requestSupabase: { client: 'request' },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  isWorkspaceUuidLiteral: (
    ...args: Parameters<typeof mocks.isWorkspaceUuidLiteral>
  ) => mocks.isWorkspaceUuidLiteral(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
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

    mocks.createClient.mockResolvedValue(mocks.requestSupabase);
    mocks.createAdminClient.mockResolvedValue(mocks.adminSupabase);
    mocks.normalizeWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.getWorkspaceMembers.mockResolvedValue([
      { email: 'member@example.com', id: 'user-1', pending: false },
    ]);
  });

  it('normalizes a raw workspace segment and loads members through the admin-backed path', async () => {
    const { GET } = await import(
      '@/app/api/workspaces/[wsId]/members/enhanced/route'
    );
    const request = new NextRequest(
      'http://localhost/api/workspaces/team-handle/members/enhanced?status=joined'
    );

    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'team-handle' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { email: 'member@example.com', id: 'user-1', pending: false },
    ]);
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'team-handle',
      mocks.requestSupabase,
      request
    );
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      request,
      wsId: WORKSPACE_ID,
    });
    expect(mocks.getWorkspaceMembers).toHaveBeenCalledWith({
      sbAdmin: mocks.adminSupabase,
      status: 'joined',
      supabase: mocks.adminSupabase,
      wsId: WORKSPACE_ID,
    });
  });

  it('rejects unresolved non-UUID workspace placeholders before member queries', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValue('[locale]');

    const { GET } = await import(
      '@/app/api/workspaces/[wsId]/members/enhanced/route'
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
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(mocks.getWorkspaceMembers).not.toHaveBeenCalled();
  });
});
