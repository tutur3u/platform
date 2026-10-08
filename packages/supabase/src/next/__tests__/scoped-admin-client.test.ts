import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '../server';

// Constructor products are structural sentinels, not SDK/Auth results.
const mocks = vi.hoisted(() => ({
  browser: vi.fn((_url: string, _key: string, _options?: unknown) => ({
    constructor: 'browser',
  })),
  server: vi.fn(
    (
      _url: string,
      _key: string,
      _options: {
        cookieOptions?: unknown;
        cookies: {
          getAll: () => unknown;
          setAll: (cookies: { name: string; value: string }[]) => void;
        };
      }
    ) => ({ constructor: 'server' })
  ),
  env: vi.fn(() => ({
    url: 'https://test.supabase.co',
    key: 'test-secret-key',
  })),
  cookies: vi.fn(() => ({ getAll: vi.fn(), set: vi.fn() })),
  headers: vi.fn(() => new Headers()),
  cookieOptions: vi.fn(() => ({ name: 'test-auth', path: '/' })),
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: mocks.browser,
  createServerClient: mocks.server,
}));
vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
  headers: mocks.headers,
}));
vi.mock('../common', () => ({
  checkEnvVariables: mocks.env,
  getSupabaseCookieOptions: mocks.cookieOptions,
  getSupabaseAuthCookieUrls: vi.fn(),
  getSupabaseAuthStorageKey: vi.fn(),
}));

const url = 'https://test.supabase.co';
const key = 'test-secret-key';
const actor = '12345678-1234-1234-1234-123456789abc';
const backgroundAuth = {
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false,
};

function expectNoAllocation() {
  expect(mocks.env).not.toHaveBeenCalled();
  expect(mocks.browser).not.toHaveBeenCalled();
  expect(mocks.server).not.toHaveBeenCalled();
  expect(mocks.cookies).not.toHaveBeenCalled();
  expect(mocks.headers).not.toHaveBeenCalled();
}

describe('scoped no-cookie admin construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.mockReset().mockReturnValue({ url, key });
  });

  it('constructs distinct clients with each exact fetch and no background Auth', () => {
    const firstFetch = vi.fn<typeof globalThis.fetch>();
    const secondFetch = vi.fn<typeof globalThis.fetch>();
    const first = createAdminClient({ noCookie: true, fetch: firstFetch });
    const second = createAdminClient({ noCookie: true, fetch: secondFetch });

    expect(first).toBe(mocks.browser.mock.results[0]?.value);
    expect(second).toBe(mocks.browser.mock.results[1]?.value);
    expect(first).not.toBe(second);
    expect(mocks.browser).toHaveBeenCalledTimes(2);
    expect(mocks.browser).toHaveBeenNthCalledWith(1, url, key, {
      isSingleton: false,
      global: { fetch: firstFetch },
      auth: backgroundAuth,
    });
    expect(mocks.browser).toHaveBeenNthCalledWith(2, url, key, {
      isSingleton: false,
      global: { fetch: secondFetch },
      auth: backgroundAuth,
    });
    expect(mocks.env).toHaveBeenNthCalledWith(1, { useSecretKey: true });
    expect(mocks.env).toHaveBeenNthCalledWith(2, { useSecretKey: true });
    expect(firstFetch).not.toHaveBeenCalled();
    expect(secondFetch).not.toHaveBeenCalled();
    expect(mocks.server).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.headers).not.toHaveBeenCalled();
  });

  it('merges the validated audit header alongside the exact fetch', () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const auditActorId = actor.toUpperCase();
    const client = createAdminClient({ noCookie: true, auditActorId, fetch });

    expect(client).toBe(mocks.browser.mock.results[0]?.value);
    expect(mocks.browser).toHaveBeenCalledExactlyOnceWith(url, key, {
      isSingleton: false,
      global: { headers: { 'x-ttr-audit-actor-id': auditActorId }, fetch },
      auth: backgroundAuth,
    });
    expect(mocks.env).toHaveBeenCalledExactlyOnceWith({ useSecretKey: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.server).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it.each(['', 'invalid', `${actor} `, `${actor}extra`])(
    'rejects invalid audit actor %j before environment or constructors',
    (auditActorId) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      expect(() =>
        createAdminClient({ noCookie: true, auditActorId, fetch })
      ).toThrow('Invalid audit actor id');
      expectNoAllocation();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    { fetch: vi.fn<typeof globalThis.fetch>() },
    { noCookie: false, fetch: vi.fn<typeof globalThis.fetch>() },
    { auditActorId: actor, fetch: vi.fn<typeof globalThis.fetch>() },
    {
      noCookie: false,
      auditActorId: actor,
      fetch: vi.fn<typeof globalThis.fetch>(),
    },
    { auditActorId: 'invalid', fetch: vi.fn<typeof globalThis.fetch>() },
  ])(
    'synchronously rejects unsupported fetch options before env/allocation',
    (options) => {
      mocks.env.mockImplementation(() => {
        throw new Error('environment must remain unread');
      });

      expect(() => createAdminClient(options)).toThrow(
        'Scoped admin fetch requires noCookie: true'
      );
      expectNoAllocation();
      expect(options.fetch).not.toHaveBeenCalled();
    }
  );
});

describe('unscoped admin controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.mockReset().mockReturnValue({ url, key });
  });

  it.each([{ noCookie: true }, { noCookie: true, fetch: undefined }])(
    'preserves the no-cookie constructor with no third argument for %j',
    (options) => {
      const client = createAdminClient(options);
      expect(client).toBe(mocks.browser.mock.results[0]?.value);
      expect(mocks.browser).toHaveBeenCalledExactlyOnceWith(url, key);
      expect(mocks.server).not.toHaveBeenCalled();
      expect(mocks.cookies).not.toHaveBeenCalled();
    }
  );

  it.each([{}, { noCookie: true }, { noCookie: false }])(
    'preserves audited construction without fetch for %j',
    (options) => {
      createAdminClient({ ...options, auditActorId: actor });
      expect(mocks.browser).toHaveBeenCalledExactlyOnceWith(url, key, {
        isSingleton: false,
        global: { headers: { 'x-ttr-audit-actor-id': actor } },
        auth: backgroundAuth,
      });
      expect(mocks.server).not.toHaveBeenCalled();
      expect(mocks.cookies).not.toHaveBeenCalled();
    }
  );

  it('preserves invalid audit denial without fetch', () => {
    expect(() => createAdminClient({ auditActorId: 'invalid' })).toThrow(
      'Invalid audit actor id'
    );
    expectNoAllocation();
  });

  it.each([undefined, {}, { noCookie: false }, { fetch: undefined }])(
    'preserves cookie-backed allocation and options for %j',
    async (options) => {
      const client = await createAdminClient(options);
      expect(client).toBe(mocks.server.mock.results[0]?.value);
      expect(mocks.env).toHaveBeenCalledExactlyOnceWith({ useSecretKey: true });
      expect(mocks.browser).not.toHaveBeenCalled();
      expect(mocks.cookies).toHaveBeenCalledTimes(1);
      expect(mocks.headers).toHaveBeenCalledTimes(1);
      expect(mocks.server).toHaveBeenCalledExactlyOnceWith(url, key, {
        cookieOptions: { name: 'test-auth', path: '/' },
        cookies: {
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        },
      });
      const cookieAdapter = mocks.server.mock.calls[0]?.[2]?.cookies;
      if (!cookieAdapter) {
        throw new Error('Expected the admin cookie adapter');
      }
      expect(cookieAdapter.getAll()).toEqual([]);
      expect(
        cookieAdapter.setAll([{ name: 'ignored', value: 'ignored' }])
      ).toBeUndefined();
      expect(mocks.cookies.mock.results[0]?.value.getAll).not.toHaveBeenCalled();
      expect(mocks.cookies.mock.results[0]?.value.set).not.toHaveBeenCalled();
    }
  );
});
