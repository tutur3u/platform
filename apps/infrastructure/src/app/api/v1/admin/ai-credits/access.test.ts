import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSatelliteAppSessionUser = vi.fn();
const createAdminClient = vi.fn();
const getPermissions = vi.fn();
const getUser = vi.fn();

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions,
}));

describe('authorizeAiCreditsAdminRequest', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects requests without an infrastructure satellite session', async () => {
    getSatelliteAppSessionUser.mockResolvedValue(null);
    const { authorizeAiCreditsAdminRequest } = await import('./access');

    const result = await authorizeAiCreditsAdminRequest();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects authenticated users without infrastructure access', async () => {
    const sbAdmin = { from: vi.fn() };
    getSatelliteAppSessionUser.mockResolvedValue({
      email: 'member@example.com',
      id: 'user-1',
    });
    createAdminClient.mockResolvedValue(sbAdmin);
    getPermissions.mockResolvedValue({
      membershipType: 'MEMBER',
      containsPermission: vi.fn().mockReturnValue(false),
    });
    const { authorizeAiCreditsAdminRequest } = await import('./access');

    const result = await authorizeAiCreditsAdminRequest();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('denies a non-member even with infrastructure permission', async () => {
    getSatelliteAppSessionUser.mockResolvedValue({ id: 'user-1' });
    getPermissions.mockResolvedValue({
      membershipType: 'GUEST',
      containsPermission: () => true,
    });
    const { authorizeAiCreditsAdminRequest } = await import('./access');
    const result = await authorizeAiCreditsAdminRequest();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('returns a no-cookie admin client for infrastructure viewers', async () => {
    const sbAdmin = { from: vi.fn() };
    const user = { email: 'admin@tuturuuu.com', id: 'user-1' };
    getSatelliteAppSessionUser.mockResolvedValue(user);
    createAdminClient.mockResolvedValue(sbAdmin);
    const permissions = {
      membershipType: 'MEMBER',
      containsPermission: vi.fn(
        (permission: string) => permission === 'view_infrastructure'
      ),
    };
    getPermissions.mockResolvedValue(permissions);
    const { authorizeAiCreditsAdminRequest } = await import('./access');

    const result = await authorizeAiCreditsAdminRequest();

    expect(result).toEqual({ ok: true, sbAdmin, user, permissions });
    expect(getPermissions).toHaveBeenCalledExactlyOnceWith({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });
    if (result.ok) expect(result.permissions).toBe(permissions);
    expect(createAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });
  it('captures permissions from the bearer actor without consulting cookies', async () => {
    const user = { id: 'bearer-admin' };
    const cookieUser = { id: 'cookie-admin' };
    const permissions = {
      membershipType: 'MEMBER',
      containsPermission: (permission: string) =>
        permission === 'view_infrastructure',
    };
    const sbAdmin = { auth: { getUser }, from: vi.fn() };
    getSatelliteAppSessionUser.mockResolvedValue(cookieUser);
    getUser.mockResolvedValue({ data: { user }, error: null });
    createAdminClient.mockResolvedValue(sbAdmin);
    getPermissions.mockImplementation(async ({ user: actor }) =>
      actor === user ? permissions : null
    );
    const { authorizeAiCreditsAdminRequest } = await import('./access');
    const request = new Request('https://example.test', {
      headers: {
        authorization: 'Bearer fixture-token',
        cookie: 'fixture=session',
      },
    });
    const result = await authorizeAiCreditsAdminRequest(
      'view_infrastructure',
      true,
      request
    );
    expect(result).toEqual({ ok: true, user, sbAdmin, permissions });
    if (result.ok) expect(result.permissions).toBe(permissions);
    expect(getUser).toHaveBeenCalledExactlyOnceWith('fixture-token');
    expect(getPermissions).toHaveBeenCalledExactlyOnceWith({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });
    expect(getSatelliteAppSessionUser).not.toHaveBeenCalled();
    expect(sbAdmin.from).not.toHaveBeenCalled();
  });
  it('denies a rejected bearer despite an admitted cookie actor before permission or data effects', async () => {
    const sbAdmin = { auth: { getUser }, from: vi.fn() };
    getSatelliteAppSessionUser.mockResolvedValue({ id: 'cookie-admin' });
    getPermissions.mockResolvedValue({
      membershipType: 'MEMBER',
      containsPermission: () => true,
    });
    createAdminClient.mockResolvedValue(sbAdmin);
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    const { authorizeAiCreditsAdminRequest } = await import('./access');
    const result = await authorizeAiCreditsAdminRequest(
      'view_infrastructure',
      true,
      new Request('https://example.test', {
        headers: {
          authorization: 'Bearer rejected',
          cookie: 'fixture=session',
        },
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(getSatelliteAppSessionUser).not.toHaveBeenCalled();
    expect(getPermissions).not.toHaveBeenCalled();
    expect(sbAdmin.from).not.toHaveBeenCalled();
  });
});
