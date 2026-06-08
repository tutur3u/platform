import { describe, expect, it, vi } from 'vitest';
import { passwordLoginWithInternalApi } from './auth';

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
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
});
