import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUT } from './route';

const ACTOR = 'a1000000-0000-4000-8000-000000000001';
const TARGET = 'a1000000-0000-4000-8000-000000000002';

const mocks = vi.hoisted(() => ({
  claims: vi.fn(),
  permissions: vi.fn(),
  role: vi.fn(),
  update: vi.fn(),
  updateTarget: vi.fn(),
  from: vi.fn(),
  admin: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({ auth: { getClaims: mocks.claims } }),
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));

function updateRole({ userId = TARGET, body = '{"enabled":false}' } = {}) {
  return PUT(
    new Request(`http://localhost/api/v1/platform/users/${userId}/roles`, {
      method: 'PUT',
      body,
      headers: { 'x-ttr-audit-actor-id': TARGET },
    }),
    { params: Promise.resolve({ userId }) }
  );
}

describe('platform role updates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.claims.mockResolvedValue({
      data: { claims: { sub: ACTOR, aal: 'aal2' } },
      error: null,
    });
    mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
    mocks.role.mockResolvedValue({
      data: { enabled: true, allow_role_management: true },
      error: null,
    });
    mocks.update.mockReturnValue({
      eq: mocks.updateTarget.mockReturnValue({
        select: () => ({
          maybeSingle: async () => ({
            data: { user_id: TARGET, enabled: false },
            error: null,
          }),
        }),
      }),
    });
    mocks.admin.mockResolvedValue({ from: mocks.from });
    mocks.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mocks.role }) }),
      update: mocks.update,
    });
  });

  it('requires a verified session', async () => {
    mocks.claims.mockResolvedValue({ data: null, error: { code: 'invalid' } });
    expect((await updateRole()).status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('preserves the root workspace permission requirement', async () => {
    mocks.permissions.mockResolvedValue({ withoutPermission: () => true });
    expect((await updateRole()).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    { enabled: false, allow_role_management: true },
    { enabled: true, allow_role_management: false },
  ])('requires an enabled role manager with role flags %j', async (data) => {
    mocks.role.mockResolvedValue({ data, error: null });
    expect((await updateRole()).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('requires an MFA-verified session', async () => {
    mocks.claims.mockResolvedValue({
      data: { claims: { sub: ACTOR, aal: 'aal1' } },
      error: null,
    });
    expect((await updateRole()).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects changes to the actor even with uppercase hex in the path', async () => {
    expect((await updateRole({ userId: ACTOR.toUpperCase() })).status).toBe(
      403
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('preserves the database last-manager conflict', async () => {
    mocks.updateTarget.mockReturnValue({
      select: () => ({
        maybeSingle: async () => ({ data: null, error: { code: 'PT409' } }),
      }),
    });
    expect((await updateRole()).status).toBe(409);
  });

  it('handles a role revoked between authorization and the write', async () => {
    mocks.updateTarget.mockReturnValue({
      select: () => ({
        maybeSingle: async () => ({ data: null, error: { code: '42501' } }),
      }),
    });
    expect((await updateRole()).status).toBe(403);
  });

  it('writes only the requested flags and logs the verified actor and target', async () => {
    const audit = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const response = await updateRole();
      expect(response.status).toBe(200);
      expect(mocks.admin).toHaveBeenCalledWith({
        noCookie: true,
        auditActorId: ACTOR,
      });
      expect(mocks.update).toHaveBeenCalledWith({ enabled: false });
      expect(mocks.updateTarget).toHaveBeenCalledWith('user_id', TARGET);
      expect(audit).toHaveBeenCalledWith('Platform user roles updated', {
        actorId: ACTOR,
        targetId: TARGET,
        changes: { enabled: false },
      });
    } finally {
      audit.mockRestore();
    }
  });

  it.each(['{', '{}', '{"enabled":"true"}', '{"user_id":"extra"}'])(
    'rejects malformed or unsupported role updates %s',
    async (body) => {
      expect((await updateRole({ body })).status).toBe(400);
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );
});
