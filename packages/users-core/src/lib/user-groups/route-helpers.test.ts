import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  resolveUserGroupAppSessionUser: vi.fn(),
  resolveWorkspaceId: vi.fn(),
  resolveWorkspaceIdForPrincipal: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/constants', () => ({
  PERSONAL_WORKSPACE_SLUG: 'personal',
  resolveWorkspaceId: mocks.resolveWorkspaceId,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  resolveWorkspaceIdForPrincipal: mocks.resolveWorkspaceIdForPrincipal,
}));

vi.mock('./route-auth', () => ({
  resolveUserGroupAppSessionUser: mocks.resolveUserGroupAppSessionUser,
}));

import { resolveUserGroupRouteWorkspaceId } from './route-helpers';

describe('resolveUserGroupRouteWorkspaceId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspaceId.mockImplementation((value: string) => value);
  });

  it('resolves a personal workspace from a verified satellite actor', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/personal/settings/configs'
    );
    const actor = { email: 'member@example.com', id: 'user-1' };
    const admin = { from: vi.fn() };

    mocks.resolveUserGroupAppSessionUser.mockReturnValue(actor);
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.resolveWorkspaceIdForPrincipal.mockResolvedValue('workspace-1');

    await expect(
      resolveUserGroupRouteWorkspaceId('personal', request)
    ).resolves.toBe('workspace-1');

    expect(mocks.resolveWorkspaceIdForPrincipal).toHaveBeenCalledWith({
      authorizationClient: admin,
      principal: actor,
      wsId: 'personal',
    });
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
  });

  it('preserves the request-scoped Supabase fallback for personal workspaces', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/personal/settings/configs'
    );

    mocks.resolveUserGroupAppSessionUser.mockReturnValue(null);
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-cookie');

    await expect(
      resolveUserGroupRouteWorkspaceId('personal', request)
    ).resolves.toBe('workspace-cookie');

    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      undefined,
      request
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('does not invoke auth resolution for explicit workspace identifiers', async () => {
    mocks.resolveWorkspaceId.mockReturnValue('workspace-uuid');

    await expect(
      resolveUserGroupRouteWorkspaceId('workspace-uuid')
    ).resolves.toBe('workspace-uuid');

    expect(mocks.resolveUserGroupAppSessionUser).not.toHaveBeenCalled();
    expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
  });
});
