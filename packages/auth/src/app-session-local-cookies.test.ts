import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSupabaseAuthCookies } from './app-session';

function clearCookies(host = 'localhost') {
  return (
    clearSupabaseAuthCookies(
      new NextRequest(`http://${host}:7809/api/v1/users/task-settings`, {
        headers: {
          cookie: 'sb-127-auth-token.0=web-session; sb-stale-auth-token=stale',
        },
      }),
      NextResponse.json({ ok: true })
    ).headers.get('set-cookie') ?? ''
  );
}

afterEach(() => vi.unstubAllEnvs());

describe('local satellite cookie cleanup', () => {
  it.each(['localhost', '127.0.0.1'])(
    'preserves the web cookie shared across ports on %s',
    (host) => {
      vi.stubEnv('TUTURUUU_LOCAL_E2E_AUTH_BYPASS', '1');
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:34001');
      const cookies = clearCookies(host);
      expect(cookies).not.toContain('sb-127-auth-token.0=;');
      expect(cookies).toContain('sb-stale-auth-token=;');
    }
  );

  it('still clears cookies when the local bypass is disabled', () => {
    vi.stubEnv('TUTURUUU_LOCAL_E2E_AUTH_BYPASS', '0');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:34001');
    expect(clearCookies()).toContain('sb-127-auth-token.0=;');
  });

  it('does not extend preservation to unrelated request hosts', () => {
    vi.stubEnv('TUTURUUU_LOCAL_E2E_AUTH_BYPASS', '1');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:34001');
    expect(clearCookies('example.com')).toContain('sb-127-auth-token.0=;');
  });

  it('does not enable local preservation with a cloud Supabase URL', () => {
    vi.stubEnv('TUTURUUU_LOCAL_E2E_AUTH_BYPASS', '1');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    expect(clearCookies()).toContain('sb-127-auth-token.0=;');
  });
});
