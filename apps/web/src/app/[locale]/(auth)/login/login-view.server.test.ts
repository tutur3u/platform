import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveInitialLoginView } from './login-view.server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  headers: vi.fn(),
  peekWebAccounts: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock('next/headers', () => ({
  headers: () => mocks.headers(),
}));

vi.mock('@/lib/auth/multi-account/vault', () => ({
  listWebAccounts: () => {
    throw new Error('the login view must not touch the device row');
  },
  peekWebAccounts: (...args: Parameters<typeof mocks.peekWebAccounts>) =>
    mocks.peekWebAccounts(...args),
}));

const account = {
  email: 'saved@example.com',
  id: 'saved-user',
  metadata: {
    addedAt: null,
    avatarUrl: null,
    displayName: 'Saved Person',
    lastActiveAt: null,
    lastRoute: null,
    lastWorkspaceId: null,
  },
};

const storedAccount = {
  ...account,
  metadata: {
    ...account.metadata,
    addedAt: 1,
    avatarUrl: 'https://cdn.example/a.png',
    lastActiveAt: 2,
    lastRoute: '/ws-secret/finance',
    lastWorkspaceId: 'ws-secret',
  },
};

describe('resolveInitialLoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(
      new Headers({ cookie: 'device=1', host: 'tuturuuu.com' })
    );
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.peekWebAccounts.mockResolvedValue({
      accounts: [account],
      activeAccountId: null,
    });
  });

  it('reports the session, saved accounts and an allowed provider hint', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    await expect(
      resolveInitialLoginView({ provider: 'google', returnUrl: 'x' })
    ).resolves.toEqual({
      hasSession: true,
      providerHint: 'google',
      savedAccounts: [account],
    });
    expect(mocks.peekWebAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://tuturuuu.com/login' })
    );
  });

  it('carries no identity of the active session', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'active@example.com', id: 'user-1' } },
    });

    const result = await resolveInitialLoginView({});

    expect(JSON.stringify(result)).not.toContain('active@example.com');
    expect(JSON.stringify(result)).not.toContain('user-1');
  });

  it('drops a provider hint the page may not start', async () => {
    await expect(
      resolveInitialLoginView({ provider: ['evil', 'google'] })
    ).resolves.toMatchObject({ providerHint: null });
  });

  it('projects saved accounts to what the chooser renders', async () => {
    mocks.peekWebAccounts.mockResolvedValue({
      accounts: [storedAccount],
      activeAccountId: null,
    });

    const result = await resolveInitialLoginView({});

    expect(result.savedAccounts).toEqual([
      {
        ...account,
        metadata: {
          ...account.metadata,
          avatarUrl: 'https://cdn.example/a.png',
        },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('ws-secret');
  });

  it('marks unreadable saved accounts as unknown rather than empty', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getUser.mockRejectedValue(new Error('auth down'));
    mocks.peekWebAccounts.mockRejectedValue(new Error('vault down'));

    await expect(resolveInitialLoginView({})).resolves.toEqual({
      hasSession: false,
      providerHint: null,
      savedAccounts: null,
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
