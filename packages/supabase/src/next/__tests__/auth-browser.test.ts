import { createBrowserClient } from '@supabase/ssr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthClient } from '../auth-browser';
import { __resetBrowserClientCacheForTests } from '../browser-base';

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(),
}));

vi.mock('../common', () => ({
  checkEnvVariables: () => ({
    key: 'test-key',
    url: 'https://test.supabase.co',
  }),
  getSupabaseCookieOptions: (url: string) => ({
    name: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
    path: '/',
    sameSite: 'lax',
  }),
}));

describe('auth browser client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetBrowserClientCacheForTests();
    (createBrowserClient as any).mockReturnValue({
      auth: {},
    });
  });

  it('enables Supabase experimental passkey APIs', () => {
    createAuthClient();

    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
      {
        auth: {
          experimental: {
            passkey: true,
          },
        },
        cookieOptions: {
          name: 'sb-test-auth-token',
          path: '/',
          sameSite: 'lax',
        },
      }
    );
  });

  it('can create a runtime-configured auth browser client for local E2E', () => {
    createAuthClient({
      supabasePublishableKey: 'local-publishable-key',
      supabaseUrl: 'http://127.0.0.1:8001',
    });

    expect(createBrowserClient).toHaveBeenCalledWith(
      'http://127.0.0.1:8001',
      'local-publishable-key',
      {
        auth: {
          experimental: {
            passkey: true,
          },
        },
        cookieOptions: {
          name: 'sb-127-auth-token',
          path: '/',
          sameSite: 'lax',
        },
      }
    );
  });

  it('caches browser clients by runtime Supabase URL and key', () => {
    createAuthClient();
    createAuthClient();
    createAuthClient({
      supabasePublishableKey: 'local-publishable-key',
      supabaseUrl: 'http://127.0.0.1:8001',
    });

    expect(createBrowserClient).toHaveBeenCalledTimes(2);
  });
});
