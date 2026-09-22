import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeInternalAccountRequest } from './authorization';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
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
    { email_confirmed_at: null },
    { banned_until: '2999-01-01' },
    { id: 'different-user' },
  ])('denies stale or invalid administrative identity: %j', async (changes) => {
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'operator-1',
          email: 'operator@tuturuuu.com',
          email_confirmed_at: '2026-01-01',
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
    });
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'operator-1',
          email: 'operator@tuturuuu.com',
          email_confirmed_at: '2026-01-01',
        },
      },
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
