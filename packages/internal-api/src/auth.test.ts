import { describe, expect, it, vi } from 'vitest';
import {
  consumeAuthRecoveryWithInternalApi,
  listWebAccountsWithInternalApi,
  logoutAllWebAccountsWithInternalApi,
  logoutBrowserSessionWithInternalApi,
  passwordLoginWithInternalApi,
  saveCurrentWebAccountWithInternalApi,
  switchWebAccountWithInternalApi,
} from './auth';

function createJsonResponse(
  payload: unknown,
  init: { headers?: HeadersInit; ok?: boolean; status?: number } = {}
) {
  return {
    headers: new Headers(init.headers),
    json: async () => payload,
    ok: init.ok ?? true,
    status: init.status ?? 200,
  };
}

describe('auth internal API helpers', () => {
  it('sends password login with CAPTCHA through the centralized auth API route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        success: true,
      })
    );
    const payload = {
      captchaToken: 'captcha-token',
      client: 'web' as const,
      email: 'person@example.com',
      locale: 'en',
      password: 'password123',
    };

    await passwordLoginWithInternalApi(payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/auth/password-login',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('preserves Retry-After on password login rate-limit responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse(
        {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
        },
        {
          headers: { 'Retry-After': '35' },
          ok: false,
          status: 429,
        }
      )
    );

    const result = await passwordLoginWithInternalApi(
      {
        captchaToken: 'captcha-token',
        client: 'web',
        email: 'person@example.com',
        locale: 'en',
        password: 'password123',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(result).toMatchObject({
      error: 'Too Many Requests',
      retryAfter: 35,
    });
  });

  it('submits auth recovery codes through the centralized auth API route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        redirectTo: '/en/onboarding',
        success: true,
      })
    );
    const payload = {
      code: '123456',
      email: 'person@example.com',
      locale: 'en',
      next: '/en/personal',
    };

    await consumeAuthRecoveryWithInternalApi(payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/auth/recovery/consume',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('loads web multi-account summaries without caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        accounts: [],
        activeAccountId: null,
      })
    );

    await listWebAccountsWithInternalApi({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/auth/accounts',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('saves the current web account through the server vault route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        accounts: [],
        activeAccountId: 'user-1',
        success: true,
      })
    );
    const payload = {
      returnUrl: '/en/personal/tasks',
      route: '/en/personal/tasks',
    };

    await saveCurrentWebAccountWithInternalApi(payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/auth/accounts/current',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('switches web accounts through the server vault route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        accounts: [],
        activeAccountId: 'user-2',
        success: true,
      })
    );

    await switchWebAccountWithInternalApi(
      'user-2',
      {
        currentRoute: '/en/personal/tasks',
        targetRoute: '/en/personal/calendar',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/auth/accounts/switch',
      expect.objectContaining({
        method: 'POST',
      })
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toEqual({
      accountId: 'user-2',
      currentRoute: '/en/personal/tasks',
      targetRoute: '/en/personal/calendar',
    });
  });

  it('logs out all web accounts through the server vault route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        accounts: [],
        activeAccountId: null,
        success: true,
      })
    );

    await logoutAllWebAccountsWithInternalApi({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/auth/accounts/logout-all',
      expect.objectContaining({
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('logs out the browser session through the legacy session route facade', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        success: true,
      })
    );

    await logoutBrowserSessionWithInternalApi({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/auth/logout',
      expect.objectContaining({
        cache: 'no-store',
        method: 'POST',
      })
    );
  });
});
