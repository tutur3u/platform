import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeInternalAccountRequest } from './authorization';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  getAppSessionUserFromRequest: vi.fn(),
  getUserById: vi.fn(),
  resolveSupabaseSessionRequest: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
  getPermissions: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionUserFromRequest: mocks.getAppSessionUserFromRequest,
}));

vi.mock('@tuturuuu/auth/supabase-session-user', () => ({
  resolveSupabaseSessionRequest: mocks.resolveSupabaseSessionRequest,
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

describe('internal account authorization', () => {
  it('accepts a verified native bearer with the same permission boundary', async () => {
    mocks.resolveSupabaseSessionRequest.mockResolvedValue({
      user: { id: 'operator-1', email: 'operator@tuturuuu.com' },
    });
    const request = new Request('https://infra.test/api', {
      headers: { authorization: 'Bearer native-test-credential' },
    });
    expect((await authorizeInternalAccountRequest(request)).ok).toBe(true);
    expect(mocks.resolveSupabaseSessionRequest).toHaveBeenCalledWith(request);
    expect(mocks.getSatelliteAppSessionUser).not.toHaveBeenCalled();
  });

  it('verifies an explicit satellite token without ambient cookie fallback', async () => {
    mocks.getAppSessionUserFromRequest.mockReturnValue({
      id: 'operator-1',
      email: 'operator@tuturuuu.com',
    });
    const request = new Request('https://infra.test/api', {
      headers: {
        authorization: 'Bearer ttr_app_test',
        cookie: 'other-user=credential',
      },
    });
    expect((await authorizeInternalAccountRequest(request)).ok).toBe(true);
    const [forwarded, options] =
      mocks.getAppSessionUserFromRequest.mock.calls[0]!;
    expect(forwarded.headers.get('cookie')).toBeNull();
    expect(forwarded.headers.get('authorization')).toBe('Bearer ttr_app_test');
    expect(options).toEqual({ targetApp: 'infra' });
    expect(mocks.getSatelliteAppSessionUser).not.toHaveBeenCalled();
  });

  it.each(['Bearer expired', 'Basic malformed', 'Bearer ttr_app_invalid'])(
    'never falls back from invalid explicit credentials: %s',
    async (credential) => {
      const result = await authorizeInternalAccountRequest(
        new Request('https://infra.test/api', {
          headers: { authorization: credential },
        })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(401);
      expect(mocks.getSatelliteAppSessionUser).not.toHaveBeenCalled();
      expect(mocks.getPermissions).not.toHaveBeenCalled();
    }
  );

  it.each([
    { email: 'operator@example.com' },
    { email: 'operator@tuturuuu.com.evil.test' },
    { email_confirmed_at: null, identities: [] },
    { banned_until: '2999-01-01' },
    { id: 'different-user' },
  ])('denies stale or invalid administrative identity: %j', async (changes) => {
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'operator-1',
          email: 'operator@tuturuuu.com',
          email_confirmed_at: '2026-01-01',
          identities: [],
          ...changes,
        },
      },
      error: null,
    });
    const result = await authorizeInternalAccountRequest(
      new Request('https://infra.test/api')
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('fails closed when the authoritative identity cannot be loaded', async () => {
    mocks.getUserById.mockResolvedValue({
      data: { user: null },
      error: { message: 'private provider detail' },
    });
    const result = await authorizeInternalAccountRequest(
      new Request('https://infra.test/api')
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
      expect(await result.response.text()).not.toContain(
        'private provider detail'
      );
    }
  });

  it('fails closed on an identity provider network exception', async () => {
    mocks.getUserById.mockRejectedValue(new Error('private network detail'));
    const result = await authorizeInternalAccountRequest(
      new Request('https://infra.test/api')
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
      expect(await result.response.text()).not.toContain(
        'private network detail'
      );
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({
      auth: { admin: { getUserById: mocks.getUserById } },
      from: mocks.from,
    });
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'operator-1',
          email: 'operator@tuturuuu.com',
          email_confirmed_at: '2026-01-01',
          identities: [],
        },
      },
      error: null,
    });
    const membershipQuery = {
      select: mocks.select,
      eq: mocks.eq,
      maybeSingle: mocks.maybeSingle,
    };
    mocks.from.mockReturnValue(membershipQuery);
    mocks.select.mockReturnValue(membershipQuery);
    mocks.eq.mockReturnValue(membershipQuery);
    mocks.maybeSingle.mockResolvedValue({
      data: { user_id: 'operator-1' },
      error: null,
    });
    mocks.resolveSupabaseSessionRequest.mockResolvedValue({ user: null });
    mocks.getAppSessionUserFromRequest.mockReturnValue(null);
    mocks.getSatelliteAppSessionUser.mockResolvedValue({
      email: 'operator@tuturuuu.com',
      id: 'operator-1',
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(() => true),
    });
  });

  it('denies a creator whose permission still allows access after root membership removal', async () => {
    const containsPermission = vi.fn(() => true);
    mocks.getPermissions.mockResolvedValue({ containsPermission });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await authorizeInternalAccountRequest(
      new Request('https://infra.test/api')
    );

    expect(containsPermission).toHaveBeenCalledWith('manage_internal_accounts');
    expect(containsPermission.mock.results[0]?.value).toBe(true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({ message: 'Forbidden' });
    }
  });

  it.each(['query error', 'rejected transport', 'thrown transport'])(
    'fails closed on a membership %s',
    async (failure) => {
      if (failure === 'query error') {
        mocks.maybeSingle.mockResolvedValue({
          data: { user_id: 'operator-1' },
          error: { message: 'private membership detail' },
        });
      } else if (failure === 'rejected transport') {
        mocks.maybeSingle.mockRejectedValue(
          new Error('private membership detail')
        );
      } else {
        mocks.from.mockImplementationOnce(() => {
          throw new Error('private membership detail');
        });
      }

      const result = await authorizeInternalAccountRequest(
        new Request('https://infra.test/api')
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(503);
        expect(await result.response.json()).toEqual({
          message: 'Unable to verify administrator access',
        });
      }
    }
  );

  it('binds persisted MEMBER eligibility to the authoritative actor and root', async () => {
    const result = await authorizeInternalAccountRequest(
      new Request('https://infra.test/api')
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe('operator-1');
    expect(mocks.getUserById).toHaveBeenCalledWith('operator-1');
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('workspace_members');
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith('user_id');
    expect(mocks.eq.mock.calls).toEqual([
      ['ws_id', ROOT_WORKSPACE_ID],
      ['user_id', 'operator-1'],
      ['type', 'MEMBER'],
    ]);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('rechecks membership after a previously authorized request', async () => {
    const request = new Request('https://infra.test/api');
    expect((await authorizeInternalAccountRequest(request)).ok).toBe(true);
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await authorizeInternalAccountRequest(request);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.getUserById).toHaveBeenCalledTimes(2);
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('rejects anonymous requests', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);

    const result = await authorizeInternalAccountRequest(
      new Request('https://infra.test/api')
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('rejects external actors even when a permission object is returned', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue({
      email: 'operator@example.com',
      id: 'operator-1',
    });

    const result = await authorizeInternalAccountRequest(
      new Request('https://infra.test/api')
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects internal actors without the root permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(() => false),
    });

    const result = await authorizeInternalAccountRequest(
      new Request('https://infra.test/api')
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('returns the admin boundary only to permitted internal actors', async () => {
    const request = new Request('https://infra.test/api');
    const result = await authorizeInternalAccountRequest(request);

    expect(result.ok).toBe(true);
    expect(mocks.getPermissions).toHaveBeenCalledWith(
      expect.objectContaining({
        request,
        user: expect.objectContaining({ id: 'operator-1' }),
      })
    );
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });
});
