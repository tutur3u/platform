import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  getPermissions: vi.fn(),
  withoutPermission: vi.fn(),
  educationFlag: vi.fn(),
  membership: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  getSatelliteWorkspace: access.getWorkspace,
  getSatelliteWorkspacePermissions: access.getPermissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: access.educationFlag }) }),
      }),
    }),
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: access.membership,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: async () => ({ id: 'actor' }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import { resolveRouteWorkspace } from './resolve-route-workspace';

const wsId = 'a8c83156-403a-4fad-986c-5c7041715420';
const workspace = { id: wsId, name: 'Private workspace' };

beforeEach(() => {
  vi.clearAllMocks();
  access.membership.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
  access.getWorkspace.mockResolvedValue(workspace);
  access.educationFlag.mockResolvedValue({
    data: { value: 'true' },
    error: null,
  });
  access.withoutPermission.mockReturnValue(false);
  access.getPermissions.mockResolvedValue({
    wsId,
    membershipType: 'MEMBER',
    withoutPermission: access.withoutPermission,
  });
});

describe('Teach page workspace boundary', () => {
  it('rejects a non-member before reading workspace data', async () => {
    access.getPermissions.mockResolvedValue(null);
    await expect(resolveRouteWorkspace(wsId, null)).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    expect(access.getWorkspace).not.toHaveBeenCalled();
  });

  it('rejects a member without the required education permission before reading data', async () => {
    access.withoutPermission.mockReturnValue(true);
    await expect(resolveRouteWorkspace(wsId, 'ai_lab')).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    expect(access.getWorkspace).not.toHaveBeenCalled();
  });

  it('fails closed if the authorization lookup fails', async () => {
    access.getPermissions.mockRejectedValue(
      new Error('authorization unavailable')
    );
    await expect(resolveRouteWorkspace(wsId, null)).rejects.toThrow(
      'authorization unavailable'
    );
    expect(access.getWorkspace).not.toHaveBeenCalled();
  });

  it('allows an authorized member and checks access before reading the workspace', async () => {
    await expect(resolveRouteWorkspace(wsId, null)).resolves.toEqual({
      routeWsId: wsId,
      resolvedWsId: wsId,
      workspace,
    });
    expect(access.getPermissions).toHaveBeenCalledWith('teach', wsId);
    expect(access.withoutPermission).not.toHaveBeenCalled();
    expect(access.getPermissions.mock.invocationCallOrder[0]).toBeLessThan(
      access.getWorkspace.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('uses the permission specific to the page before reading data', async () => {
    await resolveRouteWorkspace(wsId, 'view_user_groups_reports');
    expect(access.withoutPermission).toHaveBeenCalledWith(
      'view_user_groups_reports'
    );
  });

  it('uses the authorized canonical workspace for a personal alias', async () => {
    await expect(resolveRouteWorkspace('personal', null)).resolves.toEqual({
      routeWsId: 'personal',
      resolvedWsId: wsId,
      workspace,
    });
    expect(access.getPermissions).toHaveBeenCalledWith('teach', 'personal');
    expect(access.getWorkspace).toHaveBeenCalledWith('teach', wsId);
  });

  it('returns notFound for a missing workspace after authorization', async () => {
    access.getWorkspace.mockResolvedValue(null);
    await expect(resolveRouteWorkspace(wsId, null)).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
  });
  it.each([
    { data: null, error: null },
    { data: { value: 'true' }, error: new Error('flag unavailable') },
  ])(
    'fails closed when the education flag is missing or unavailable',
    async (result) => {
      access.educationFlag.mockResolvedValue(result);
      await expect(resolveRouteWorkspace(wsId, 'ai_lab')).rejects.toThrow(
        result.error
          ? 'Failed to verify Teach education access'
          : 'NEXT_NOT_FOUND'
      );
      expect(access.getWorkspace).not.toHaveBeenCalled();
    }
  );
  it('rejects a creator permission override without a full membership row', async () => {
    access.membership.mockResolvedValue({
      ok: false,
      error: 'membership_missing',
    });
    await expect(resolveRouteWorkspace(wsId, 'ai_lab')).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    expect(access.educationFlag).not.toHaveBeenCalled();
    expect(access.getWorkspace).not.toHaveBeenCalled();
  });
});
