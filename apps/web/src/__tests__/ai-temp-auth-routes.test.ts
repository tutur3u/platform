import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getUser: vi.fn(),
  mintAiTempAuthToken: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  personalWorkspaceMaybeSingle: vi.fn(),
  revokeUserAiTempAuthTokens: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  mintAiTempAuthToken: (
    ...args: Parameters<typeof mocks.mintAiTempAuthToken>
  ) => mocks.mintAiTempAuthToken(...args),
  revokeUserAiTempAuthTokens: (
    ...args: Parameters<typeof mocks.revokeUserAiTempAuthTokens>
  ) => mocks.revokeUserAiTempAuthTokens(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

import { POST as revokePOST } from '@/app/api/ai/temp-auth/revoke/route';
import { POST as tokenPOST } from '@/app/api/ai/temp-auth/token/route';

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/ai/temp-auth/token', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('AI temp auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.normalizeWorkspaceId.mockImplementation((value: string) =>
      Promise.resolve(`normalized-${value}`)
    );
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.mintAiTempAuthToken.mockResolvedValue({
      token: 'raw-token',
      expiresAt: 1_700_000_000_000,
    });
    mocks.revokeUserAiTempAuthTokens.mockResolvedValue(true);
    mocks.personalWorkspaceMaybeSingle.mockResolvedValue({
      data: { id: 'personal-ws' },
      error: null,
    });
    const personalWorkspaceQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mocks.personalWorkspaceMaybeSingle,
    };
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(personalWorkspaceQuery),
    });
  });

  it('returns 401 when the browser session is missing', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('missing session'),
    });

    const response = await tokenPOST(postRequest({ wsId: 'workspace-1' }));

    expect(response.status).toBe(401);
    expect(mocks.mintAiTempAuthToken).not.toHaveBeenCalled();
  });

  it('normalizes workspace IDs, verifies membership, and mints a scoped token', async () => {
    const response = await tokenPOST(
      postRequest({
        wsId: 'workspace-1',
        creditWsId: 'workspace-1',
        creditSource: 'workspace',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      token: 'raw-token',
      expiresAt: 1_700_000_000_000,
      ttlSeconds: 60,
    });
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledTimes(2);
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      wsId: 'normalized-workspace-1',
      userId: 'user-1',
      supabase: expect.any(Object),
    });
    expect(mocks.mintAiTempAuthToken).toHaveBeenCalledWith({
      user: { id: 'user-1', email: 'user@example.com' },
      wsId: 'normalized-workspace-1',
      creditWsId: 'normalized-workspace-1',
      creditSource: 'workspace',
    });
  });

  it('rejects workspace credit tokens when the billing workspace differs', async () => {
    const response = await tokenPOST(
      postRequest({
        wsId: 'workspace-1',
        creditWsId: 'workspace-2',
        creditSource: 'workspace',
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid credit workspace',
    });
    expect(mocks.mintAiTempAuthToken).not.toHaveBeenCalled();
  });

  it('uses the caller personal workspace for personal credit tokens', async () => {
    const response = await tokenPOST(
      postRequest({
        wsId: 'workspace-1',
        creditSource: 'personal',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.mintAiTempAuthToken).toHaveBeenCalledWith({
      user: { id: 'user-1', email: 'user@example.com' },
      wsId: 'normalized-workspace-1',
      creditWsId: 'personal-ws',
      creditSource: 'personal',
    });
  });

  it('returns a null token when Redis minting is unavailable', async () => {
    mocks.mintAiTempAuthToken.mockResolvedValue(null);

    const response = await tokenPOST(postRequest({ wsId: 'workspace-1' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      token: null,
      expiresAt: null,
      ttlSeconds: 60,
    });
  });

  it('bumps the user auth version on revocation when authenticated', async () => {
    const response = await revokePOST(
      new Request('http://localhost/api/ai/temp-auth/revoke', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.revokeUserAiTempAuthTokens).toHaveBeenCalledWith('user-1');
  });

  it('keeps revocation idempotent when no browser session is present', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('missing session'),
    });

    const response = await revokePOST(
      new Request('http://localhost/api/ai/temp-auth/revoke', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.revokeUserAiTempAuthTokens).not.toHaveBeenCalled();
  });
});
