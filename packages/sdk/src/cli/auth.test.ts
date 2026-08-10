import { afterEach, describe, expect, it, vi } from 'vitest';

const { openBrowserMock } = vi.hoisted(() => ({
  openBrowserMock: vi.fn(),
}));

vi.mock('./browser', () => ({
  openBrowser: openBrowserMock,
}));

import {
  exchangeCliToken,
  receiveTokenFromBrowser,
  refreshCliSession,
} from './auth';

afterEach(() => {
  openBrowserMock.mockReset();
  vi.restoreAllMocks();
});

async function completeBrowserLogin(loginUrl: string, token: string) {
  const startUrl = new URL(loginUrl);
  const redirectUri = startUrl.searchParams.get('redirect_uri');
  if (!redirectUri) throw new Error('Expected a browser callback URL.');

  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set(
    'state',
    startUrl.searchParams.get('state') ?? ''
  );
  callbackUrl.searchParams.set('token', token);

  const response = await fetch(callbackUrl);
  expect(response.status).toBe(200);
}

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

describe('CLI browser login fallback', () => {
  it('prints the exact login URL after an asynchronous opener failure', async () => {
    let reportFailure: ((opened: boolean) => void) | undefined;
    openBrowserMock.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          reportFailure = resolve;
        })
    );
    const stdout = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    const tokenPromise = receiveTokenFromBrowser('https://tuturuuu.com');
    await vi.waitFor(() => expect(openBrowserMock).toHaveBeenCalledOnce());

    const loginUrl = openBrowserMock.mock.calls[0]?.[0] as string;
    expect(stdout).not.toHaveBeenCalledWith(
      expect.stringContaining('Open this URL to continue:')
    );

    reportFailure?.(false);
    await vi.waitFor(() =>
      expect(stdout).toHaveBeenCalledWith(
        `Open this URL to continue:\n${loginUrl}\n`
      )
    );

    await completeBrowserLogin(loginUrl, 'browser-token');
    await expect(tokenPromise).resolves.toBe('browser-token');
  });

  it('does not print the fallback after a successful spawn', async () => {
    openBrowserMock.mockResolvedValue(true);
    const stdout = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    const tokenPromise = receiveTokenFromBrowser('https://tuturuuu.com');
    await vi.waitFor(() => expect(openBrowserMock).toHaveBeenCalledOnce());

    const loginUrl = openBrowserMock.mock.calls[0]?.[0] as string;
    await completeBrowserLogin(loginUrl, 'browser-token');
    await expect(tokenPromise).resolves.toBe('browser-token');

    expect(stdout).not.toHaveBeenCalledWith(
      expect.stringContaining('Open this URL to continue:')
    );
  });
});
