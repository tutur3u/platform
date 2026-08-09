import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadInitialUserGroups } from './bootstrap';

const mocks = vi.hoisted(() => ({
  admin: { kind: 'admin-client' },
  applyAttendance: vi.fn((groups) => groups),
  applySnapshot: vi.fn((groups) => groups),
  countGroups: vi.fn(),
  createAdminClient: vi.fn(),
  fetchAttendance: vi.fn(),
  fetchManagers: vi.fn(),
  getCountManagers: vi.fn(),
  getMemberships: vi.fn(),
  listGroups: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/groups-utils', () => ({
  applyAttendanceMemberCounts: mocks.applyAttendance,
  applyTodayAttendanceSnapshot: mocks.applySnapshot,
  fetchManagersForGroups: mocks.fetchManagers,
  fetchTodayAttendanceForGroups: mocks.fetchAttendance,
  getShouldCountManagersInAttendance: mocks.getCountManagers,
  getUserGroupMembershipsForActor: mocks.getMemberships,
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/table-repository', () => ({
  countUserGroupsForTable: mocks.countGroups,
  listUserGroupsForTable: mocks.listGroups,
}));

describe('loadInitialUserGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue(mocks.admin);
    mocks.getMemberships.mockResolvedValue(['group-1']);
    mocks.listGroups.mockResolvedValue([{ id: 'group-1', name: 'Group 1' }]);
    mocks.countGroups.mockResolvedValue(1);
    mocks.fetchManagers.mockResolvedValue(new Map());
    mocks.fetchAttendance.mockResolvedValue(new Map());
    mocks.getCountManagers.mockResolvedValue(false);
  });

  it('limits assigned users to actor-linked groups and enriches via admin', async () => {
    await expect(
      loadInitialUserGroups({
        actorId: 'actor-1',
        wsId: 'workspace-1',
      })
    ).resolves.toMatchObject({ count: 1 });

    expect(mocks.getMemberships).toHaveBeenCalledWith('workspace-1', 'actor-1');
    expect(mocks.listGroups).toHaveBeenCalledWith(
      expect.objectContaining({ accessibleGroupIds: ['group-1'] })
    );
    expect(mocks.fetchManagers).toHaveBeenCalledWith(mocks.admin, ['group-1']);
  });

  it('returns a genuine restricted empty result when no groups are assigned', async () => {
    mocks.getMemberships.mockResolvedValue([]);

    await expect(
      loadInitialUserGroups({ actorId: 'actor-1', wsId: 'workspace-1' })
    ).resolves.toEqual({ data: [], count: 0 });
    expect(mocks.listGroups).not.toHaveBeenCalled();
  });

  it('lets administrators query all groups without membership filtering', async () => {
    await loadInitialUserGroups({
      actorId: 'actor-1',
      hasManageUsers: true,
      wsId: 'workspace-1',
    });

    expect(mocks.getMemberships).not.toHaveBeenCalled();
    expect(mocks.listGroups).toHaveBeenCalledWith(
      expect.objectContaining({ accessibleGroupIds: null })
    );
  });

  it('does not seed request failures as successful empty data', async () => {
    const error = new Error('private server detail');
    mocks.getMemberships.mockRejectedValue(error);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(
      loadInitialUserGroups({ actorId: 'actor-1', wsId: 'workspace-1' })
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      'Error fetching initial user groups:',
      error
    );

    consoleError.mockRestore();
  });
});
