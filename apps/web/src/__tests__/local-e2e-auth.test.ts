import { describe, expect, it } from 'vitest';
import {
  isLocalE2EAuthBypassEnabled,
  isLocalE2EAuthRequestAllowed,
} from '@/lib/auth/local-e2e';

const localE2EEnv = {
  BASE_URL: 'http://localhost:7803',
  NODE_ENV: 'test',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
  SUPABASE_SERVER_URL: 'http://host.docker.internal:8001',
  TUTURUUU_LOCAL_E2E_AUTH_BYPASS: 'true',
} as const satisfies NodeJS.ProcessEnv;

function createRequest(url: string, headers: Record<string, string> = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    headers: {
      get: (name: string) => normalizedHeaders.get(name.toLowerCase()) ?? null,
    },
    url,
  };
}

describe('isLocalE2EAuthBypassEnabled', () => {
  it('requires the explicit local E2E bypass flag', () => {
    expect(
      isLocalE2EAuthBypassEnabled({
        BASE_URL: 'http://localhost:7803',
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
      })
    ).toBe(false);
  });

  it('allows the bypass for the local Docker web and Supabase origins', () => {
    expect(isLocalE2EAuthBypassEnabled(localE2EEnv)).toBe(true);
  });

  it('allows Portless production starts with public E2E env fallbacks', () => {
    expect(
      isLocalE2EAuthBypassEnabled({
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
        NEXT_PUBLIC_TUTURUUU_LOCAL_E2E_AUTH_BYPASS: 'true',
        PORTLESS_URL: 'https://tuturuuu.localhost:1355',
      })
    ).toBe(true);
  });

  it('rejects the bypass when either origin is not local', () => {
    expect(
      isLocalE2EAuthBypassEnabled({
        BASE_URL: 'https://tuturuuu.com',
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
        TUTURUUU_LOCAL_E2E_AUTH_BYPASS: 'true',
      })
    ).toBe(false);

    expect(
      isLocalE2EAuthBypassEnabled({
        BASE_URL: 'http://localhost:7803',
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        TUTURUUU_LOCAL_E2E_AUTH_BYPASS: 'true',
      })
    ).toBe(false);
  });

  it('rejects the bypass when the server-side Supabase URL is not local', () => {
    expect(
      isLocalE2EAuthBypassEnabled({
        BASE_URL: 'http://localhost:7803',
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
        SUPABASE_SERVER_URL: 'https://prod-target.supabase.co',
        TUTURUUU_LOCAL_E2E_AUTH_BYPASS: 'true',
      })
    ).toBe(false);
  });
});

describe('isLocalE2EAuthRequestAllowed', () => {
  it('allows local E2E requests when request and configured origins are local', () => {
    expect(
      isLocalE2EAuthRequestAllowed(
        createRequest('http://localhost:7803/api/auth/dev-session', {
          host: 'localhost:7803',
          origin: 'http://localhost:7803',
        }),
        localE2EEnv
      )
    ).toBe(true);
  });

  it('allows production Docker requests when the public local origin is forwarded', () => {
    expect(
      isLocalE2EAuthRequestAllowed(
        createRequest('http://web-blue:7803/api/auth/dev-session', {
          host: 'web-blue:7803',
          'x-forwarded-host': 'localhost:7803',
          'x-forwarded-proto': 'http',
        }),
        localE2EEnv
      )
    ).toBe(true);
  });

  it('allows portless localhost request origins produced by standalone proxies', () => {
    expect(
      isLocalE2EAuthRequestAllowed(
        createRequest('http://localhost/api/auth/dev-session', {
          host: 'localhost',
          'x-forwarded-proto': 'http',
        }),
        localE2EEnv
      )
    ).toBe(true);
  });

  it('allows Portless production backends when the public URL is local', () => {
    expect(
      isLocalE2EAuthRequestAllowed(
        createRequest('http://127.0.0.1:4703/api/auth/dev-session', {
          host: '127.0.0.1:4703',
          origin: 'https://tuturuuu.localhost:1355',
        }),
        {
          ...localE2EEnv,
          BASE_URL: 'https://tuturuuu.localhost:1355',
          PORT: '4703',
          PORTLESS_URL: 'https://tuturuuu.localhost:1355',
          SUPABASE_SERVER_URL: 'http://127.0.0.1:8001',
        }
      )
    ).toBe(true);
  });

  it('allows Portless production backends with public E2E env fallbacks', () => {
    expect(
      isLocalE2EAuthRequestAllowed(
        createRequest('http://127.0.0.1:4703/api/auth/dev-session', {
          host: '127.0.0.1:4703',
          origin: 'https://tuturuuu.localhost',
        }),
        {
          NODE_ENV: 'test',
          NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
          NEXT_PUBLIC_TUTURUUU_LOCAL_E2E_AUTH_BYPASS: 'true',
          PORT: '4703',
          PORTLESS_URL: 'https://tuturuuu.localhost',
        }
      )
    ).toBe(true);
  });

  it('allows Portless production backends with forwarded https loopback origins', () => {
    expect(
      isLocalE2EAuthRequestAllowed(
        createRequest('https://127.0.0.1:4703/api/auth/dev-session', {
          host: '127.0.0.1:4703',
          origin: 'https://tuturuuu.localhost',
          'x-forwarded-proto': 'https',
        }),
        {
          NODE_ENV: 'test',
          NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
          NEXT_PUBLIC_TUTURUUU_LOCAL_E2E_AUTH_BYPASS: 'true',
          PORT: '4703',
          PORTLESS_URL: 'https://tuturuuu.localhost',
        }
      )
    ).toBe(true);
  });

  it('rejects Portless backend origins when the injected port does not match', () => {
    expect(
      isLocalE2EAuthRequestAllowed(
        createRequest('http://127.0.0.1:4704/api/auth/dev-session', {
          host: '127.0.0.1:4704',
          origin: 'https://tuturuuu.localhost',
        }),
        {
          ...localE2EEnv,
          BASE_URL: 'https://tuturuuu.localhost',
          PORT: '4703',
          PORTLESS_URL: 'https://tuturuuu.localhost',
          SUPABASE_SERVER_URL: 'http://127.0.0.1:8001',
        }
      )
    ).toBe(false);
  });

  it('rejects internal Docker origins without a public local forwarded origin', () => {
    expect(
      isLocalE2EAuthRequestAllowed(
        createRequest('http://web-blue:7803/api/auth/dev-session', {
          host: 'web-blue:7803',
        }),
        localE2EEnv
      )
    ).toBe(false);
  });

  it('rejects remote request origins even with local-looking E2E env values', () => {
    expect(
      isLocalE2EAuthRequestAllowed(
        createRequest('https://prod.example.com/api/auth/dev-session', {
          host: 'prod.example.com',
          origin: 'https://evil.example',
        }),
        localE2EEnv
      )
    ).toBe(false);
  });

  it('rejects requests with non-local host headers', () => {
    expect(
      isLocalE2EAuthRequestAllowed(
        createRequest('http://localhost:7803/api/auth/dev-session', {
          host: 'prod.example.com',
        }),
        localE2EEnv
      )
    ).toBe(false);

    expect(
      isLocalE2EAuthRequestAllowed(
        createRequest('http://localhost:7803/api/auth/dev-session', {
          host: 'localhost:7803',
          'x-forwarded-host': 'prod.example.com',
        }),
        localE2EEnv
      )
    ).toBe(false);

    expect(
      isLocalE2EAuthRequestAllowed(
        createRequest('http://web-blue:7803/api/auth/dev-session', {
          host: 'prod.example.com',
          'x-forwarded-host': 'localhost:7803',
        }),
        localE2EEnv
      )
    ).toBe(false);
  });
});
