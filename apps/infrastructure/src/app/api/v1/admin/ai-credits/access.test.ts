import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSatelliteAppSessionUser = vi.fn();
const createAdminClient = vi.fn();
const verifyWorkspaceMembershipType = vi.fn();

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType,
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

  it('rejects authenticated users outside the root workspace', async () => {
    const sbAdmin = { from: vi.fn() };
    getSatelliteAppSessionUser.mockResolvedValue({
      email: 'member@example.com',
      id: 'user-1',
    });
    createAdminClient.mockResolvedValue(sbAdmin);
    verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });
    const { authorizeAiCreditsAdminRequest } = await import('./access');

    const result = await authorizeAiCreditsAdminRequest();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('returns a no-cookie admin client for root workspace members', async () => {
    const sbAdmin = { from: vi.fn() };
    const user = { email: 'admin@tuturuuu.com', id: 'user-1' };
    getSatelliteAppSessionUser.mockResolvedValue(user);
    createAdminClient.mockResolvedValue(sbAdmin);
    verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    const { authorizeAiCreditsAdminRequest } = await import('./access');

    const result = await authorizeAiCreditsAdminRequest();

    expect(result).toEqual({ ok: true, sbAdmin, user });
    expect(createAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });
});
