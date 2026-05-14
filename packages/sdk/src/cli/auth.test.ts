import { describe, expect, it, vi } from 'vitest';
import { exchangeCliToken, refreshCliSession } from './auth';

describe('CLI auth exchange', () => {
  it('uses the CLI-specific verification route and session label', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          session: {
            access_token: 'ttr_app_access-token',
            refresh_expires_at: 456,
            refresh_token: 'ttr_app_refresh-token',
            expires_at: 123,
            expires_in: 3600,
            token_type: 'bearer',
          },
          email: 'ada@example.com',
          sessionCreated: true,
          userId: 'user-1',
          valid: true,
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }
      )
    );

    const result = await exchangeCliToken({
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
      token: 'copy-token',
    });

    expect(result.session.access_token).toBe('ttr_app_access-token');
    expect(result.session.refresh_token).toBe('ttr_app_refresh-token');
    expect(result.session.refresh_expires_at).toBe(456);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/cli/auth/verify',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-CLI-Session-Name': 'Tuturuuu CLI',
        }),
        body: JSON.stringify({ token: 'copy-token' }),
      })
    );
  });

  it('refreshes through the CLI app-session refresh route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          session: {
            access_token: 'ttr_app_fresh-access-token',
            expires_at: 123,
            expires_in: 3600,
            refresh_expires_at: 456,
            refresh_expires_in: 7_776_000,
            refresh_token: 'ttr_app_fresh-refresh-token',
            token_type: 'bearer',
          },
          sessionCreated: true,
          valid: true,
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }
      )
    );

    const result = await refreshCliSession({
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
      refreshToken: 'ttr_app_old-refresh-token',
    });

    expect(result).toEqual({
      accessToken: 'ttr_app_fresh-access-token',
      expiresAt: 123,
      refreshExpiresAt: 456,
      refreshToken: 'ttr_app_fresh-refresh-token',
      tokenType: 'bearer',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/cli/auth/refresh',
      expect.objectContaining({
        body: JSON.stringify({ refreshToken: 'ttr_app_old-refresh-token' }),
        method: 'POST',
      })
    );
  });
});
