import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const membershipMaybeSingle = vi.fn();
  const membershipEqUserId = vi.fn(() => ({
    maybeSingle: membershipMaybeSingle,
  }));
  const membershipEqTeamId = vi.fn(() => ({ eq: membershipEqUserId }));
  const membershipSelect = vi.fn(() => ({ eq: membershipEqTeamId }));
  const privateDb = {
    from: vi.fn(() => ({ select: membershipSelect })),
  };
  const sbAdmin = {
    schema: vi.fn(() => privateDb),
  };

  return {
    getNovaAppSessionUserFromRequest: vi.fn(),
    getNovaPlatformRole: vi.fn(),
    membershipEqTeamId,
    membershipEqUserId,
    membershipMaybeSingle,
    membershipSelect,
    privateDb,
    sbAdmin,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => mocks.sbAdmin),
}));

vi.mock('@/lib/app-session', () => ({
  getNovaAppSessionUserFromRequest: mocks.getNovaAppSessionUserFromRequest,
  getNovaPlatformRole: mocks.getNovaPlatformRole,
}));

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  authorizeNovaRoleManager,
  authorizeNovaTeamProfileEditor,
} from './nova-team-api-auth';

describe('Nova team API authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNovaAppSessionUserFromRequest.mockReturnValue({
      email: 'manager@example.com',
      id: 'user-1',
    });
    mocks.getNovaPlatformRole.mockResolvedValue({
      allow_challenge_management: false,
      allow_manage_all_challenges: false,
      allow_role_management: true,
      enabled: true,
    });
    mocks.membershipMaybeSingle.mockResolvedValue({
      data: { team_id: 'team-1' },
      error: null,
    });
  });

  it('rejects missing app-session identity before creating an admin client', async () => {
    mocks.getNovaAppSessionUserFromRequest.mockReturnValueOnce(null);

    const result = await authorizeNovaRoleManager(
      new Request('http://localhost/api/v1/nova/teams')
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('requires enabled role-management for team administration', async () => {
    mocks.getNovaPlatformRole.mockResolvedValueOnce({
      allow_challenge_management: false,
      allow_manage_all_challenges: false,
      allow_role_management: false,
      enabled: true,
    });

    const result = await authorizeNovaRoleManager(
      new Request('http://localhost/api/v1/nova/teams')
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('allows enabled role managers', async () => {
    const result = await authorizeNovaRoleManager(
      new Request('http://localhost/api/v1/nova/teams')
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.user.id).toBe('user-1');
      expect(result.value.privateDb).toBe(mocks.privateDb);
    }
  });

  it('allows enabled target team members to edit profile fields', async () => {
    mocks.getNovaPlatformRole.mockResolvedValueOnce({
      allow_challenge_management: false,
      allow_manage_all_challenges: false,
      allow_role_management: false,
      enabled: true,
    });

    const result = await authorizeNovaTeamProfileEditor(
      new Request('http://localhost/api/v1/nova/teams/team-1'),
      'team-1'
    );

    expect(result.ok).toBe(true);
    expect(mocks.privateDb.from).toHaveBeenCalledWith('nova_team_members');
    expect(mocks.membershipEqTeamId).toHaveBeenCalledWith('team_id', 'team-1');
    expect(mocks.membershipEqUserId).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('rejects enabled users who are not members of the target team', async () => {
    mocks.getNovaPlatformRole.mockResolvedValueOnce({
      allow_challenge_management: false,
      allow_manage_all_challenges: false,
      allow_role_management: false,
      enabled: true,
    });
    mocks.membershipMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await authorizeNovaTeamProfileEditor(
      new Request('http://localhost/api/v1/nova/teams/team-1'),
      'team-1'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});
