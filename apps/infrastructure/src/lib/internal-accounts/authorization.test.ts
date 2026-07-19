import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeInternalAccountRequest } from './authorization';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
  getPermissions: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ auth: { admin: {} } });
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
