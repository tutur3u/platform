import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getExternalAppByReturnUrl: vi.fn(),
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
      rpc: vi.fn().mockResolvedValue({
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
});
