import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
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
  getPermissions: mocks.getPermissions,
  getWorkspace: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: mocks.getWorkspaceUserLinkForUser,
}));

import {
  getContactsWorkspacePermissions,
  getContactsWorkspaceUserLink,
} from './workspace';

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

  it('repairs the Contacts profile before resolving workspace permissions', async () => {
    const actor = {
      app_metadata: {},
      aud: 'authenticated',
      created_at: '2026-08-14T00:00:00.000Z',
      email: 'member@example.com',
      id: 'member-id',
      user_metadata: {},
    };
    const adminClient = { from: vi.fn() };
    const permissions = { containsPermission: vi.fn() };
    mocks.createAdminClient.mockResolvedValue(adminClient);
    mocks.getWorkspaceUserLinkForUser.mockResolvedValue({
      virtual_user_id: 'workspace-user-id',
    });
    mocks.getPermissions.mockResolvedValue(permissions);

    await expect(
      getContactsWorkspacePermissions('workspace-id', actor)
    ).resolves.toBe(permissions);

    expect(
      mocks.getWorkspaceUserLinkForUser.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.getPermissions.mock.invocationCallOrder[0]!);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: actor,
      wsId: 'workspace-id',
    });
  });

  it('does not resolve permissions when the Contacts profile cannot be repaired', async () => {
    const actor = {
      app_metadata: {},
      aud: 'authenticated',
      created_at: '2026-08-14T00:00:00.000Z',
      email: 'member@example.com',
      id: 'member-id',
      user_metadata: {},
    };
    mocks.createAdminClient.mockResolvedValue({ from: vi.fn() });
    mocks.getWorkspaceUserLinkForUser.mockResolvedValue(null);

    await expect(
      getContactsWorkspacePermissions('workspace-id', actor)
    ).resolves.toBeNull();
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });
});
