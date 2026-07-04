import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  }
) {
  return new NextRequest('http://localhost/api/v1/auth/cross-app-return', {
    body: JSON.stringify({ ...options, returnUrl }),
    method: 'POST',
  });
}

describe('cross-app return route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getExternalAppByReturnUrl.mockResolvedValue(null);
    mocks.createClient.mockResolvedValue({
      auth: {
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
        { generateToken: false }
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
        'https://vc.tuturuuu.com/verify-token?nextUrl=%2Fworkspace%2Fpersonal%2Fplans'
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
