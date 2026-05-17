import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkIfUserExists: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  resetRateLimitMemoryStoreForTests: vi.fn(),
  validateEmail: vi.fn(),
}));

vi.mock('@/constants/common', () => ({
  DEV_MODE: true,
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

describe('dev-session route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateEmail.mockImplementation(async (email: string) => email);
    mocks.checkIfUserExists.mockResolvedValue('user-123');
  });

  it('generates and verifies a magic link through the request-bound client', async () => {
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
});
