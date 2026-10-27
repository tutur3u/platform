import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  access: vi.fn(),
  permissions: vi.fn(),
  teach: vi.fn(),
  teachGet: vi.fn(),
  cms: vi.fn(),
  seats: vi.fn(),
  session: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  normalizeWorkspaceId: async () => 'ws-a',
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
}));
vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.access,
}));
vi.mock('@/lib/workspace-role-members', () => ({
  normalizeRoleMembers: (rows: unknown) => rows,
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.session,
  withSessionAuth: (fn: (...args: unknown[]) => unknown) => {
    if (!mocks.teachGet.getMockImplementation())
      mocks.teachGet.mockImplementation(fn);
    return fn;
  },
}));
vi.mock('@/legacy-api-routes/v1/users/me/session-auth', () => ({
  CURRENT_USER_APP_SESSION_AUTH: {},
}));
vi.mock('@tuturuuu/payment-core/seat-limits', () => ({
  getEffectiveAvailableSeats: mocks.seats,
}));
vi.mock('@tuturuuu/education-core/teach/api', () => ({
  requireTeachWorkspaceAccess: mocks.teach,
  validateTeachCourse: async () => ({
    id: '11111111-1111-4111-8111-111111111111',
  }),
}));

import '../../../teach/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/members/route';
import { POST as invite } from '../app/api/v1/workspaces/[wsId]/members/batch-invite/route';

vi.mock('../lib/external-projects/access', () => ({
  hasRootExternalProjectsAdminPermission: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  requireWorkspaceExternalProjectMemberBootstrapAccess: vi.fn(),
}));
vi.mock('../lib/external-projects/team-invitations', () => ({
  attachExternalProjectInvitationRoles: vi.fn(),
  inviteExternalProjectTeamMembers: vi.fn(),
  updateExternalProjectTeamInvitationRoles: vi.fn(),
}));
vi.mock('@/lib/workspace-members', () => ({ getWorkspaceMembers: vi.fn() }));

import { POST as addRoleMembers } from '../legacy-api-routes/v1/workspaces/[wsId]/roles/[roleId]/members/route';
import { addExternalProjectRoleMembers } from '../lib/external-projects/team-access';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
const writes = vi.fn();
function query(initial: Row[]) {
  let rows = initial;
  const q = {
    select: () => q,
    eq: (key: string, value: unknown) => {
      rows = rows.filter((row) => row[key] === value);
      return q;
    },
    in: (key: string, values: unknown[]) => {
      rows = rows.filter((row) => values.includes(row[key]));
      return q;
    },
    order: () => q,
    insert: (payload: unknown) => {
      writes(payload);
      return q;
    },
    upsert: (payload: unknown) => {
      writes(payload);
      return q;
    },
    single: async () => ({ data: rows[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    // biome-ignore lint/suspicious/noThenProperty: Supabase builders are awaitable.
    then: (resolve: (result: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: rows, error: null })),
  };
  return q;
}
const db = { from: vi.fn((name: string) => query(tables[name] ?? [])) };
function allow(...names: string[]) {
  mocks.permissions.mockResolvedValue({
    wsId: 'ws-a',
    containsPermission: (name: string) => names.includes(name),
    withoutPermission: (name: string) => !names.includes(name),
  });
}
const own = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';
const context = { user: { id: 'actor' }, supabase: db };
beforeEach(() => {
  vi.clearAllMocks();
  allow();
  mocks.admin.mockResolvedValue(db);
  mocks.access.mockResolvedValue({ ok: true, permissions: { wsId: 'ws-a' } });
  mocks.session.mockResolvedValue({ ok: true, ...context });
  mocks.teach.mockResolvedValue({
    normalizedWsId: 'ws-a',
    sbAdmin: db,
    userId: 'actor',
  });
  mocks.seats.mockResolvedValue({
    status: { isSeatBased: false },
    effectiveAvailable: 100,
  });
  mocks.cms.mockResolvedValue({ admin: db, normalizedWorkspaceId: 'ws-a' });
  tables = {
    workspace_roles: [{ id: own, ws_id: 'ws-a' }],
    workspace_members: [{ user_id: own, ws_id: 'ws-a' }],
    workspace_user_groups_users: [
      {
        group_id: own,
        role: 'STUDENT',
        workspace_users: {
          id: own,
          email: 'synthetic@example.invalid',
          display_name: 'Synthetic',
        },
      },
    ],
  };
});
describe('SR-222 role members', () => {
  it('rejects non-workspace members before adding role rows', async () => {
    const response = await addRoleMembers(
      new Request('https://example.invalid/roles', {
        method: 'POST',
        body: JSON.stringify({ memberIds: [foreign] }),
      }),
      { params: Promise.resolve({ wsId: 'ws-a', roleId: own }) }
    );
    expect(response.status).toBe(400);
    expect(writes).not.toHaveBeenCalled();
  });
  it('retains role assignment for workspace members', async () => {
    const response = await addRoleMembers(
      new Request('https://example.invalid/roles', {
        method: 'POST',
        body: JSON.stringify({ memberIds: [own] }),
      }),
      { params: Promise.resolve({ wsId: 'ws-a', roleId: own }) }
    );
    expect(response.status).toBe(200);
    expect(writes).toHaveBeenCalledWith([{ user_id: own, role_id: own }]);
  });
});
it('SR-222 applies workspace membership validation to the CMS adapter', async () => {
  const response = await addExternalProjectRoleMembers({
    access: await mocks.cms(),
    roleId: own,
    request: new Request('https://example.invalid/roles', {
      method: 'POST',
      body: JSON.stringify({ memberIds: [foreign] }),
    }),
  });
  expect(response.status).toBe(400);
  expect(writes).not.toHaveBeenCalled();
});
it('retains valid CMS role assignment', async () => {
  const response = await addExternalProjectRoleMembers({
    access: await mocks.cms(),
    roleId: own,
    request: new Request('https://example.invalid/roles', {
      method: 'POST',
      body: JSON.stringify({ memberIds: [own] }),
    }),
  });
  expect(response.status).toBe(200);
  expect(writes).toHaveBeenCalledWith([{ user_id: own, role_id: own }]);
});
describe('SR-241 batch invitations', () => {
  function request() {
    return new Request('https://example.invalid/invite', {
      method: 'POST',
      body: JSON.stringify({ emails: ['synthetic@example.invalid'] }),
    });
  }
  const params = () => ({ params: Promise.resolve({ wsId: 'ws-a' }) });
  it('requires member management permission', async () => {
    expect((await invite(request(), params())).status).toBe(403);
    expect(writes).not.toHaveBeenCalled();
  });
  it('honors the workspace invitation stop setting', async () => {
    allow('manage_workspace_members');
    tables.workspace_secrets = [
      { ws_id: 'ws-a', name: 'DISABLE_INVITE', value: 'true' },
    ];
    expect((await invite(request(), params())).status).toBe(403);
    expect(writes).not.toHaveBeenCalled();
  });
  it('retains authorized onboarding invitations', async () => {
    allow('manage_workspace_members');
    expect((await invite(request(), params())).status).toBe(200);
    expect(writes).toHaveBeenCalledWith(
      expect.objectContaining({
        ws_id: 'ws-a',
        email: 'synthetic@example.invalid',
      })
    );
  });
});
describe('SR-243 Teach course members', () => {
  it('masks student emails for readers without private-info permission', async () => {
    const response = await mocks.teachGet(
      new Request('https://example.invalid/members'),
      context,
      { wsId: 'ws-a', courseId: own }
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data[0].email).toBeNull();
  });
  it('retains student emails for private-info readers', async () => {
    allow('view_users_private_info');
    const response = await mocks.teachGet(
      new Request('https://example.invalid/members'),
      context,
      { wsId: 'ws-a', courseId: own }
    );
    expect((await response.json()).data[0].email).toBe(
      'synthetic@example.invalid'
    );
  });
});
