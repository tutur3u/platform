import {
  extractTurnstileRemoteIp,
  resolveTurnstileToken,
  TurnstileError,
  verifyTurnstileToken,
} from './server';

describe('extractTurnstileRemoteIp', () => {
  it('prefers cf-connecting-ip over forwarded headers', () => {
    const request = {
      headers: new Headers({
        'cf-connecting-ip': '198.51.100.10',
        'x-forwarded-for': '203.0.113.1, 203.0.113.2',
      }),
    };

    expect(extractTurnstileRemoteIp(request)).toBe('198.51.100.10');
  });

  it('falls back to true-client-ip before generic forwarded headers', () => {
    const request = {
      headers: new Headers({
        'true-client-ip': '198.51.100.11',
        'x-forwarded-for': '203.0.113.3, 203.0.113.4',
      }),
    };

    expect(extractTurnstileRemoteIp(request)).toBe('198.51.100.11');
  });
});

describe('resolveTurnstileToken', () => {
  it('allows a dev bypass', () => {
    expect(resolveTurnstileToken({ devMode: true }).isRequired).toBe(false);
  });

  it('returns the site key and token when provided', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-key';

    expect(
      resolveTurnstileToken({
        token: 'captcha-token',
      })
    ).toMatchObject({
      siteKey: 'site-key',
      captchaToken: 'captcha-token',
      isRequired: true,
    });
  });

  it('rejects missing production configuration when requested', () => {
    try {
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '';

      resolveTurnstileToken({
        devMode: false,
      });
      throw new Error('Expected TurnstileError');
    } catch (error) {
      expect(error).toBeInstanceOf(TurnstileError);
      expect((error as TurnstileError).code).toBe('not_configured');
      expect((error as Error).message).toBe('Turnstile is not configured');
    }
  });

  it('rejects missing tokens in production', () => {
    try {
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-key';

      resolveTurnstileToken({
        devMode: false,
      });
      throw new Error('Expected TurnstileError');
    } catch (error) {
      expect(error).toBeInstanceOf(TurnstileError);
      expect((error as TurnstileError).code).toBe('required');
      expect((error as Error).message).toBe(
        'Turnstile verification is required'
      );
    }
  });
});

describe('verifyTurnstileToken', () => {
  it('posts to Cloudflare with the remote ip when verification is required', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-key';
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    await verifyTurnstileToken(
      {
        headers: new Headers({
          'x-forwarded-for': '203.0.113.15, 203.0.113.16',
        }),
      },
      {
        token: 'captcha-token',
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect((init.body as URLSearchParams).get('remoteip')).toBe('203.0.113.15');

    fetchMock.mockRestore();
  });

  it('throws a typed error when verification fails', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-key';
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    } as Response);

    try {
      await verifyTurnstileToken(
        { headers: new Headers() },
        {
          token: 'captcha-token',
        }
      );
      throw new Error('Expected TurnstileError');
    } catch (error) {
      expect(error).toBeInstanceOf(TurnstileError);
      expect((error as TurnstileError).code).toBe('verification_failed');
      expect((error as Error).message).toBe('Turnstile verification failed');
    } finally {
      fetchMock.mockRestore();
    }
  });
});
