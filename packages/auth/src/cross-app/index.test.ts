import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let mapUrlToApp: typeof import('./index').mapUrlToApp;
let verifyRouteToken: typeof import('./index').verifyRouteToken;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'test-publishable-key';

  ({ mapUrlToApp, verifyRouteToken } = await import('./index.js'));
});

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockRouter() {
  return {
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  };
}

describe('mapUrlToApp', () => {
  it('maps the CMS production URL to the cms app', () => {
    expect(
      mapUrlToApp('https://cms.tuturuuu.com/verify-token?nextUrl=%2F')
    ).toBe('cms');
  });

  it('maps the CMS development URL to the cms app', () => {
    expect(mapUrlToApp('http://localhost:7811/verify-token?nextUrl=%2F')).toBe(
      'cms'
    );
  });

  it('maps the Learn production URL to the learn app', () => {
    expect(
      mapUrlToApp('https://learn.tuturuuu.com/verify-token?nextUrl=%2F')
    ).toBe('learn');
  });

  it('maps the Teach development URL to the teach app', () => {
    expect(mapUrlToApp('http://localhost:7813/verify-token?nextUrl=%2F')).toBe(
      'teach'
    );
  });

  it('maps registered app return URLs for production and localhost development', () => {
    expect(
      mapUrlToApp('https://nova.ai.vn/verify-token?nextUrl=%2Fdashboard')
    ).toBe('nova');
    expect(
      mapUrlToApp('https://rewise.me/verify-token?nextUrl=%2Fpersonal')
    ).toBe('rewise');
    expect(
      mapUrlToApp('http://localhost:7806/verify-token?nextUrl=%2Fcalendar')
    ).toBe('calendar');
    expect(
      mapUrlToApp('http://localhost:7809/verify-token?nextUrl=%2Fpersonal')
    ).toBe('tudo');
  });

  it.each([
    ['platform', 'https://tuturuuu.localhost/verify-token?nextUrl=%2F'],
    ['cms', 'https://cms.tuturuuu.localhost/verify-token?nextUrl=%2F'],
    [
      'calendar',
      'https://calendar.tuturuuu.localhost/verify-token?nextUrl=%2Fcalendar',
    ],
    ['nova', 'https://nova.tuturuuu.localhost/verify-token?nextUrl=%2F'],
    ['rewise', 'https://rewise.tuturuuu.localhost/verify-token?nextUrl=%2F'],
    [
      'tudo',
      'https://tasks.tuturuuu.localhost/verify-token?nextUrl=%2Fpersonal',
    ],
    ['finance', 'https://finance.tuturuuu.localhost/verify-token?nextUrl=%2F'],
    ['track', 'https://track.tuturuuu.localhost/verify-token?nextUrl=%2F'],
    ['learn', 'https://learn.tuturuuu.localhost/verify-token?nextUrl=%2F'],
    ['teach', 'https://teach.tuturuuu.localhost/verify-token?nextUrl=%2F'],
    ['hive', 'https://hive.tuturuuu.localhost/verify-token?nextUrl=%2F'],
  ])('maps %s Portless return URLs', (expectedApp, returnUrl) => {
    expect(mapUrlToApp(returnUrl)).toBe(expectedApp);
  });

  it('continues to map representative Portless aliases for task and calendar apps', () => {
    expect(
      mapUrlToApp(
        'https://tasks.tuturuuu.localhost/verify-token?nextUrl=%2Fpersonal'
      )
    ).toBe('tudo');
    expect(
      mapUrlToApp(
        'https://calendar.tuturuuu.localhost/verify-token?nextUrl=%2Fcalendar'
      )
    ).toBe('calendar');
  });

  it('rejects hostname prefix lookalikes', () => {
    expect(mapUrlToApp('https://learn.tuturuuu.com.evil.test')).toBeNull();
  });
});

describe('verifyRouteToken', () => {
  it('redirects instead of hanging when token verification returns a non-JSON error', async () => {
    const router = createMockRouter();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
        })
      )
    );

    await verifyRouteToken({
      router,
      searchParams: new URLSearchParams('nextUrl=%2F&token=dummy'),
      token: 'dummy',
    });

    expect(router.push).toHaveBeenCalledWith('/');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('trusts the HttpOnly app-session cookie set by the verifier route before redirecting', async () => {
    const router = createMockRouter();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          appSessionCreated: true,
          userId: 'user-1',
          valid: true,
        })
      )
    );

    await verifyRouteToken({
      router,
      searchParams: new URLSearchParams('nextUrl=%2Fpersonal'),
      token: 'token-1',
    });

    expect(router.push).toHaveBeenCalledWith('/personal');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('does not read or mutate a stale local Supabase session when verifying a fresh token', async () => {
    const router = createMockRouter();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          appSessionCreated: true,
          userId: 'user-1',
          valid: true,
        })
      )
    );

    await verifyRouteToken({
      router,
      searchParams: new URLSearchParams('nextUrl=%2Fpersonal'),
      token: 'token-1',
    });

    expect(router.push).toHaveBeenCalledWith('/personal');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('redirects when token verification cannot create an app-session cookie', async () => {
    const router = createMockRouter();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          sessionCreated: false,
          userId: 'user-1',
          valid: true,
        })
      )
    );

    await verifyRouteToken({
      router,
      searchParams: new URLSearchParams('nextUrl=%2Fpersonal'),
      token: 'token-1',
    });

    expect(router.push).toHaveBeenCalledWith('/');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('redirects when token verification returns no user id', async () => {
    const router = createMockRouter();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          valid: true,
        })
      )
    );

    await verifyRouteToken({
      router,
      searchParams: new URLSearchParams('nextUrl=%2Fpersonal'),
      token: 'token-1',
    });

    expect(router.push).toHaveBeenCalledWith('/');
    expect(router.refresh).toHaveBeenCalled();
  });
});
