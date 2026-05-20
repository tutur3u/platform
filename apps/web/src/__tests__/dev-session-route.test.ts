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

function mockSuccessfulSession() {
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
      session: {
        access_token: 'token',
      },
    },
    error: null,
  });

  mocks.createAdminClient.mockResolvedValue({
    auth: {
      admin: {
        createUser: vi.fn(),
        generateLink,
        updateUserById,
      },
    },
  });
  mocks.createClient.mockResolvedValue({
    auth: {
      verifyOtp,
    },
  });

  return { generateLink, updateUserById, verifyOtp };
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
    const { generateLink, updateUserById, verifyOtp } = mockSuccessfulSession();

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
    expect(mocks.resetRateLimitMemoryStoreForTests).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
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
    expect(mocks.validateEmail).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
