import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { createMountedAppAuth } from './mounted-app-auth';

vi.mock('@tuturuuu/supabase/next/proxy', () => ({ updateSession: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: vi.fn(),
}));
vi.mock('./logout-fence', () => ({
  appLogoutFenceResponse: () => null,
  withAppLogoutFence: (_request: NextRequest, run: () => unknown) => run(),
}));

const signedOut = vi.fn(async () => ({
  ok: false as const,
  error: 'Shared session unavailable',
}));

function setup(resolve = signedOut) {
  return createMountedAppAuth(
    { targetApp: 'learn', publicPaths: ['/', '/pricing'] },
    {
      resolveMountedSharedSession: resolve as never,
      consumeMountedSharedSession: vi.fn() as never,
    }
  );
}

const mounted = (path: string) =>
  new NextRequest(`https://tuturuuu.com/learn${path}`, {
    nextConfig: { basePath: '/learn' },
  });

describe('createMountedAppAuth public paths', () => {
  it.each(['', '/', '/en', '/vi/', '/pricing', '/en/pricing'])(
    'serves the public page %s signed out',
    async (path) => {
      const response = await setup().auth(mounted(path));
      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    }
  );

  it.each(['/en/courses', '/pricing/plans', '/pricingx', '/en/x?y=1'])(
    'still sends %s to Web login when signed out',
    async (path) => {
      const response = await setup().auth(mounted(path));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get('location') ?? '').pathname).toBe(
        '/login'
      );
    }
  );

  it.each(['MFA required', 'Account assurance unavailable'])(
    'keeps the gated response on a public page when %s',
    async (error) => {
      const auth = setup(
        vi.fn(async () => ({ ok: false as const, error })) as never
      );
      const response = await auth.auth(mounted('/en'));
      expect(response.status === 200 && !response.headers.get('location')).toBe(
        false
      );
    }
  );

  it('drops refused app credentials before a signed-out public page', async () => {
    const response = await setup().auth(
      new NextRequest('https://tuturuuu.com/learn/en', {
        nextConfig: { basePath: '/learn' },
        headers: {
          authorization: 'Bearer stale',
          cookie:
            'tuturuuu_app_session=stale; tuturuuu_web_app_session.0=stale; NEXT_LOCALE=vi',
        },
      })
    );
    const forwarded = response.headers.get('x-middleware-request-cookie') ?? '';
    expect(forwarded).toBe('NEXT_LOCALE=vi');
    expect(response.headers.has('x-middleware-request-authorization')).toBe(
      false
    );
  });

  it('keeps the session response for a signed-in public page', async () => {
    const sessionResponse = NextResponse.next();
    const auth = setup(
      vi.fn(async () => ({
        ok: true as const,
        response: sessionResponse,
      })) as never
    );
    expect(await auth.auth(mounted('/en'))).toBe(sessionResponse);
  });
});
