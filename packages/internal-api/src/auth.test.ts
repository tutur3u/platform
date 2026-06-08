import { describe, expect, it, vi } from 'vitest';
import { passwordLoginWithInternalApi } from './auth';

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
});
