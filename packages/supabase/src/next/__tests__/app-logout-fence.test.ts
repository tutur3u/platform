import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({
    from: vi.fn(),
    schema: vi.fn(),
    auth: {},
  })),
  createServerClient: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [{ name: '__Host-tuturuuu_app_signed_out', value: '1' }],
    set: vi.fn(),
  }),
  headers: async () =>
    new Headers({
      cookie: '__Host-tuturuuu_app_signed_out=1; sb-fixture-auth-token=fixture',
    }),
}));
vi.mock('../common', () => ({
  checkEnvVariables: () => ({
    url: 'https://fixture.supabase.co',
    key: 'fixture-publishable',
  }),
  getSupabaseCookieOptions: () => ({}),
  getSupabaseAuthCookieUrls: () => [],
}));
vi.mock('#secret-env', () => ({
  checkSecretEnvVariables: () => ({
    url: 'https://fixture.supabase.co',
    key: 'fixture-server-only',
  }),
}));
import { createClient, createDynamicClient } from '../server';
import { createRequestClient } from '../../request/server';
beforeEach(() => vi.clearAllMocks());
it.each([createClient, createDynamicClient, createRequestClient])(
  'isolates a fenced request from shared cookies and provider bearer auth',
  async (create) => {
    await create(
      new Request('https://tasks.tuturuuu.com/api/public', {
        headers: {
          cookie:
            '__Host-tuturuuu_app_signed_out=1; sb-fixture-auth-token=fixture',
          authorization: 'Bearer fixture-provider-token',
        },
      })
    );
    expect(createServerClient).not.toHaveBeenCalled();
    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://fixture.supabase.co',
      'fixture-publishable',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer fixture-publishable' } },
      })
    );
  }
);
it('isolates ambient server components when the app marker is present', async () => {
  await createClient();
  expect(createServerClient).not.toHaveBeenCalled();
  expect(createBrowserClient).toHaveBeenCalledWith(
    'https://fixture.supabase.co',
    'fixture-publishable',
    expect.objectContaining({
      global: { headers: { Authorization: 'Bearer fixture-publishable' } },
    })
  );
});
