import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('browser state recovery route', () => {
  it('clears site data and Supabase auth cookies before redirecting back to login', async () => {
    const response = await GET(
      new NextRequest('http://localhost/~recover-browser-state', {
        headers: {
          cookie:
            'sb-resolved-kingfish-21146-auth-token.0=base64-bad; sb-resolved-kingfish-21146-auth-token.1=base64-bad; theme=dark',
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
});
