import { Buffer } from 'node:buffer';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkIfUserExists: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  devMode: true,
  resetRateLimitMemoryStoreForTests: vi.fn(),
  validateEmail: vi.fn(),
}));

vi.mock('@/constants/common', () => ({
  get DEV_MODE() {
    return mocks.devMode;
  },
}));

vi.mock('@tuturuuu/utils/email/server', () => ({
  checkIfUserExists: (...args: Parameters<typeof mocks.checkIfUserExists>) =>
    mocks.checkIfUserExists(...args),
  validateEmail: (...args: Parameters<typeof mocks.validateEmail>) =>
    mocks.validateEmail(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  resetRateLimitMemoryStoreForTests: (
    ...args: Parameters<typeof mocks.resetRateLimitMemoryStoreForTests>
  ) => mocks.resetRateLimitMemoryStoreForTests(...args),
}));

function mockSuccessfulSession(
  session: Record<string, unknown> = {
    access_token: 'token',
  }
) {
  const createUser = vi.fn().mockResolvedValue({
    data: {
      user: {
        id: 'new-user-123',
      },
    },
    error: null,
  });
  const updateUserById = vi.fn().mockResolvedValue({ error: null });
  const generateLink = vi.fn().mockResolvedValue({
    data: {
      properties: {
        hashed_token: 'hashed-token',
      },
    },
    error: null,
  });
  const verifyOtp = vi.fn().mockResolvedValue({
    data: {
      session,
    },
    error: null,
  });
  const onboardingBuilder = {
    single: vi.fn().mockResolvedValue({
      data: {
        user_id: 'user-123',
      },
      error: null,
    }),
    select: vi.fn(),
    upsert: vi.fn(),
  };
  onboardingBuilder.select.mockReturnValue(onboardingBuilder);
  onboardingBuilder.upsert.mockReturnValue(onboardingBuilder);
  const from = vi.fn((table: string) => {
    if (table !== 'onboarding_progress') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return onboardingBuilder;
  });

  mocks.createAdminClient.mockResolvedValue({
    auth: {
      admin: {
        createUser,
        generateLink,
        updateUserById,
      },
    },
    from,
  });
  mocks.createClient.mockResolvedValue({
    auth: {
      verifyOtp,
    },
  });

  return {
    createUser,
    from,
    generateLink,
    onboardingBuilder,
    updateUserById,
    verifyOtp,
  };
}

function stubLocalE2EEnv(overrides: Record<string, string> = {}) {
  const values = {
    BASE_URL: 'http://localhost:7803',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
    SUPABASE_SERVER_URL: 'http://host.docker.internal:8001',
    TUTURUUU_LOCAL_E2E_AUTH_BYPASS: 'true',
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value);
  }
}

function decodeSupabaseSessionCookieValue(value: string) {
  expect(value).toMatch(/^base64-/u);
  return JSON.parse(
    Buffer.from(value.slice('base64-'.length), 'base64url').toString('utf8')
  );
}

describe('dev-session route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.devMode = true;
    mocks.validateEmail.mockImplementation(async (email: string) => email);
    mocks.checkIfUserExists.mockResolvedValue('user-123');
  });

  it('generates and verifies a magic link through the request-bound client', async () => {
    const { from, generateLink, updateUserById, verifyOtp } =
      mockSuccessfulSession();

    const request = new NextRequest('http://localhost/api/auth/dev-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'local@tuturuuu.com',
        locale: 'en',
      }),
    });

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(mocks.createClient).toHaveBeenCalledWith(request);
    expect(updateUserById).toHaveBeenCalledWith('user-123', {
      user_metadata: {
        locale: 'en',
        origin: 'TUTURUUU',
      },
    });
    expect(generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'local@tuturuuu.com',
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: 'hashed-token',
      type: 'magiclink',
    });
    expect(from).not.toHaveBeenCalled();
    expect(mocks.resetRateLimitMemoryStoreForTests).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('can complete onboarding for local E2E session users', async () => {
    const { onboardingBuilder } = mockSuccessfulSession();

    const request = new NextRequest('http://localhost/api/auth/dev-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        completeOnboarding: true,
        email: 'local@tuturuuu.com',
        locale: 'en',
      }),
    });

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(onboardingBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        completed_steps: ['welcome', 'use_case', 'profile', 'celebration'],
        current_step: 'celebration',
        flow_type: 'team',
        invited_emails: [],
        notifications_enabled: true,
        profile_completed: true,
        tour_completed: false,
        use_case: 'small_team',
        user_id: 'user-123',
      }),
      { onConflict: 'user_id' }
    );
    const [onboardingPayload] = onboardingBuilder.upsert.mock.calls[0] ?? [];
    expect(onboardingPayload).toEqual(
      expect.objectContaining({
        completed_at: expect.any(String),
      })
    );
    expect(onboardingBuilder.select).toHaveBeenCalledWith('user_id');
    expect(onboardingBuilder.single).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('uses the created user id when completing onboarding for new local E2E users', async () => {
    mocks.checkIfUserExists.mockResolvedValue(null);
    const { createUser, onboardingBuilder } = mockSuccessfulSession();

    const request = new NextRequest('http://localhost/api/auth/dev-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        completeOnboarding: true,
        email: 'guest@tuturuuu.com',
        locale: 'en',
      }),
    });

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(createUser).toHaveBeenCalledWith({
      email: 'guest@tuturuuu.com',
      email_confirm: true,
      user_metadata: {
        locale: 'en',
        origin: 'TUTURUUU',
      },
    });
    expect(onboardingBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'new-user-123',
      }),
      { onConflict: 'user_id' }
    );
    expect(response.status).toBe(200);
  });

  it('can reset the app memory rate-limit store for local E2E setup', async () => {
    mockSuccessfulSession();

    const request = new NextRequest('http://localhost/api/auth/dev-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'local@tuturuuu.com',
        locale: 'en',
        resetRateLimits: true,
      }),
    });

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(mocks.resetRateLimitMemoryStoreForTests).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });

  it('allows production-mode local E2E requests only when request and env origins are local', async () => {
    mocks.devMode = false;
    stubLocalE2EEnv();
    mockSuccessfulSession();

    const request = new NextRequest(
      'http://localhost:7803/api/auth/dev-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:7803',
          origin: 'http://localhost:7803',
        },
        body: JSON.stringify({
          email: 'local@tuturuuu.com',
          locale: 'en',
        }),
      }
    );

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(request);
  });

  it('allows production-mode Docker E2E requests with a forwarded local host', async () => {
    mocks.devMode = false;
    stubLocalE2EEnv();
    mockSuccessfulSession();

    const request = new NextRequest(
      'http://web-blue:7803/api/auth/dev-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'web-blue:7803',
          'x-forwarded-host': 'localhost:7803',
          'x-forwarded-proto': 'http',
        },
        body: JSON.stringify({
          email: 'local@tuturuuu.com',
          locale: 'en',
        }),
      }
    );

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(request);
  });

  it('allows production-mode Portless E2E requests after local TLS termination', async () => {
    mocks.devMode = false;
    stubLocalE2EEnv({
      BASE_URL: 'https://tuturuuu.localhost:1355',
      PORTLESS_URL: 'https://tuturuuu.localhost:1355',
      SUPABASE_SERVER_URL: 'http://127.0.0.1:8001',
    });
    mockSuccessfulSession();

    const request = new NextRequest(
      'http://web-blue:7803/api/auth/dev-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'tuturuuu.localhost',
          'x-forwarded-host': 'tuturuuu.localhost',
          'x-forwarded-proto': 'http',
        },
        body: JSON.stringify({
          email: 'local@tuturuuu.com',
          locale: 'en',
        }),
      }
    );

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(request);
  });

  it('allows production-mode CI Portless browser requests with the public proxy port', async () => {
    mocks.devMode = false;
    stubLocalE2EEnv({
      BASE_URL: 'https://tuturuuu.localhost:1355',
      PORTLESS_URL: 'https://tuturuuu.localhost:1355',
      SUPABASE_SERVER_URL: 'http://127.0.0.1:8001',
    });
    mockSuccessfulSession();

    const request = new NextRequest(
      'https://tuturuuu.localhost:1355/api/auth/dev-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'tuturuuu.localhost:1355',
          origin: 'https://tuturuuu.localhost:1355',
          referer: 'https://tuturuuu.localhost:1355/login',
        },
        body: JSON.stringify({
          email: 'local@tuturuuu.com',
          locale: 'en',
        }),
      }
    );

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(request);
  });

  it('allows production-mode Docker web service hosts without explicit ports behind Portless', async () => {
    mocks.devMode = false;
    stubLocalE2EEnv({
      BASE_URL: 'https://tuturuuu.localhost:1355',
      PORTLESS_URL: 'https://tuturuuu.localhost:1355',
      SUPABASE_SERVER_URL: 'http://127.0.0.1:8001',
    });
    mockSuccessfulSession();

    const request = new NextRequest('http://web-blue/api/auth/dev-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: 'web-blue',
        origin: 'https://tuturuuu.localhost:1355',
        referer: 'https://tuturuuu.localhost:1355/login',
        'x-forwarded-host': 'tuturuuu.localhost:1355',
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify({
        email: 'local@tuturuuu.com',
        locale: 'en',
      }),
    });

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(request);
  });

  it('allows production-mode Portless E2E requests on the injected backend port', async () => {
    mocks.devMode = false;
    stubLocalE2EEnv({
      BASE_URL: 'https://tuturuuu.localhost:1355',
      PORT: '4703',
      PORTLESS_URL: 'https://tuturuuu.localhost:1355',
      SUPABASE_SERVER_URL: 'http://127.0.0.1:8001',
    });
    mockSuccessfulSession();

    const request = new NextRequest(
      'http://127.0.0.1:4703/api/auth/dev-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: '127.0.0.1:4703',
          origin: 'https://tuturuuu.localhost:1355',
        },
        body: JSON.stringify({
          email: 'local@tuturuuu.com',
          locale: 'en',
        }),
      }
    );

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(request);
  });

  it('allows production-mode Portless E2E requests with public runtime fallbacks', async () => {
    mocks.devMode = false;
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_LOCAL_E2E_AUTH_BYPASS', 'true');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:8001');
    vi.stubEnv('PORT', '4703');
    vi.stubEnv('PORTLESS_URL', 'https://tuturuuu.localhost:1355');
    mockSuccessfulSession();

    const request = new NextRequest(
      'http://127.0.0.1:4703/api/auth/dev-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: '127.0.0.1:4703',
          origin: 'https://tuturuuu.localhost:1355',
        },
        body: JSON.stringify({
          email: 'local@tuturuuu.com',
          locale: 'en',
        }),
      }
    );

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(request);
  });

  it('allows production-mode Portless E2E requests with forwarded https loopback origins', async () => {
    mocks.devMode = false;
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_LOCAL_E2E_AUTH_BYPASS', 'true');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:8001');
    vi.stubEnv('PORT', '4703');
    vi.stubEnv('PORTLESS_URL', 'https://tuturuuu.localhost');
    mockSuccessfulSession();

    const request = new NextRequest(
      'https://127.0.0.1:4703/api/auth/dev-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: '127.0.0.1:4703',
          origin: 'https://tuturuuu.localhost',
          'x-forwarded-proto': 'https',
        },
        body: JSON.stringify({
          email: 'local@tuturuuu.com',
          locale: 'en',
        }),
      }
    );

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith(request);
  });

  it('mirrors Docker E2E sessions to the public Supabase browser cookie key', async () => {
    mocks.devMode = false;
    stubLocalE2EEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://nzamlzqfdwaaxdefwraj.supabase.co',
    });
    const session = {
      access_token: 'access-token',
      expires_at: 1_763_456_789,
      refresh_token: 'refresh-token',
    };
    mockSuccessfulSession(session);

    const request = new NextRequest(
      'http://web-blue:7803/api/auth/dev-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'web-blue:7803',
          'x-forwarded-host': 'localhost:7803',
          'x-forwarded-proto': 'http',
        },
        body: JSON.stringify({
          email: 'local@tuturuuu.com',
          locale: 'en',
        }),
      }
    );

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(response.status).toBe(200);
    const publicCookie = response.cookies.get('sb-127-auth-token');
    expect(publicCookie?.value).toBeDefined();
    expect(decodeSupabaseSessionCookieValue(publicCookie!.value)).toEqual(
      session
    );

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('sb-127-auth-token=base64-');
    expect(setCookie).toContain('Max-Age=34560000');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('SameSite=lax');
    expect(setCookie).not.toContain('HttpOnly');
    expect(setCookie).not.toContain('Secure');
  });

  it('mirrors Portless E2E sessions to the shared Tuturuuu localhost cookie domain', async () => {
    mocks.devMode = false;
    stubLocalE2EEnv({
      BASE_URL: 'https://tuturuuu.localhost',
      PORT: '4703',
      PORTLESS_URL: 'https://tuturuuu.localhost',
      SUPABASE_SERVER_URL: 'http://localhost:8001',
    });
    const session = {
      access_token: 'access-token',
      expires_at: 1_763_456_789,
      refresh_token: 'refresh-token',
    };
    mockSuccessfulSession(session);

    const request = new NextRequest(
      'http://127.0.0.1:4703/api/auth/dev-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: '127.0.0.1:4703',
          origin: 'https://tuturuuu.localhost',
        },
        body: JSON.stringify({
          email: 'local@tuturuuu.com',
          locale: 'en',
        }),
      }
    );

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(response.status).toBe(200);
    const publicCookie = response.cookies.get('sb-127-auth-token');
    expect(publicCookie?.value).toBeDefined();
    expect(decodeSupabaseSessionCookieValue(publicCookie!.value)).toEqual(
      session
    );

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('sb-127-auth-token=base64-');
    expect(setCookie).toContain('Domain=.tuturuuu.localhost');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('SameSite=lax');
    expect(setCookie).not.toContain('HttpOnly');
    expect(setCookie).not.toContain('Secure');
  });

  it('does not mirror local E2E sessions when server and public Supabase cookie keys match', async () => {
    mocks.devMode = false;
    stubLocalE2EEnv({
      SUPABASE_SERVER_URL: 'http://127.0.0.1:8001',
    });
    mockSuccessfulSession();

    const request = new NextRequest(
      'http://localhost:7803/api/auth/dev-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:7803',
          origin: 'http://localhost:7803',
        },
        body: JSON.stringify({
          email: 'local@tuturuuu.com',
          locale: 'en',
        }),
      }
    );

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.cookies.get('sb-127-auth-token')).toBeUndefined();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('rejects production remote requests before admin user mutation even when E2E env values look local', async () => {
    mocks.devMode = false;
    stubLocalE2EEnv();

    const request = new NextRequest(
      'https://prod.example.com/api/auth/dev-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'prod.example.com',
          origin: 'https://evil.example',
        },
        body: JSON.stringify({
          email: 'victim@example.com',
          locale: 'en',
        }),
      }
    );

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'This endpoint is only available in development mode',
    });
    expect(mocks.validateEmail).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('rejects production local-looking requests when server-side Supabase targets a non-local project', async () => {
    mocks.devMode = false;
    stubLocalE2EEnv({
      SUPABASE_SERVER_URL: 'https://prod-target.supabase.co',
    });

    const request = new NextRequest(
      'http://localhost:7803/api/auth/dev-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:7803',
          origin: 'http://localhost:7803',
        },
        body: JSON.stringify({
          email: 'victim@example.com',
          locale: 'en',
        }),
      }
    );

    const { POST } = await import('@/app/api/auth/dev-session/route');
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mocks.validateEmail).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
