import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAppSessionUser: vi.fn(),
  createClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  verifyAppSessionRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  createAppSessionUser: mocks.createAppSessionUser,
  verifyAppSessionRequest: mocks.verifyAppSessionRequest,
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
}));

import { resolveNotificationRouteUser } from './route-auth';

describe('notification route auth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the signed Contacts app-session actor without Supabase auth', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/notifications'
    );
    const user = { email: 'owner@example.com', id: 'user-1' };
    mocks.verifyAppSessionRequest.mockReturnValue({
      claims: { sub: user.id },
      ok: true,
    });
    mocks.createAppSessionUser.mockReturnValue(user);

    await expect(resolveNotificationRouteUser(request)).resolves.toBe(user);
    expect(mocks.verifyAppSessionRequest).toHaveBeenCalledWith(request, {
      targetApp: ['contacts', 'platform', 'teach'],
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
