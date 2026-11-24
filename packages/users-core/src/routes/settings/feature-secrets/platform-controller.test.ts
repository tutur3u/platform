import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/users-core/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/users-core/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: mocks.resolve,
}));
vi.mock('next/navigation', () => ({ unstable_rethrow: vi.fn() }));

import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { PUT } from './[secretName]/route';

type Grants = string[] | null;

function permissionsFor(grants: Grants) {
  if (!grants) return null;
  return {
    containsPermission: (p: string) => grants.includes(p),
    withoutPermission: (p: string) => !grants.includes(p),
  };
}

/** Workspace grants as a creator or `admin` member resolves them. */
const OWNER_GRANTS = [
  'admin',
  'manage_workspace_secrets',
  'send_user_group_report_emails',
  'send_user_group_post_emails',
];

function grant(workspace: Grants, root: Grants) {
  mocks.permissions.mockImplementation(async (wsId: string) =>
    permissionsFor(wsId === ROOT_WORKSPACE_ID ? root : workspace)
  );
}

function request(secretName: string, wsId = 'workspace-alias') {
  return PUT(
    new Request('https://contacts.example/api/gate', {
      method: 'PUT',
      body: JSON.stringify({ value: 'true' }),
    }),
    { params: Promise.resolve({ wsId, secretName }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue('workspace-1');
  const builder = {
    eq: vi.fn(() => builder),
    select: vi.fn(async () => ({ data: [{ id: 'flag-1' }], error: null })),
  };
  mocks.admin.mockResolvedValue({
    from: vi.fn(() => ({ update: vi.fn(() => builder), insert: vi.fn() })),
  });
});

it.each([
  'ENABLE_TOPIC_ANNOUNCEMENTS',
  'ENABLE_TOPIC_TEACHER_ASSIGNMENTS',
  'ENABLE_REPORT_EMAIL_SENDING',
])(
  'denies a workspace owner without root secrets access from enabling %s',
  async (secretName) => {
    grant(OWNER_GRANTS, null);

    expect((await request(secretName)).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.permissions).toHaveBeenCalledWith(
      ROOT_WORKSPACE_ID,
      expect.any(Request)
    );
  }
);

it('denies a root member without a secrets or roles grant', async () => {
  grant(OWNER_GRANTS, ['view_infrastructure']);

  expect((await request('ENABLE_TOPIC_ANNOUNCEMENTS')).status).toBe(403);
  expect(mocks.admin).not.toHaveBeenCalled();
});

it.each(['manage_workspace_secrets', 'manage_workspace_roles'])(
  'allows a platform admin holding root %s',
  async (rootGrant) => {
    grant([], [rootGrant]);

    expect((await request('ENABLE_TOPIC_ANNOUNCEMENTS')).status).toBe(200);
    expect(mocks.admin).toHaveBeenCalledOnce();
  }
);

it('still requires the workspace report email permission for the report gate', async () => {
  grant([], ['manage_workspace_secrets']);

  expect((await request('ENABLE_REPORT_EMAIL_SENDING')).status).toBe(403);
  expect(mocks.admin).not.toHaveBeenCalled();
});

it('reuses the workspace permissions when the target is the root workspace', async () => {
  mocks.resolve.mockResolvedValue(ROOT_WORKSPACE_ID);
  grant(null, ['manage_workspace_secrets']);

  expect((await request('ENABLE_TOPIC_ANNOUNCEMENTS')).status).toBe(200);
  expect(mocks.permissions).toHaveBeenCalledOnce();
});
