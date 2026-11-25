import { beforeEach, describe, expect, it, vi } from 'vitest';

const WS = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  getWorkspaceInviteStatus: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));
vi.mock('@/lib/workspace-invitations/status', () => ({
  getWorkspaceInviteStatus: mocks.getWorkspaceInviteStatus,
}));

import { authorizeWorkspaceSessionAppTokenExchange } from './workspace-session';

function authorize() {
  return authorizeWorkspaceSessionAppTokenExchange({
    admin: {} as never,
    allowedWorkspaceIds: [WS],
    authEmail: 'a@example.com',
    userId: 'user-1',
    workspaceId: WS,
  });
}

describe('authorizeWorkspaceSessionAppTokenExchange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceInviteStatus.mockResolvedValue({ status: 'none' });
  });

  it.each([
    { error: 'membership_missing', ok: false },
    { error: 'membership_type_mismatch', membershipType: 'GUEST', ok: false },
  ])('returns NOT_A_MEMBER for a confirmed non-member (%o)', async (result) => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue(result);
    expect(await authorize()).toEqual({
      code: 'NOT_A_MEMBER',
      error: 'Forbidden',
      ok: false,
      status: 403,
    });
  });

  it('stays generic when the invite check sees a concurrent join', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_missing',
      ok: false,
    });
    mocks.getWorkspaceInviteStatus.mockResolvedValue({ status: 'member' });
    expect(await authorize()).toEqual({
      error: 'Forbidden',
      ok: false,
      status: 403,
    });
  });

  it('keeps NOT_A_MEMBER for a guest whatever the invite check returns', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_type_mismatch',
      membershipType: 'GUEST',
      ok: false,
    });
    mocks.getWorkspaceInviteStatus.mockResolvedValue({ status: 'member' });
    expect(await authorize()).toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('prefers PENDING_WORKSPACE_INVITE over NOT_A_MEMBER', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_missing',
      ok: false,
    });
    mocks.getWorkspaceInviteStatus.mockResolvedValue({
      invitation: { id: 'invite-1' },
      status: 'pending_invite',
    });
    expect(await authorize()).toMatchObject({
      code: 'PENDING_WORKSPACE_INVITE',
      status: 403,
    });
  });

  it('never claims NOT_A_MEMBER when the lookup fails or the app is unlinked', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_lookup_failed',
      ok: false,
    });
    const failed = await authorize();
    expect(failed).toMatchObject({ ok: false, status: 500 });
    expect(failed).not.toHaveProperty('code');

    const unlinked = await authorizeWorkspaceSessionAppTokenExchange({
      admin: {} as never,
      allowedWorkspaceIds: [],
      userId: 'user-1',
      workspaceId: WS,
    });
    expect(unlinked).toEqual({
      error: 'App is not linked to this workspace',
      ok: false,
      status: 403,
    });
  });
});
