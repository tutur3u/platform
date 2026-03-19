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

  it('prefers x-forwarded-for over x-real-ip when cloud proxy headers are absent', () => {
    const request = {
      headers: new Headers({
        'x-forwarded-for': '198.51.100.12, 203.0.113.5',
        'x-real-ip': '10.0.0.8',
      }),
    };

    expect(extractTurnstileRemoteIp(request)).toBe('198.51.100.12');
  });
});

describe('resolveTurnstileToken', () => {
  it('allows a dev bypass when no token is present', () => {
    expect(
      resolveTurnstileToken({
        devMode: true,
      })
    ).toMatchObject({
      shouldBypassForDev: true,
      captchaOptions: {},
      isRequired: false,
    });
  });

  it('rejects missing production configuration when requested', () => {
    try {
      resolveTurnstileToken({
        devMode: false,
        requireConfiguration: true,
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
      resolveTurnstileToken({
        devMode: false,
        siteKey: 'site-key',
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    await verifyTurnstileToken(
      {
        headers: new Headers({
          'x-forwarded-for': '203.0.113.15, 203.0.113.16',
        }),
      },
      'captcha-token',
      {
        devMode: false,
        secretKey: 'secret-key',
        fetch: fetchMock,
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect((init.body as URLSearchParams).get('remoteip')).toBe('203.0.113.15');
  });

  it('throws a typed error when verification fails', async () => {
    try {
      await verifyTurnstileToken({ headers: new Headers() }, 'captcha-token', {
        devMode: false,
        secretKey: 'secret-key',
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ success: false }),
        }),
      });
      throw new Error('Expected TurnstileError');
    } catch (error) {
      expect(error).toBeInstanceOf(TurnstileError);
      expect((error as TurnstileError).code).toBe('verification_failed');
      expect((error as Error).message).toBe('Turnstile verification failed');
    }
  });
});
