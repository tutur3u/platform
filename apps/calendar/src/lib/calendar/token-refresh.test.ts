import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { refresh, cache } = vi.hoisted(() => ({
  refresh: vi.fn(),
  cache: vi.fn(),
}));
vi.mock('@tuturuuu/google', () => ({ OAuth2Client: vi.fn() }));
vi.mock('@tuturuuu/microsoft', () => ({
  createMsalConfig: vi.fn(() => ({})),
  MICROSOFT_CALENDAR_SCOPES: ['Calendars.ReadWrite', 'offline_access'],
  ConfidentialClientApplication: class {
    acquireTokenByRefreshToken = refresh;
    getTokenCache() {
      return { serialize: cache };
    }
  },
}));

import {
  type CalendarAuthToken,
  ensureValidToken,
  tokenNeedsRefresh,
} from './token-refresh';

const token: CalendarAuthToken = {
  id: 'token',
  user_id: 'user',
  ws_id: 'workspace',
  provider: 'microsoft',
  access_token: 'expired-test-token',
  refresh_token: 'old-test-refresh',
  account_email: null,
  account_name: null,
  expires_at: '2020-01-01T00:00:00Z',
  is_active: true,
  created_at: '2020-01-01T00:00:00Z',
};
function database(error: unknown = null) {
  const eq = vi.fn(async () => ({ error }));
  const update = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ update })), update, eq };
}

describe('server-side calendar credential refresh', () => {
  beforeEach(() => {
    vi.stubEnv('MICROSOFT_CLIENT_ID', 'client');
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'test-secret');
    refresh.mockResolvedValue({
      accessToken: 'fresh-test-token',
      expiresOn: new Date('2030-01-01'),
      account: { homeAccountId: 'account' },
    });
    cache.mockReturnValue(
      JSON.stringify({
        RefreshToken: {
          current: {
            home_account_id: 'account',
            client_id: 'client',
            credential_type: 'RefreshToken',
            secret: 'rotated-test-refresh',
          },
        },
      })
    );
  });
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([null, 'not-a-date', '2020-01-01T00:00:00Z'])(
    'refreshes unknown or expired validity %s',
    (expiry) => {
      expect(tokenNeedsRefresh(expiry)).toBe(true);
    }
  );
  it('uses an unexpired credential without a provider round trip', async () => {
    const db = database();
    const result = await ensureValidToken(db, {
      ...token,
      expires_at: '2099-01-01T00:00:00Z',
    });
    expect(result.refreshed).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
  it('persists a rotated refresh credential and keeps calendar write consent', async () => {
    const db = database();
    const result = await ensureValidToken(db, token);
    expect(result.error).toBeUndefined();
    expect(refresh).toHaveBeenCalledWith({
      refreshToken: 'old-test-refresh',
      scopes: ['Calendars.ReadWrite', 'offline_access'],
    });
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: 'fresh-test-token',
        refresh_token: 'rotated-test-refresh',
      })
    );
    expect(db.eq).toHaveBeenCalledWith('id', 'token');
  });
  it('does not call the provider when the old callback stored no offline credential', async () => {
    const result = await ensureValidToken(database(), {
      ...token,
      refresh_token: '',
    });
    expect(result.error).toContain('Reconnect');
    expect(refresh).not.toHaveBeenCalled();
  });
  it('never refreshes a disconnected account', async () => {
    const result = await ensureValidToken(database(), {
      ...token,
      is_active: false,
    });
    expect(result.accessToken).toBe('');
    expect(refresh).not.toHaveBeenCalled();
  });
  it('does not report durable refresh success if persistence failed', async () => {
    expect(
      (await ensureValidToken(database({ message: 'db unavailable' }), token))
        .error
    ).toBe('Failed to persist refreshed credential');
  });
  it('keeps transient provider failures retryable without exposing raw errors', async () => {
    const db = database();
    refresh.mockRejectedValue(
      new Error('upstream unavailable with private response details')
    );
    const result = await ensureValidToken(db, token);
    expect(result.error).toBe('Microsoft token refresh failed');
    expect(db.update).not.toHaveBeenCalled();
  });
  it('marks revoked consent inactive', async () => {
    const db = database();
    refresh.mockRejectedValue({ errorCode: 'invalid_grant' });
    expect((await ensureValidToken(db, token)).error).toBe('invalid_grant');
    expect(db.update).toHaveBeenCalledWith({ is_active: false });
  });
});
