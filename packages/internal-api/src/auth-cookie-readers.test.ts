import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());
it.each(['', 'staging-'])(
  'preserves matching project cookies alongside app auth in namespace %s',
  async (prefix) => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', prefix);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.resetModules();
    const { withForwardedInternalApiAuth, createInternalApiClient } =
      await import('./client');
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const options = withForwardedInternalApiAuth(
      new Headers({
        cookie: `${prefix}tuturuuu_app_session=app; ${prefix}sb-project-auth-token.0=keep; ${prefix}sb-other-auth-token=drop`,
      }),
      { baseUrl: 'https://calendar.tuturuuu.com', fetch: fetcher }
    );
    await createInternalApiClient(options).fetch('/api/test');
    const init = fetcher.mock.calls[0]![1];
    const cookie = new Headers(init.headers).get('cookie');
    expect(cookie).toContain(`${prefix}sb-project-auth-token.0=keep`);
    expect(cookie).not.toContain(`${prefix}sb-other-auth-token=drop`);
  }
);
