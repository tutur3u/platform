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
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));

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

  it('omits the remote ip for trusted server-to-server relays', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));

    await verifyTurnstileToken(
      {
        headers: new Headers({
          'x-forwarded-for': '198.51.100.20',
        }),
      },
      'captcha-token',
      {
        devMode: false,
        fetch: fetchMock,
        includeRemoteIp: false,
        secretKey: 'secret-key',
      }
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.body as URLSearchParams).has('remoteip')).toBe(false);
  });

  it('throws a typed error when verification fails', async () => {
    try {
      await verifyTurnstileToken({ headers: new Headers() }, 'captcha-token', {
        devMode: false,
        secretKey: 'secret-key',
        fetch: vi.fn().mockResolvedValue(Response.json({ success: false })),
      });
      throw new Error('Expected TurnstileError');
    } catch (error) {
      expect(error).toBeInstanceOf(TurnstileError);
      expect((error as TurnstileError).code).toBe('verification_failed');
      expect((error as Error).message).toBe('Turnstile verification failed');
    }
  });
});

describe('strict native Turnstile binding', () => {
  const options = {
    devMode: false,
    secretKey: 'fixture-secret',
    expectedHostname: 'tuturuuu.com',
    expectedAction: 'native_integrity',
    expectedCData: 'request-hash',
  };
  it('accepts only the expected hostname, action and challenge hash', async () => {
    await expect(
      verifyTurnstileToken({ headers: new Headers() }, 'token', {
        ...options,
        fetch: vi.fn().mockResolvedValue(
          Response.json({
            success: true,
            hostname: 'tuturuuu.com',
            action: 'native_integrity',
            cdata: 'request-hash',
          })
        ),
      })
    ).resolves.toBeUndefined();
  });
  it.each(['hostname', 'action', 'cdata'])(
    'rejects mismatched or missing %s',
    async (field) => {
      const valid = {
        success: true,
        hostname: 'tuturuuu.com',
        action: 'native_integrity',
        cdata: 'request-hash',
      };
      for (const bad of [
        { ...valid, [field]: 'wrong' },
        Object.fromEntries(
          Object.entries(valid).filter(([key]) => key !== field)
        ),
      ]) {
        await expect(
          verifyTurnstileToken({ headers: new Headers() }, 'token', {
            ...options,
            fetch: vi.fn().mockResolvedValue(Response.json(bad)),
          })
        ).rejects.toMatchObject({ code: 'verification_failed' });
      }
    }
  );
  it('rejects truthy nonboolean success and malformed provider objects', async () => {
    for (const result of [null, 'success', { success: 'true' }])
      await expect(
        verifyTurnstileToken({ headers: new Headers() }, 'token', {
          ...options,
          fetch: vi.fn().mockResolvedValue(Response.json(result)),
        })
      ).rejects.toMatchObject({ code: 'verification_failed' });
  });
  it('bounds the provider response before parsing', async () => {
    await expect(
      verifyTurnstileToken({ headers: new Headers() }, 'token', {
        ...options,
        fetch: vi.fn().mockResolvedValue(new Response('x'.repeat(16_385))),
      })
    ).rejects.toMatchObject({ code: 'verification_failed' });
  });
  it('cancels and drains a stalled Siteverify body under the same request deadline', async () => {
    const cancelled = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(new ReadableStream({ pull() {}, cancel: cancelled }))
    );
    await expect(
      verifyTurnstileToken({ headers: new Headers() }, 'token', {
        ...options,
        fetch,
        timeoutMs: 20,
      })
    ).rejects.toThrow();
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
