import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claims: vi.fn(),
  getExternalAppById: vi.fn(),
  getPermissions: vi.fn(),
  getWorkspaceMembers: vi.fn(),
  verifyMembership: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/auth/app-coordination', () => ({
  getBearerAppCoordinationToken: () => 'ttr_app_bearer',
  verifyAppCoordinationToken: () => ({ claims: mocks.claims(), ok: true }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  verifyWorkspaceMembershipType: mocks.verifyMembership,
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppById: mocks.getExternalAppById,
}));
vi.mock('@/lib/workspace-members', () => ({
  getWorkspaceMembers: mocks.getWorkspaceMembers,
}));

import {
  externalAppWorkspaceMemberScopes,
  loadExternalAppWorkspaceMembers,
  requireExternalAppWorkspaceMembersAccess,
} from './workspace-members';

const wsId = '22222222-2222-4222-8222-222222222222';
const readScopes = ['workspace:members:read', 'workspace:roles:read'];
const MANAGE = ['manage_workspace_members', 'manage_workspace_roles'];

const members = [
  {
    avatar_url: null,
    default_permissions: [],
    display_name: 'Member',
    email: 'member@example.com',
    id: 'user-2',
    is_creator: false,
    pending: false,
    roles: [],
  },
  {
    created_at: '2026-11-01T00:00:00.000Z',
    email: 'invitee@example.com',
    pending: true,
    roles: [],
  },
];

async function loadMembers(
  scopes: string[],
  permissions: string[],
  targetApp = 'fysh'
) {
  mocks.claims.mockReturnValue({
    email: 'actor@example.com',
    iat: Math.floor(Date.now() / 1000),
    scopes,
    sub: 'user-1',
    target_app: targetApp,
    workspace_id: wsId,
  });
  mocks.getPermissions.mockResolvedValue({
    containsPermission: (permission: string) =>
      permissions.includes(permission),
  });
  const access = await requireExternalAppWorkspaceMembersAccess({
    request: new Request('https://tuturuuu.com'),
    requiredScopes: [
      externalAppWorkspaceMemberScopes.membersRead,
      externalAppWorkspaceMemberScopes.rolesRead,
    ],
    wsId,
  });
  expect(access.ok).toBe(true);
  if (!access.ok) throw new Error('access denied');
  return loadExternalAppWorkspaceMembers(access);
}

function emails(result: Awaited<ReturnType<typeof loadMembers>>) {
  return [
    ...result.members.map((member) => member.email),
    ...result.invitations.map((invitation) => invitation.email),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getExternalAppById.mockImplementation(async (id: string) => ({
    allowedWorkspaceIds: [wsId],
    enabled: true,
    id,
    secretIssuedAt: null,
  }));
  mocks.verifyMembership.mockResolvedValue({ ok: true });
  mocks.getWorkspaceMembers.mockResolvedValue(members);
});

describe('external-app workspace member emails', () => {
  it('omits member and invitation emails for workspace:members:read', async () => {
    const result = await loadMembers(readScopes, MANAGE);

    expect(emails(result)).toEqual([null, null]);
    expect(result.members[0]).toMatchObject({ displayName: 'Member' });
    expect(result.invitations).toEqual([
      { createdAt: '2026-11-01T00:00:00.000Z', email: null },
    ]);
  });

  it('returns emails with the explicit scope and both manage permissions', async () => {
    const result = await loadMembers(
      [...readScopes, externalAppWorkspaceMemberScopes.membersEmailRead],
      MANAGE
    );

    expect(emails(result)).toEqual([
      'member@example.com',
      'invitee@example.com',
    ]);
  });

  it.each([[['manage_workspace_members']], [['manage_workspace_roles']], [[]]])(
    'omits emails with the scope but only %j',
    async (permissions) => {
      const result = await loadMembers(
        [...readScopes, externalAppWorkspaceMemberScopes.membersEmailRead],
        permissions
      );

      expect(emails(result)).toEqual([null, null]);
    }
  );

  it('is not covered by a wildcard grant', async () => {
    const result = await loadMembers(
      [...readScopes, '*', 'workspace:*', 'workspace.members:*'],
      MANAGE
    );

    expect(emails(result)).toEqual([null, null]);
  });

  it('returns emails to cybershield35 only before the RA expiry', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-24T12:00:00+07:00'));
      expect(
        emails(await loadMembers(readScopes, [], 'cybershield35'))
      ).toEqual(['member@example.com', 'invitee@example.com']);

      vi.setSystemTime(new Date('2026-11-25T23:59:00+07:00'));
      expect(
        emails(await loadMembers(readScopes, [], 'cybershield35'))
      ).toEqual([null, null]);
    } finally {
      vi.useRealTimers();
    }
  });
});
