import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  attachSupabaseAuthUser: vi.fn(),
  createAdminClient: vi.fn(),
  createAppSessionUser: vi.fn(),
  getAppSessionTokenFromRequest: vi.fn(),
  verifyAppSessionRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  attachSupabaseAuthUser: (
    ...args: Parameters<typeof mocks.attachSupabaseAuthUser>
  ) => mocks.attachSupabaseAuthUser(...args),
  createAppSessionUser: (
    ...args: Parameters<typeof mocks.createAppSessionUser>
  ) => mocks.createAppSessionUser(...args),
  getAppSessionTokenFromRequest: (
    ...args: Parameters<typeof mocks.getAppSessionTokenFromRequest>
  ) => mocks.getAppSessionTokenFromRequest(...args),
  verifyAppSessionRequest: (
    ...args: Parameters<typeof mocks.verifyAppSessionRequest>
  ) => mocks.verifyAppSessionRequest(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

import {
  resolveRewiseAiRouteAuth,
  resolveRewiseGatewayAuth,
} from './route-auth';

describe('Rewise AI route app-session authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppSessionTokenFromRequest.mockReturnValue('app-session-token');
    mocks.verifyAppSessionRequest.mockReturnValue({
      claims: { sub: 'user-1' },
      ok: true,
    });
    mocks.createAppSessionUser.mockReturnValue({
      email: 'user@example.com',
      id: 'user-1',
    });
    mocks.createAdminClient.mockResolvedValue({ from: vi.fn() });
    mocks.attachSupabaseAuthUser.mockReturnValue({ from: vi.fn() });
  });

  it('returns null when no Rewise app session is present', async () => {
    mocks.getAppSessionTokenFromRequest.mockReturnValue(null);

    await expect(
      resolveRewiseGatewayAuth(
        new Request('http://localhost/api/ai/chat/google')
      )
    ).resolves.toBeNull();
    expect(mocks.verifyAppSessionRequest).not.toHaveBeenCalled();
  });

  it('rejects an invalid Rewise app session', async () => {
    mocks.verifyAppSessionRequest.mockReturnValue({ ok: false });

    const result = await resolveRewiseAiRouteAuth(
      new Request('http://localhost/api/ai/chat/google')
    );

    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(result.response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('attaches a verified Rewise actor for shared route membership checks', async () => {
    const attachedClient = { from: vi.fn() };
    mocks.attachSupabaseAuthUser.mockReturnValue(attachedClient);
    const request = new Request('http://localhost/api/ai/chat/google');

    const result = await resolveRewiseAiRouteAuth(request);

    expect(result).toEqual({
      messageInsertMode: 'direct',
      ok: true,
      supabase: attachedClient,
      user: { email: 'user@example.com', id: 'user-1' },
    });
    expect(mocks.verifyAppSessionRequest).toHaveBeenCalledWith(request, {
      targetApp: 'rewise',
    });
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });
});
