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
        key === 'test-secret-key' ? mockAdminClient : mockUserClient
    );
    (createServerClient as any).mockImplementation(
      (_url: string, key: string) =>
        key === 'test-secret-key' ? mockAdminClient : mockUserClient
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
});
