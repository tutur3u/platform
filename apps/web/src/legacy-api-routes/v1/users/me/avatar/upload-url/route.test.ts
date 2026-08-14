import { beforeEach, describe, expect, it, vi } from 'vitest';

const { withSessionAuthMock } = vi.hoisted(() => ({
  withSessionAuthMock: vi.fn((handler: unknown) => handler),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown, options?: unknown) =>
    withSessionAuthMock(handler, options),
}));

describe('current user avatar upload URL route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('allows profile-write app sessions without broadening storage access', async () => {
    await import('@/legacy-api-routes/v1/users/me/avatar/upload-url/route');

    expect(withSessionAuthMock).toHaveBeenCalledTimes(1);
    expect(withSessionAuthMock.mock.calls[0]?.[1]).toEqual({
      allowAppSessionAuth: [
        {
          targetApp: [
            'ai',
            'calendar',
            'chat',
            'cms',
            'contacts',
            'drive',
            'finance',
            'forms',
            'hive',
            'infra',
            'inventory',
            'learn',
            'mail',
            'meet',
            'mind',
            'mira',
            'nova',
            'pay',
            'rewise',
            'storefront',
            'tasks',
            'teach',
            'track',
            'platform',
          ],
        },
        { requiredScope: 'users:profile:write' },
      ],
      rateLimit: { windowMs: 60000, maxRequests: 10 },
      skipAppSessionStepUpChallenge: true,
    });
  });
});
