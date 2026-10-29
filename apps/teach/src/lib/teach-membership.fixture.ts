import { beforeEach, vi } from 'vitest';

const access = vi.hoisted(() => ({
  workspace: vi.fn(),
  permissions: vi.fn(),
  withoutPermission: vi.fn(),
  client: vi.fn(),
  actor: vi.fn(),
  educationFlag: vi.fn(),
  membership: vi.fn(),
  contentRead: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  getSatelliteWorkspace: access.workspace,
  getSatelliteWorkspacePermissions: access.permissions,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: access.actor,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: access.client,
  createClient: access.client,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: access.membership,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
export const wsId = 'a8c83156-403a-4fad-986c-5c7041715420';
export const props = {
  params: Promise.resolve({
    wsId,
    locale: 'en',
    courseId: 'course',
    moduleId: 'module',
    setId: 'set',
    attemptId: 'attempt',
  }),
  searchParams: Promise.resolve({}),
  children: null,
  wsId,
};

beforeEach(() => {
  vi.clearAllMocks();
  access.membership.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
  access.actor.mockResolvedValue({ id: 'actor' });
  access.workspace.mockResolvedValue({ id: wsId });
  access.educationFlag.mockResolvedValue({
    data: { value: 'true' },
    error: null,
  });
  access.withoutPermission.mockReturnValue(false);
  access.permissions.mockResolvedValue({
    wsId,
    membershipType: 'MEMBER',
    withoutPermission: access.withoutPermission,
  });
  access.contentRead.mockImplementation(() => {
    throw new Error('PROTECTED_DATA_READ');
  });
  access.client.mockImplementation(() => ({
    storage: { from: access.contentRead },
    from: (table: string) => {
      if (table !== 'workspace_secrets') return access.contentRead();
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: access.educationFlag }) }),
        }),
      };
    },
  }));
});

export { access };
