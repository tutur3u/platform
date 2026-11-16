import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOW,
  rpc,
  store,
  auth,
  session,
  sessionRow,
  request,
  storedRefreshToken,
  encryptCalls,
  cookieWrites,
} from './vault-test-fixture';

describe('switchWebAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.devices = [
      {
        active_user_id: 'user-a',
        id: 'device-1',
        revoked_at: null,
        secret_hash: 'hashed:secret-1',
        last_seen_at: NOW,
      },
    ];
    store.profiles = [];
    store.sessions = [
      sessionRow('user-a', 'refresh-a-stored'),
      sessionRow('user-b', 'refresh-b-stored'),
    ];
    auth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
  });

  // Regression: the vault wrote an account's session when it was added and then
  // only when it was switched *to*, never when it was switched away from. Supabase
  // rotates the refresh token on every refresh, so the copy for whoever was
  // signed in went stale within the hour; switching back then failed and deleted
  // the row, and the retry reported "Account not found".
  it('captures the outgoing account live session before handing over', async () => {
    // The browser has refreshed user A several times since the row was written.
    auth.getSession.mockResolvedValue({
      data: { session: session('user-a', 'refresh-a-rotated') },
    });
    auth.setSession.mockResolvedValue({
      data: { session: session('user-b', 'refresh-b-fresh') },
      error: null,
    });

    const { switchWebAccount } = await import('./vault');
    const result = await switchWebAccount(request(), 'user-b');

    expect(result.success).toBe(true);
    expect(storedRefreshToken('user-a')).toBe('refresh-a-rotated');
    // And the account we moved to keeps whatever Supabase just handed back.
    expect(storedRefreshToken('user-b')).toBe('refresh-b-fresh');
  });

  it('switches using the stored tokens of the target account', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: session('user-a', 'refresh-a-rotated') },
    });
    auth.setSession.mockResolvedValue({
      data: { session: session('user-b', 'refresh-b-fresh') },
      error: null,
    });

    const { switchWebAccount } = await import('./vault');
    await switchWebAccount(request(), 'user-b');

    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: 'access-refresh-b-stored',
      refresh_token: 'refresh-b-stored',
    });
    expect(
      store.devices.find((device) => device.id === 'device-1')?.active_user_id
    ).toBe('user-b');
  });

  it('does not save a satellite route as the outgoing Web route', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: session('user-a', 'refresh-a-rotated') },
    });
    auth.setSession.mockResolvedValue({
      data: { session: session('user-b', 'refresh-b-fresh') },
      error: null,
    });

    const { switchWebAccount } = await import('./vault');
    await switchWebAccount(
      request('https://mail.tuturuuu.localhost'),
      'user-b',
      { currentRoute: '/personal/transactions' }
    );

    expect(
      store.sessions.find((row) => row.user_id === 'user-a')?.last_route
    ).toBe('/user-a-workspace');
  });

  it('saves a same-origin Web route before switching accounts', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: session('user-a', 'refresh-a-rotated') },
    });
    auth.setSession.mockResolvedValue({
      data: { session: session('user-b', 'refresh-b-fresh') },
      error: null,
    });

    const { switchWebAccount } = await import('./vault');
    await switchWebAccount(request(), 'user-b', {
      currentRoute: '/user-a-workspace/tasks',
    });

    expect(
      store.sessions.find((row) => row.user_id === 'user-a')?.last_route
    ).toBe('/user-a-workspace/tasks');
  });

  it('does not save a route when the request has no Origin header', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: session('user-a', 'refresh-a-rotated') },
    });
    auth.setSession.mockResolvedValue({
      data: { session: session('user-b', 'refresh-b-fresh') },
      error: null,
    });

    const { switchWebAccount } = await import('./vault');
    await switchWebAccount(request(null), 'user-b', {
      currentRoute: '/user-a-workspace/tasks',
    });

    expect(
      store.sessions.find((row) => row.user_id === 'user-a')?.last_route
    ).toBe('/user-a-workspace');
  });

  it('leaves the signed-in account alone when its session is not the active one', async () => {
    // A mismatch means the cookie no longer belongs to the account the device
    // thinks is active; overwriting the row would hand out the wrong session.
    auth.getSession.mockResolvedValue({
      data: { session: session('user-c', 'refresh-c') },
    });
    auth.setSession.mockResolvedValue({
      data: { session: session('user-b', 'refresh-b-fresh') },
      error: null,
    });

    const { switchWebAccount } = await import('./vault');
    await switchWebAccount(request(), 'user-b');

    expect(storedRefreshToken('user-a')).toBe('refresh-a-stored');
  });

  it('flags a dead stored session as needing a fresh sign-in', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: session('user-a', 'refresh-a-rotated') },
    });
    auth.setSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid Refresh Token' },
    });

    const { switchWebAccount } = await import('./vault');
    const result = await switchWebAccount(request(), 'user-b');

    expect(result).toMatchObject({
      error: 'Stored session is no longer valid',
      requiresReauth: true,
      success: false,
    });
    expect(storedRefreshToken('user-b')).toBe('refresh-b-stored');
    expect(result.accounts.map((account) => account.id)).toEqual([
      'user-a',
      'user-b',
    ]);
  });

  it('reports an unknown account as needing a fresh sign-in too', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: session('user-a', 'refresh-a-rotated') },
    });

    const { switchWebAccount } = await import('./vault');
    const result = await switchWebAccount(request(), 'user-z');

    expect(result).toMatchObject({
      error: 'Account not found',
      requiresReauth: true,
      success: false,
    });
    expect(auth.setSession).not.toHaveBeenCalled();
  });
});

describe('saveCurrentWebAccount account cap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    encryptCalls.n = 0;
    cookieWrites.length = 0;
    store.devices = [
      {
        active_user_id: 'user-1',
        id: 'device-1',
        revoked_at: null,
        secret_hash: 'hashed:secret-1',
        last_seen_at: NOW,
      },
    ];
    store.profiles = [];
    store.sessions = [];
  });

  it('saves 10 synthetic accounts and refuses the 11th before encrypting it', async () => {
    const { saveCurrentWebAccount } = await import('./vault');

    for (let index = 1; index <= 10; index += 1) {
      auth.getSession.mockResolvedValue({
        data: { session: session(`user-${index}`, `refresh-${index}`) },
      });
      const result = await saveCurrentWebAccount(request(), {
        route: '/en/personal/tasks',
      });
      expect(result.success).toBe(true);
    }

    expect(store.sessions).toHaveLength(10);
    const encryptCallsAfterTen = encryptCalls.n;

    auth.getSession.mockResolvedValue({
      data: { session: session('user-11', 'refresh-11') },
    });
    const limited = await saveCurrentWebAccount(request(), {
      route: '/en/personal/tasks',
    });

    expect(limited).toMatchObject({
      errorCode: 'account_limit',
      success: false,
    });
    expect(store.sessions).toHaveLength(10);
    expect(store.sessions.map((row) => row.user_id)).not.toContain('user-11');
    expect(encryptCalls.n).toBe(encryptCallsAfterTen);
    expect(cookieWrites.join('')).not.toContain('refresh-11');
  });
});

describe('canonical profile identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.devices = [
      {
        active_user_id: 'user-a',
        id: 'device-1',
        revoked_at: null,
        secret_hash: 'hashed:secret-1',
        last_seen_at: NOW,
      },
    ];
    store.profiles = [
      {
        avatar_url: 'https://cdn.test/profile-a.png',
        display_name: 'Profile Ada',
        id: 'user-a',
      },
      {
        avatar_url: 'https://cdn.test/profile-b.png',
        display_name: 'Profile Bao',
        id: 'user-b',
      },
    ];
    store.sessions = [
      {
        ...sessionRow('user-a', 'refresh-a-stored'),
        avatar_url: 'https://oauth.test/stale-a.png',
        display_name: 'OAuth Ada',
      },
      {
        ...sessionRow('user-b', 'refresh-b-stored'),
        avatar_url: 'https://oauth.test/stale-b.png',
        display_name: 'OAuth Bao',
      },
    ];
  });

  it('lists the Settings profile avatar and name instead of the stored oauth copy', async () => {
    const { listWebAccounts } = await import('./vault');
    const result = await listWebAccounts(request());

    expect(result.accounts.map((account) => account.metadata)).toEqual([
      expect.objectContaining({
        avatarUrl: 'https://cdn.test/profile-a.png',
        displayName: 'Profile Ada',
      }),
      expect.objectContaining({
        avatarUrl: 'https://cdn.test/profile-b.png',
        displayName: 'Profile Bao',
      }),
    ]);
  });

  it('refreshes the switched account from the profile source', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: session('user-a', 'refresh-a-rotated') },
    });
    auth.setSession.mockResolvedValue({
      data: { session: session('user-b', 'refresh-b-fresh') },
      error: null,
    });

    const { switchWebAccount } = await import('./vault');
    const result = await switchWebAccount(request(), 'user-b');

    expect(
      result.accounts.find((account) => account.id === 'user-b')?.metadata
    ).toMatchObject({
      avatarUrl: 'https://cdn.test/profile-b.png',
      displayName: 'Profile Bao',
    });
    expect(
      store.sessions.find((row) => row.user_id === 'user-b')
    ).toMatchObject({
      avatar_url: 'https://cdn.test/profile-b.png',
      display_name: 'Profile Bao',
    });
  });
});

describe('web account logout revokes derived credentials before sign-out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.devices = [
      {
        active_user_id: 'user-a',
        id: 'device-1',
        revoked_at: null,
        secret_hash: 'hashed:secret-1',
        last_seen_at: NOW,
      },
    ];
    store.profiles = [];
    store.sessions = [sessionRow('user-a', 'refresh-a-stored')];
    auth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    auth.signOut.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ error: null });
  });

  async function expectRevokedThenSignedOut() {
    const { revokeUserAiTempAuthTokens } =
      await import('@tuturuuu/utils/ai-temp-auth');

    expect(revokeUserAiTempAuthTokens).toHaveBeenCalledWith('user-a');
    expect(rpc).toHaveBeenCalledWith('revoke_all_cross_app_tokens', {
      p_user_id: 'user-a',
    });
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(
      auth.signOut.mock.invocationCallOrder[0] as number
    );
  }

  it('signing out of the last account on the device (logout)', async () => {
    const { logoutCurrentWebAccount } = await import('./vault');

    await logoutCurrentWebAccount(request());

    await expectRevokedThenSignedOut();
  });

  it('signing out without a stored device (satellite menu logout)', async () => {
    store.devices = [];
    const { logoutCurrentWebAccount } = await import('./vault');

    await logoutCurrentWebAccount(request());

    await expectRevokedThenSignedOut();
  });

  it('signing out of every account (logout-all)', async () => {
    const { logoutAllWebAccounts } = await import('./vault');

    await logoutAllWebAccounts(request());

    await expectRevokedThenSignedOut();
  });

  it('still signs out when the cross-app revocation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rpc.mockResolvedValue({ error: { message: 'unavailable' } });
    const { logoutAllWebAccounts } = await import('./vault');

    await logoutAllWebAccounts(request());

    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
