import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  satellite: vi.fn(),
  app: vi.fn(),
  supabase: vi.fn(),
  permissions: vi.fn(),
  admin: vi.fn(),
  identity: vi.fn(),
  from: vi.fn(),
  member: vi.fn(),
  filters: [] as [string, unknown][],
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mock.satellite,
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionUserFromRequest: mock.app,
}));
vi.mock('@tuturuuu/auth/supabase-session-user', () => ({
  resolveSupabaseSessionRequest: mock.supabase,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mock.permissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mock.admin,
  createClient: mock.admin,
}));

import { authorizeEmployeeCreation } from './employee-creation-authorization';

const user = { id: 'actor', email: 'actor@tuturuuu.com' };
beforeEach(() => {
  vi.clearAllMocks();
  mock.satellite.mockResolvedValue(user);
  mock.app.mockReturnValue(user);
  mock.supabase.mockResolvedValue({ user });
  mock.permissions.mockResolvedValue({
    membershipType: 'MEMBER',
    containsPermission: (p: string) => p === 'manage_internal_accounts',
  });
  mock.filters = [];
  mock.member.mockResolvedValue({ data: { type: 'MEMBER' }, error: null });
  mock.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((key: string, value: unknown) => {
        mock.filters.push([key, value]);
        return query;
      }),
      maybeSingle: mock.member,
      single: vi.fn(async () => ({
        data: { creator_id: user.id },
        error: null,
      })),
    };
    if (table !== 'workspace_members' && table !== 'workspaces')
      throw new Error('Unexpected authority query');
    return query;
  });
  mock.admin.mockResolvedValue({
    from: mock.from,
    auth: { admin: { getUserById: mock.identity } },
  });
  mock.identity.mockResolvedValue({
    data: {
      user: {
        ...user,
        email_confirmed_at: '2026-01-01T00:00:00Z',
        banned_until: null,
      },
    },
    error: null,
  });
});
describe('fresh root employee creation authority', () => {
  it('uses the registered infra session and server actor', async () => {
    expect(
      await authorizeEmployeeCreation(new Request('https://web.test/employees'))
    ).toEqual({ authorized: true, actorUserId: user.id });
    expect(mock.satellite).toHaveBeenCalledWith('infra');
    expect(mock.identity).toHaveBeenCalledWith(user.id);
    expect(mock.from).toHaveBeenCalledWith('workspace_members');
    expect(mock.filters).toContainEqual(['ws_id', ROOT_WORKSPACE_ID]);
    expect(mock.filters).toContainEqual(['user_id', user.id]);
  });
  it('does not fall back to cookies on malformed explicit bearer', async () => {
    expect(
      await authorizeEmployeeCreation(
        new Request('https://web.test/employees', {
          headers: { authorization: 'Basic invalid' },
        })
      )
    ).toEqual({ authorized: false, status: 401 });
    expect(mock.satellite).not.toHaveBeenCalled();
    expect(mock.admin).not.toHaveBeenCalled();
  });
  it.each(['', '   '])(
    'rejects explicit empty or whitespace credentials (%j)',
    async (credential) => {
      expect(
        await authorizeEmployeeCreation(
          new Request('https://web.test/employees', {
            headers: { authorization: credential },
          })
        )
      ).toEqual({ authorized: false, status: 401 });
      expect(mock.satellite).not.toHaveBeenCalled();
      expect(mock.admin).not.toHaveBeenCalled();
    }
  );
  it.each(['GUEST', 'NONE'])(
    'rejects real permission-helper creator fallback with actual %s membership',
    async (type) => {
      mock.member.mockResolvedValue({
        data: type === 'NONE' ? null : { type },
        error: null,
      });
      const actual = await vi.importActual<
        typeof import('@tuturuuu/utils/workspace-helper')
      >('@tuturuuu/utils/workspace-helper');
      mock.permissions.mockImplementation(actual.getPermissions);
      const permissions = await actual.getPermissions({
        user,
        wsId: ROOT_WORKSPACE_ID,
        request: new Request('https://web.test/employees'),
      });
      expect(permissions?.membershipType).toBe('MEMBER');
      expect(permissions?.containsPermission('manage_internal_accounts')).toBe(
        true
      );
      expect(
        await authorizeEmployeeCreation(
          new Request('https://web.test/employees')
        )
      ).toEqual({ authorized: false, status: 403 });
    }
  );
  it('fails unavailable before provider identity when the actual membership lookup errors', async () => {
    mock.member.mockResolvedValue({
      data: { type: 'MEMBER' },
      error: { code: 'private' },
    });
    expect(
      await authorizeEmployeeCreation(new Request('https://web.test/employees'))
    ).toEqual({ authorized: false, status: 503 });
    expect(mock.identity).not.toHaveBeenCalled();
  });
  it('rejects a missing persisted membership despite permission approval', async () => {
    mock.member.mockResolvedValue({ data: null, error: null });
    expect(
      await authorizeEmployeeCreation(new Request('https://web.test/employees'))
    ).toEqual({ authorized: false, status: 403 });
    expect(mock.identity).not.toHaveBeenCalled();
  });
  it('binds native app token to infra and rejects invalid native identity', async () => {
    mock.app.mockReturnValue(null);
    expect(
      await authorizeEmployeeCreation(
        new Request('https://web.test/employees', {
          headers: { authorization: 'Bearer ttr_app_invalid' },
        })
      )
    ).toEqual({ authorized: false, status: 401 });
    expect(mock.app.mock.calls[0]?.[1]).toEqual({ targetApp: 'infra' });
    expect(mock.satellite).not.toHaveBeenCalled();
  });
  it.each(['GUEST', 'NONE'])(
    'does not grant creation to %s root membership',
    async (membershipType) => {
      mock.permissions.mockResolvedValue({
        membershipType,
        containsPermission: () => true,
      });
      expect(
        await authorizeEmployeeCreation(
          new Request('https://web.test/employees')
        )
      ).toEqual({ authorized: false, status: 403 });
      expect(mock.admin).not.toHaveBeenCalled();
    }
  );
  it('requires explicit manage permission even for a MEMBER', async () => {
    mock.permissions.mockResolvedValue({
      membershipType: 'MEMBER',
      containsPermission: () => false,
    });
    expect(
      (
        await authorizeEmployeeCreation(
          new Request('https://web.test/employees')
        )
      ).authorized
    ).toBe(false);
    expect(mock.admin).not.toHaveBeenCalled();
  });
  it.each([
    { ...user, email: 'actor@sub.tuturuuu.com' },
    { ...user, id: 'other' },
    { ...user, email_confirmed_at: null },
    { ...user, banned_until: 'not-a-date' },
    { ...user, banned_until: '2100-01-01T00:00:00Z' },
  ])('rejects stale or invalid current identity', async (changes) => {
    mock.identity.mockResolvedValue({
      data: {
        user: {
          ...user,
          email_confirmed_at: '2026-01-01T00:00:00Z',
          banned_until: null,
          ...changes,
        },
      },
      error: null,
    });
    expect(
      await authorizeEmployeeCreation(new Request('https://web.test/employees'))
    ).toEqual({ authorized: false, status: 403 });
  });
  it('fails unavailable when current identity cannot be read', async () => {
    mock.identity.mockRejectedValue(new Error('private'));
    expect(
      await authorizeEmployeeCreation(new Request('https://web.test/employees'))
    ).toEqual({ authorized: false, status: 503 });
  });
});
