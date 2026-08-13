import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
  getWorkspaceUserLinkForUser: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
  getWorkspace: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: mocks.getWorkspaceUserLinkForUser,
}));

import { getContactsWorkspaceUserLink } from './workspace';

describe('getContactsWorkspaceUserLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a no-cookie admin client for an explicit satellite actor', async () => {
    const actor = {
      app_metadata: {},
      aud: 'authenticated',
      created_at: '2026-08-13T00:00:00.000Z',
      email: 'member@example.com',
      id: 'member-id',
      user_metadata: {},
    };
    const adminClient = { from: vi.fn() };
    const linkedUser = { virtual_user_id: 'workspace-user-id' };
    mocks.createAdminClient.mockResolvedValue(adminClient);
    mocks.getWorkspaceUserLinkForUser.mockResolvedValue(linkedUser);

    await expect(
      getContactsWorkspaceUserLink('workspace-id', actor)
    ).resolves.toBe(linkedUser);

    expect(mocks.getSatelliteAppSessionUser).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.getWorkspaceUserLinkForUser).toHaveBeenCalledWith(
      'workspace-id',
      'member-id',
      { authorizationClient: adminClient }
    );
  });

  it('returns null without creating an admin client when unauthenticated', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);

    await expect(getContactsWorkspaceUserLink('workspace-id')).resolves.toBe(
      null
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
