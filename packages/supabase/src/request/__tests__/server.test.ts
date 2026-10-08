import { readFileSync } from 'node:fs';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestClient } from '../server';

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock('../../next/common', () => ({
  checkEnvVariables: ({ useSecretKey }: { useSecretKey: boolean }) => ({
    key: useSecretKey ? 'test-secret-key' : 'test-publishable-key',
    url: 'https://test.supabase.co',
  }),
  getSupabaseAuthCookieUrls: vi.fn((url: string) => [url]),
  getSupabaseAuthStorageKey: (url: string) =>
    `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
  getSupabaseCookieOptions: (url: string, requestUrl?: string | URL | null) => {
    const requestUrlText = requestUrl?.toString() ?? '';

    return {
      ...(requestUrlText.includes('tuturuuu.localhost')
        ? { domain: '.tuturuuu.localhost', secure: false }
        : {}),
      name: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
      path: '/',
      sameSite: 'lax',
    };
  },
}));

function encodeSupabaseSession(payload = { access_token: 'jwt' }) {
  return `base64-${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

describe('framework-neutral Supabase request client', () => {
  const mockUserSchemaFrom = vi.fn((schema: string, table: string) => ({
    client: 'user',
    schema,
    table,
  }));
  const mockAdminSchemaFrom = vi.fn((schema: string, table: string) => ({
    client: 'admin',
    schema,
    table,
  }));
  const mockUserClient = {
    from: vi.fn((table: string) => ({ client: 'user', table })),
    schema: vi.fn((schema: string) => ({
      from: (table: string) => mockUserSchemaFrom(schema, table),
    })),
  };
  const mockAdminClient = {
    from: vi.fn((table: string) => ({ client: 'admin', table })),
    schema: vi.fn((schema: string) => ({
      from: (table: string) => mockAdminSchemaFrom(schema, table),
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createBrowserClient as any).mockImplementation(
      (_url: string, key: string) =>
        key === 'test-secret-key' ? mockAdminClient : { ...mockUserClient }
    );
    (createServerClient as any).mockImplementation(
      (_url: string, key: string) =>
        key === 'test-secret-key' ? mockAdminClient : { ...mockUserClient }
    );
  });

  it('creates a bearer-token request client without Next runtime imports', async () => {
    const client = await createRequestClient({
      headers: new Headers({ authorization: 'Bearer user-jwt' }),
    });

    expect(createServerClient).not.toHaveBeenCalled();
    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-publishable-key',
      expect.objectContaining({
        global: {
          headers: {
            Authorization: 'Bearer user-jwt',
          },
        },
      })
    );
    expect(client.schema('private').from('inventory_units')).toEqual({
      client: 'admin',
      schema: 'private',
      table: 'inventory_units',
    });
  });

  it('isolates Tuturuuu app-session auth from Supabase bearer auth', async () => {
    await createRequestClient({
      headers: new Headers({
        authorization: 'Bearer ttr_app_header.payload.signature',
      }),
    });

    expect(createServerClient).not.toHaveBeenCalled();
    expect(createBrowserClient).not.toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-publishable-key',
      expect.objectContaining({
        global: {
          headers: {
            Authorization: 'Bearer ttr_app_header.payload.signature',
          },
        },
      })
    );
    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-publishable-key',
      expect.objectContaining({
        global: {
          headers: {
            Authorization: 'Bearer test-publishable-key',
          },
        },
      })
    );
  });

  it('creates a cookie-backed request client from standard request headers', async () => {
    const validSession = encodeSupabaseSession();

    await createRequestClient({
      headers: new Headers({
        cookie: `theme=dark; sb-test-auth-token=${validSession}`,
        host: 'tanstack.tuturuuu.localhost',
        'x-forwarded-proto': 'http',
      }),
      url: 'http://localhost:7824',
    });

    expect(createServerClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-publishable-key',
      expect.objectContaining({
        cookieOptions: expect.objectContaining({
          domain: '.tuturuuu.localhost',
          secure: false,
        }),
        cookies: expect.any(Object),
      })
    );

    const cookieHandler = (createServerClient as any).mock.calls[0][2].cookies;
    expect(cookieHandler.getAll()).toEqual([
      { name: 'theme', value: 'dark' },
      { name: 'sb-test-auth-token', value: validSession },
    ]);
  });

  it('keeps the request subpath free of static Next imports', () => {
    const source = readFileSync(
      new URL('../server.ts', import.meta.url),
      'utf8'
    );
    const packageJson = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
    );

    expect(source).not.toContain('next/headers');
    expect(source).not.toContain('next/server');
    expect(packageJson.exports['./request/server']).toEqual({
      bun: './src/request/server.ts',
      default: './dist/request/server.js',
      types: './dist/request/server.d.ts',
    });
  });

  it.each([
    ['bearer', { authorization: 'Bearer user-jwt' }, 'Bearer user-jwt'],
    ['app bearer', { authorization: 'Bearer ttr_app_private-sentinel' }, 'Bearer test-publishable-key'],
    ['app cookie', { cookie: 'tuturuuu_app_session=private-sentinel' }, 'Bearer test-publishable-key'],
  ] as const)('scopes only the selected %s client', async (_name, headers, authorization) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = await createRequestClient(
      { headers: new Headers(headers) },
      { fetch }
    );
    expect(createServerClient).not.toHaveBeenCalled();
    expect(createBrowserClient).toHaveBeenNthCalledWith(1,
      'https://test.supabase.co', 'test-publishable-key', {
        isSingleton: false,
        global: { fetch, headers: { Authorization: authorization } },
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      }
    );
    expect(createBrowserClient).toHaveBeenNthCalledWith(2,
      'https://test.supabase.co', 'test-secret-key', {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      }
    );
    expect(client.from('workspaces')).toEqual({ client: 'user', table: 'workspaces' });
    expect(client.schema('private').from('inventory_units')).toEqual({
      client: 'admin', schema: 'private', table: 'inventory_units',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes scoped fetch to SSR while preserving sanitization and no-op writes', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const headers = new Headers({
      cookie: 'theme=dark; sb-test-auth-token=malformed',
      'x-forwarded-host': 'tanstack.tuturuuu.localhost, ignored.example',
      'x-forwarded-proto': 'http, https',
      host: 'ignored.example',
    });
    const request = { headers, url: 'https://ignored.example' };
    await createRequestClient(request, { fetch });
    const options = vi.mocked(createServerClient).mock.calls[0]?.[2];
    expect(options?.global).toEqual({ fetch });
    expect(options?.auth).toBeUndefined();
    // SSR owns its forced persistSession:true; do not promise false here.
    expect(options?.cookieOptions).toEqual({
      domain: '.tuturuuu.localhost', secure: false,
      name: 'sb-test-auth-token', path: '/', sameSite: 'lax',
    });
    const cookies = options?.cookies;
    if (!cookies || !('getAll' in cookies) || !cookies.getAll || !cookies.setAll) {
      throw new Error('Expected SSR getAll/setAll cookie adapter');
    }
    expect(cookies.getAll()).toEqual([{ name: 'theme', value: 'dark' }]);
    cookies.setAll([{ name: 'sb-test-auth-token', value: 'replacement', options: {} }], {});
    expect(headers.get('cookie')).toBe('theme=dark; sb-test-auth-token=malformed');
    expect(cookies.getAll()).toEqual([{ name: 'theme', value: 'dark' }]);
    expect(vi.mocked(createBrowserClient).mock.calls[0]?.[2]?.global).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains unscoped constructor options exactly when fetch options are omitted', async () => {
    await createRequestClient({ headers: new Headers({ authorization: 'Bearer control-jwt' }) });
    expect(vi.mocked(createBrowserClient).mock.calls[0]?.[2]).toEqual({
      global: { headers: { Authorization: 'Bearer control-jwt' } },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    vi.clearAllMocks();
    await createRequestClient({ headers: new Headers() });
    const options = vi.mocked(createServerClient).mock.calls[0]?.[2];
    expect(options?.global).toBeUndefined();
    expect(options?.auth).toBeUndefined();
  });

  it('keeps two concurrent scoped clients and their fetch identities independent', async () => {
    const firstFetch = vi.fn<typeof globalThis.fetch>();
    const secondFetch = vi.fn<typeof globalThis.fetch>();
    // Each selected constructor returns a distinct structural mock client.
    const [first, second] = await Promise.all([
      createRequestClient({ headers: new Headers({ authorization: 'Bearer first-jwt' }) }, { fetch: firstFetch }),
      createRequestClient({ headers: new Headers({ authorization: 'Bearer second-jwt' }) }, { fetch: secondFetch }),
    ]);
    expect(first).not.toBe(second);
    expect(vi.mocked(createBrowserClient).mock.results[0]?.value).not.toBe(
      vi.mocked(createBrowserClient).mock.results[2]?.value
    );
    const selected = vi.mocked(createBrowserClient).mock.calls.filter((call) => call[1] === 'test-publishable-key');
    expect(selected.map((call) => call[2]?.global?.fetch)).toEqual([firstFetch, secondFetch]);
    expect(selected.map((call) => call[2]?.isSingleton)).toEqual([false, false]);
    const admins = vi.mocked(createBrowserClient).mock.calls.filter((call) => call[1] === 'test-secret-key');
    expect(admins.every((call) => call[2]?.global === undefined)).toBe(true);
    expect(mockUserClient).not.toHaveProperty('global');
    expect(mockAdminClient).not.toHaveProperty('global');
  });

  it('preserves a valid scoped cookie session and fallback request URL', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const validSession = encodeSupabaseSession();
    await createRequestClient({
      headers: new Headers({ cookie: `sb-test-auth-token=${validSession}` }),
      url: 'http://tanstack.tuturuuu.localhost',
    }, { fetch });
    const options = vi.mocked(createServerClient).mock.calls[0]?.[2];
    expect(options?.global?.fetch).toBe(fetch);
    expect(options?.cookieOptions?.domain).toBe('.tuturuuu.localhost');
    const cookies = options?.cookies;
    if (!cookies || !('getAll' in cookies) || !cookies.getAll) {
      throw new Error('Expected SSR getAll cookie adapter');
    }
    expect(cookies.getAll()).toEqual([{ name: 'sb-test-auth-token', value: validSession }]);
  });
});
