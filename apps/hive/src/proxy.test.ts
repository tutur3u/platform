import { clearSupabaseAuthCookies } from '@tuturuuu/auth/app-session';
import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';

describe('Hive proxy auth cookie cleanup', () => {
  it('clears stale Supabase auth cookies without touching unrelated cookies', () => {
    const request = new NextRequest('https://hive.tuturuuu.com/dashboard', {
      headers: {
        cookie:
          'tuturuuu_app_session=ttr_app_123; sb-resolved-kingfish-21146-auth-token=stale; sb-resolved-kingfish-21146-auth-token.0=chunk; theme=dark',
      },
    });
    const response = clearSupabaseAuthCookies(request, NextResponse.next());

    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token')?.value
    ).toBe('');
    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token.0')?.value
    ).toBe('');
    expect(response.cookies.get('tuturuuu_app_session')).toBeUndefined();
    expect(response.cookies.get('theme')).toBeUndefined();
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
