import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

describe('browser state recovery route', () => {
  it('serves a no-store confirmation page without clearing browser state on GET', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Clear-Site-Data')).toBeNull();
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token.0')
    ).toBeUndefined();
  });

  it('clears site data and Supabase auth cookies after same-origin confirmation', async () => {
    const response = await POST(
      new NextRequest('http://localhost/~recover-browser-state', {
        headers: {
          cookie:
            'sb-resolved-kingfish-21146-auth-token.0=base64-bad; sb-resolved-kingfish-21146-auth-token.1=base64-bad; theme=dark',
          origin: 'http://localhost',
        },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/login?browserStateReset=1'
    );
    expect(response.headers.get('Clear-Site-Data')).toBe(
      '"cache", "cookies", "storage", "executionContexts"'
    );
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token.0')?.value
    ).toBe('');
    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token.1')?.value
    ).toBe('');
    expect(response.cookies.get('theme')).toBeUndefined();
  });

  it('rejects cross-origin reset attempts without clearing cookies', async () => {
    const response = await POST(
      new NextRequest('http://localhost/~recover-browser-state', {
        headers: {
          cookie: 'sb-resolved-kingfish-21146-auth-token.0=base64-bad',
          origin: 'https://attacker.example',
        },
      })
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('Clear-Site-Data')).toBeNull();
    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token.0')
    ).toBeUndefined();
  });
});

it('staging recovery preserves production cookie sentinels and avoids site-wide cookie deletion', async () => {
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', '__Host-staging-');
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'host-only');
  vi.resetModules();
  try {
    const { POST: stagingPost } = await import('./route');
    const response = await stagingPost(
      new NextRequest('https://staging.tuturuuu.com/~recover-browser-state', {
        headers: {
          origin: 'https://staging.tuturuuu.com',
          cookie:
            'tuturuuu_app_session=production-sentinel; sb-prod-auth-token=production-sentinel; __Host-staging-tuturuuu_app_session=stage; __Host-staging-sb-stage-auth-token.0=stage',
        },
      })
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('Clear-Site-Data')).toBe(
      '"cache", "storage", "executionContexts"'
    );
    expect(response.cookies.getAll().map(({ name }) => name)).toEqual([
      '__Host-staging-tuturuuu_app_session',
      '__Host-staging-sb-stage-auth-token.0',
    ]);
    expect(response.cookies.get('tuturuuu_app_session')).toBeUndefined();
    expect(response.cookies.get('sb-prod-auth-token')).toBeUndefined();
    expect(response.headers.getSetCookie().join('\n')).not.toContain(
      'Domain=.tuturuuu.com'
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
