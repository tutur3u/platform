import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getWorkspaceUserLinkForUser: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: mocks.getWorkspaceUserLinkForUser,
}));

vi.mock('@tuturuuu/utils/user-helper', () => ({
  getCurrentWorkspaceUser: vi.fn(),
}));

import {
  getUserGroupMembershipsForActor,
  verifyGroupAccessForActor,
} from './groups-utils';

describe('getUserGroupMembershipsForActor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses one admin-backed path for a satellite actor link and assignments', async () => {
    const terminalQuery = Promise.resolve({
      data: [{ group_id: 'group-1' }, { group_id: 'group-1' }],
      error: null,
    });
    const eq = vi.fn(() => terminalQuery);
    const select = vi.fn(() => ({ eq }));
    const admin = { from: vi.fn(() => ({ select })) };
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.getWorkspaceUserLinkForUser.mockResolvedValue({
      platform_user_id: 'actor-1',
      virtual_user_id: 'profile-1',
      ws_id: 'workspace-1',
    });

    await expect(
      getUserGroupMembershipsForActor('workspace-1', 'actor-1')
    ).resolves.toEqual(['group-1']);

    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.getWorkspaceUserLinkForUser).toHaveBeenCalledWith(
      'workspace-1',
      'actor-1',
      { authorizationClient: admin }
    );
    expect(admin.from).toHaveBeenCalledWith('workspace_user_groups_users');
    expect(eq).toHaveBeenCalledWith('user_id', 'profile-1');
  });

  it('returns no assignments when a valid member cannot be linked', async () => {
    const admin = { from: vi.fn() };
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.getWorkspaceUserLinkForUser.mockResolvedValue(null);

    await expect(
      getUserGroupMembershipsForActor('workspace-1', 'actor-1')
    ).resolves.toEqual([]);

    expect(admin.from).not.toHaveBeenCalled();
  });

  it('allows an assigned satellite actor into the requested group', async () => {
    const terminalQuery = Promise.resolve({
      data: [{ group_id: 'group-1' }],
      error: null,
    });
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => terminalQuery) })),
      })),
    };
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.getWorkspaceUserLinkForUser.mockResolvedValue({
      virtual_user_id: 'profile-1',
    });

    await expect(
      verifyGroupAccessForActor('workspace-1', 'group-1', 'actor-1')
    ).resolves.toBeUndefined();
  });
});
