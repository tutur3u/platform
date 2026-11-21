import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLoginView } from './login-view.server';

const mocks = vi.hoisted(() => ({
  getExternalAppByReturnUrl: vi.fn(),
  getUser: vi.fn(),
  peekWebAccounts: vi.fn(),
  profile: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mocks.profile() }),
      }),
    }),
  }),
}));

vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppByReturnUrl: (
    ...args: Parameters<typeof mocks.getExternalAppByReturnUrl>
  ) => mocks.getExternalAppByReturnUrl(...args),
}));

vi.mock('@/lib/auth/multi-account/vault', () => ({
  listWebAccounts: () => {
    throw new Error('the login view must not touch the device row');
  },
  peekWebAccounts: (...args: Parameters<typeof mocks.peekWebAccounts>) =>
    mocks.peekWebAccounts(...args),
}));

const EDUFEST = 'https://showcase.ieeai.net/edufest/verify-token?state=s';
const account = {
  email: 'saved@example.com',
  id: 'saved-user',
  metadata: {
    addedAt: 1,
    avatarUrl: 'https://cdn.example/a.png',
    displayName: 'Saved Person',
    lastActiveAt: 2,
    lastRoute: '/ws-secret/finance',
    lastWorkspaceId: 'ws-secret',
  },
};

function request(search: Record<string, string>) {
  const url = new URL('https://tuturuuu.com/api/v1/auth/login-view');
  for (const [name, value] of Object.entries(search)) {
    url.searchParams.set(name, value);
  }
  return new Request(url, { headers: { cookie: 'device=1' } });
}

describe('resolveLoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.profile.mockResolvedValue({ data: null });
    mocks.peekWebAccounts.mockResolvedValue({
      accounts: [account],
      activeAccountId: null,
    });
    mocks.getExternalAppByReturnUrl.mockImplementation(async (url: string) =>
      new URL(url).origin === 'https://showcase.ieeai.net'
        ? {
            callbackPaths: ['/edufest/verify-token'],
            displayName: 'EduFest Booth Hall',
            id: 'edufest',
          }
        : null
    );
  });

  it('names a registered external return app, a hint and saved accounts', async () => {
    const view = await resolveLoginView(
      request({ provider: 'google', returnUrl: EDUFEST })
    );

    expect(view).toEqual({
      hasSession: false,
      providerHint: 'google',
      returnApp: { id: 'edufest', name: 'EduFest Booth Hall' },
      savedAccounts: [
        {
          email: 'saved@example.com',
          id: 'saved-user',
          metadata: {
            addedAt: null,
            avatarUrl: 'https://cdn.example/a.png',
            displayName: 'Saved Person',
            lastActiveAt: null,
            lastRoute: null,
            lastWorkspaceId: null,
          },
        },
      ],
      session: null,
    });
    expect(JSON.stringify(view)).not.toContain('ws-secret');
  });

  it('never trusts an unregistered origin or callback path', async () => {
    for (const returnUrl of [
      'https://showcase.ieeai.net.evil.test/edufest/verify-token',
      'https://showcase.ieeai.net/edufest/other',
    ]) {
      const view = await resolveLoginView(
        request({ provider: 'google', returnUrl })
      );
      expect(view.returnApp).toBeNull();
    }
  });

  it('carries only the session name and avatar', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          email: 'active@example.com',
          id: 'user-1',
          user_metadata: { picture: 'https://cdn.example/p.png' },
        },
      },
    });
    mocks.profile.mockResolvedValue({
      data: { avatar_url: null, display_name: 'Person Example' },
    });

    const view = await resolveLoginView(request({}));

    expect(view.session).toEqual({
      avatarUrl: 'https://cdn.example/p.png',
      name: 'Person Example',
    });
    expect(JSON.stringify(view)).not.toContain('active@example.com');
    expect(JSON.stringify(view)).not.toContain('user-1');
  });

  it('marks unreadable saved accounts as unknown rather than empty', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getUser.mockRejectedValue(new Error('auth down'));
    mocks.peekWebAccounts.mockRejectedValue(new Error('vault down'));

    const view = await resolveLoginView(request({ provider: 'evil' }));

    expect(view).toMatchObject({
      hasSession: false,
      providerHint: null,
      savedAccounts: null,
      session: null,
    });
    warn.mockRestore();
  });
});
