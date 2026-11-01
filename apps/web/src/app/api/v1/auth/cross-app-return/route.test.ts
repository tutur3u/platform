import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getExternalAppByReturnUrl: vi.fn(),
  rpc: vi.fn(),
  serverLoggerWarn: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppByReturnUrl: (
    ...args: Parameters<typeof mocks.getExternalAppByReturnUrl>
  ) => mocks.getExternalAppByReturnUrl(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    warn: (...args: Parameters<typeof mocks.serverLoggerWarn>) =>
      mocks.serverLoggerWarn(...args),
  },
  withRequestLogDrain: (_metadata: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

function createRequest(
  returnUrl: string,
  options?: {
    generateToken?: boolean;
    origin?: string;
  }
) {
  const { origin = 'http://localhost', ...body } = options ?? {};

  return new NextRequest(`${origin}/api/v1/auth/cross-app-return`, {
    body: JSON.stringify({ ...body, returnUrl }),
    method: 'POST',
  });
}

describe('cross-app return route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS', '');
    mocks.getExternalAppByReturnUrl.mockResolvedValue(null);
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi
          .fn()
          .mockResolvedValue({ data: { claims: {} }, error: null }),
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              email: 'agent@example.com',
              id: 'user-1',
            },
          },
          error: null,
        }),
      },
      rpc: mocks.rpc.mockResolvedValue({
        data: 'cross-app-token',
        error: null,
      }),
    });
  });

  it.each([['nova', 'https://nova.ai.vn']])(
    'verifies the canonical %s origin before sign-in',
    async (app, origin) => {
      const response = await POST(
        createRequest(`${origin}/verify-token?nextUrl=%2F`, {
          generateToken: false,
        })
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ appName: app, targetApp: app });
      expect(mocks.getExternalAppByReturnUrl).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );

  it.each([['nova', 'https://nova.ai.vn']])(
    'returns a %s token to its canonical verifier',
    async (app, origin) => {
      const response = await POST(
        createRequest(`${origin}/verify-token?nextUrl=%2Fpersonal`)
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const returnUrl = new URL(body.returnUrl);
      expect(body.targetApp).toBe(app);
      expect(returnUrl.origin).toBe(origin);
      expect(returnUrl.pathname).toBe('/verify-token');
      expect(returnUrl.searchParams.get('nextUrl')).toBe('/personal');
      expect(returnUrl.searchParams.get('token')).toBe('cross-app-token');
      expect(returnUrl.searchParams.get('targetApp')).toBe(app);
      expect(mocks.rpc).toHaveBeenCalledWith(
        'generate_cross_app_token',
        expect.objectContaining({ p_target_app: app })
      );
      expect(mocks.getExternalAppByReturnUrl).not.toHaveBeenCalled();
    }
  );

  it('routes internal app login return URLs through the local verifier', async () => {
    const response = await POST(
      createRequest('https://tasks.tuturuuu.localhost/login')
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      returnUrl: string;
      targetApp: string;
    };
    const returnUrl = new URL(body.returnUrl);

    expect(body.targetApp).toBe('tasks');
    expect(returnUrl.origin).toBe('https://tasks.tuturuuu.localhost');
    expect(returnUrl.pathname).toBe('/verify-token');
    expect(returnUrl.searchParams.get('nextUrl')).toBe('/');
    expect(returnUrl.searchParams.get('token')).toBe('cross-app-token');
    expect(returnUrl.searchParams.get('originApp')).toBe('web');
    expect(returnUrl.searchParams.get('targetApp')).toBe('tasks');
  });

  it('preserves internal app deep links as verifier nextUrl values', async () => {
    const response = await POST(
      createRequest('https://tasks.tuturuuu.localhost/personal/tasks?view=mine')
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { returnUrl: string };
    const returnUrl = new URL(body.returnUrl);

    expect(returnUrl.origin).toBe('https://tasks.tuturuuu.localhost');
    expect(returnUrl.pathname).toBe('/verify-token');
    expect(returnUrl.searchParams.get('nextUrl')).toBe(
      '/personal/tasks?view=mine'
    );
    expect(returnUrl.searchParams.get('token')).toBe('cross-app-token');
  });

  it('routes Meet production login returns to the local verifier', async () => {
    const response = await POST(
      createRequest(
        'https://meet.tuturuuu.com/login?nextUrl=/workspace/personal/plans'
      )
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      returnUrl: string;
      targetApp: string;
    };
    const returnUrl = new URL(body.returnUrl);

    expect(body.targetApp).toBe('meet');
    expect(returnUrl.origin).toBe('https://meet.tuturuuu.com');
    expect(returnUrl.pathname).toBe('/verify-token');
    expect(returnUrl.searchParams.get('nextUrl')).toBe(
      '/workspace/personal/plans'
    );
    expect(returnUrl.searchParams.get('token')).toBe('cross-app-token');
  });

  it('routes Chat production verifier returns with a chat target app token', async () => {
    const response = await POST(
      createRequest(
        'https://chat.tuturuuu.com/verify-token?nextUrl=%2Fpersonal'
      )
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      returnUrl: string;
      targetApp: string;
    };
    const returnUrl = new URL(body.returnUrl);

    expect(body.targetApp).toBe('chat');
    expect(returnUrl.origin).toBe('https://chat.tuturuuu.com');
    expect(returnUrl.pathname).toBe('/verify-token');
    expect(returnUrl.searchParams.get('nextUrl')).toBe('/personal');
    expect(returnUrl.searchParams.get('token')).toBe('cross-app-token');
    expect(returnUrl.searchParams.get('originApp')).toBe('web');
    expect(returnUrl.searchParams.get('targetApp')).toBe('chat');
  });

  it.each(['verify-token', 'verify-token/'])(
    'returns apex-mounted %s URLs to the mounted app, inside the mount',
    async (verifier) => {
      vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'inventory');
      const response = await POST(
        createRequest(
          `https://tuturuuu.com/inventory/${verifier}?nextUrl=%2Fpersonal%2Fcatalog`
        )
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        returnUrl: string;
        targetApp: string;
      };
      const returnUrl = new URL(body.returnUrl);

      expect(body.targetApp).toBe('inventory');
      expect(returnUrl.origin).toBe('https://tuturuuu.com');
      expect(returnUrl.pathname).toBe('/inventory/verify-token');
      expect(returnUrl.searchParams.get('nextUrl')).toBe('/personal/catalog');
      expect(returnUrl.searchParams.get('targetApp')).toBe('inventory');
    }
  );

  it.each([
    ['an unsafe nextUrl', 'https%3A%2F%2Fevil.test', '/'],
    ['a nested verifier nextUrl', '%2Fverify-token%3FnextUrl%3D%252Fa', '/a'],
  ])('keeps %s inside the mount', async (_label, nextUrl, expected) => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'inventory');
    const response = await POST(
      createRequest(
        `https://tuturuuu.com/inventory/verify-token?nextUrl=${nextUrl}`
      )
    );
    const body = (await response.json()) as { returnUrl: string };
    const returnUrl = new URL(body.returnUrl);

    expect(returnUrl.pathname).toBe('/inventory/verify-token');
    expect(returnUrl.searchParams.get('nextUrl')).toBe(expected);
  });

  it('never mints an app token to an apex path that is not an active mount', async () => {
    const response = await POST(
      createRequest(
        'https://tuturuuu.com/inventory/verify-token?nextUrl=%2Fpersonal'
      )
    );
    const body = (await response.json()) as {
      returnUrl: string;
      targetApp: string;
    };

    expect(body.targetApp).toBe('platform');
    expect(new URL(body.returnUrl).pathname).toBe('/verify-token');
  });

  it('resolves the root platform URL when supplied over http', async () => {
    const response = await POST(
      createRequest('http://tuturuuu.com', { generateToken: false })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      appName: 'platform',
      targetApp: 'platform',
    });
  });

  it('resolves managed wildcard Tuturuuu return URLs without creating a token', async () => {
    const response = await POST(
      createRequest(
        'https://vc.tuturuuu.com/verify-token?nextUrl=%2Fworkspace%2Fpersonal%2Fplans',
        { generateToken: false, origin: 'https://tuturuuu.com' }
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      appName: 'vc.tuturuuu.com',
      targetApp: 'managed-tuturuuu',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('resolves bare managed wildcard Tuturuuu origins without creating a token', async () => {
    const response = await POST(
      createRequest('https://vercel.tuturuuu.com', {
        generateToken: false,
        origin: 'https://tuturuuu.com',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      appName: 'vercel.tuturuuu.com',
      targetApp: 'managed-tuturuuu',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('redirects managed wildcard Tuturuuu returns directly after authentication', async () => {
    const response = await POST(
      createRequest(
        'https://vc.tuturuuu.com/verify-token?nextUrl=%2Fworkspace%2Fpersonal%2Fplans',
        { origin: 'https://tuturuuu.com' }
      )
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      returnUrl: string;
      targetApp: string;
    };
    const returnUrl = new URL(body.returnUrl);

    expect(body.targetApp).toBe('managed-tuturuuu');
    expect(returnUrl.toString()).toBe(
      'https://vc.tuturuuu.com/workspace/personal/plans'
    );
    expect(returnUrl.searchParams.has('token')).toBe(false);
    expect(returnUrl.searchParams.has('originApp')).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  describe('staging hosts outside the shared cookie domain', () => {
    const stagingWebOrigin = 'https://web.staging.tutur3u.com';
    const stagingTasksOrigin = 'https://tasks.staging.tutur3u.com';

    it('hands off a token to a registered staging satellite from the staging web host', async () => {
      vi.stubEnv(
        'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
        '.staging.tutur3u.com'
      );
      vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'staging');
      vi.stubEnv(
        'NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS',
        `tasks:${stagingTasksOrigin}`
      );

      const response = await POST(
        createRequest(
          `${stagingTasksOrigin}/verify-token?nextUrl=%2Fpersonal`,
          {
            origin: stagingWebOrigin,
          }
        )
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        returnUrl: string;
        targetApp: string;
      };
      const returnUrl = new URL(body.returnUrl);

      expect(body.targetApp).toBe('tasks');
      expect(returnUrl.origin).toBe(stagingTasksOrigin);
      expect(returnUrl.pathname).toBe('/verify-token');
      expect(returnUrl.searchParams.get('token')).toBe('cross-app-token');
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
    });

    it('does not shortcut an unregistered staging satellite as managed', async () => {
      const response = await POST(
        createRequest(`${stagingTasksOrigin}/personal`, {
          origin: stagingWebOrigin,
        })
      );

      expect(response.status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('does not skip the token for a tuturuuu.com return URL from a staging web host', async () => {
      const response = await POST(
        createRequest('https://vc.tuturuuu.com/workspace/personal/plans', {
          origin: stagingWebOrigin,
        })
      );

      expect(response.status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('never acts on the staging registry from a production web host', async () => {
      vi.stubEnv(
        'NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS',
        `tasks:${stagingTasksOrigin}`
      );

      const response = await POST(
        createRequest(
          `${stagingTasksOrigin}/verify-token?nextUrl=%2Fpersonal`,
          {
            origin: 'https://tuturuuu.com',
          }
        )
      );

      expect(response.status).toBe(400);
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('rejects a production satellite return from the staging web host', async () => {
      vi.stubEnv(
        'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
        '.staging.tutur3u.com'
      );
      vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'staging');

      const response = await POST(
        createRequest('https://tasks.tuturuuu.com/verify-token?nextUrl=%2F', {
          origin: stagingWebOrigin,
        })
      );

      expect(response.status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('rejects a registry entry outside the staging cookie domain', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubEnv(
        'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
        '.staging.tutur3u.com'
      );
      vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'staging');
      vi.stubEnv(
        'NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS',
        'tasks:https://tasks.example.tutur3u.com'
      );

      const response = await POST(
        createRequest(
          'https://tasks.example.tutur3u.com/verify-token?nextUrl=%2Fpersonal',
          { origin: stagingWebOrigin }
        )
      );

      expect(response.status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('keeps the tokenless managed path for unregistered hosts inside the configured staging domain', async () => {
      vi.stubEnv(
        'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
        '.staging.tutur3u.com'
      );
      vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'staging');

      const response = await POST(
        createRequest('https://preview.staging.tutur3u.com/personal', {
          generateToken: false,
          origin: stagingWebOrigin,
        })
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        targetApp: 'managed-tuturuuu',
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  });

  it('rejects managed wildcard hostname lookalikes', async () => {
    const response = await POST(
      createRequest(
        'https://vc.tuturuuu.com.evil.test/workspace/personal/plans',
        { generateToken: false }
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid returnUrl',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('rejects Portless return URLs on arbitrary localhost ports', async () => {
    const response = await POST(
      createRequest(
        'https://attacker.tasks.tuturuuu.localhost:4444/personal/tasks'
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid returnUrl',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('still resolves configured external app returns through the API', async () => {
    const originalPublicExternalDomains =
      process.env.NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS;
    const originalServerExternalDomains =
      process.env.TUTURUUU_EXTERNAL_APP_DOMAINS;

    try {
      process.env.TUTURUUU_EXTERNAL_APP_DOMAINS =
        'partner:https://partner.example';
      delete process.env.NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS;

      const response = await POST(
        createRequest('https://partner.example/callback?state=next')
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        returnUrl: string;
        targetApp: string;
      };
      const returnUrl = new URL(body.returnUrl);

      expect(body.targetApp).toBe('partner');
      expect(returnUrl.origin).toBe('https://partner.example');
      expect(returnUrl.pathname).toBe('/callback');
      expect(returnUrl.searchParams.get('state')).toBe('next');
      expect(returnUrl.searchParams.get('token')).toBe('cross-app-token');
      expect(returnUrl.searchParams.get('originApp')).toBe('web');
      expect(returnUrl.searchParams.get('targetApp')).toBe('partner');
    } finally {
      if (originalPublicExternalDomains === undefined) {
        delete process.env.NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS;
      } else {
        process.env.NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS =
          originalPublicExternalDomains;
      }

      if (originalServerExternalDomains === undefined) {
        delete process.env.TUTURUUU_EXTERNAL_APP_DOMAINS;
      } else {
        process.env.TUTURUUU_EXTERNAL_APP_DOMAINS =
          originalServerExternalDomains;
      }
    }
  });
});
