import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  authorizeInternalAccountRequest: vi.fn(),
  resetAccountPasswordByEmail: vi.fn(),
}));

vi.mock('@/lib/internal-accounts/authorization', () => ({
  authorizeInternalAccountRequest: mocks.authorizeInternalAccountRequest,
}));

vi.mock('@/lib/internal-accounts/service', () => ({
  InternalAccountAdminError: class InternalAccountAdminError extends Error {
    constructor(
      message: string,
      readonly status: number
    ) {
      super(message);
    }
  },
  listInternalAccountUsers: vi.fn(),
  resetAccountPasswordByEmail: mocks.resetAccountPasswordByEmail,
}));

function request(body: unknown) {
  return new Request(
    'https://infra.test/api/v1/infrastructure/internal-accounts',
    {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

describe('platform account password reset route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeInternalAccountRequest.mockResolvedValue({
      ok: true,
      sbAdmin: { auth: { admin: {} } },
      user: { id: 'operator-user' },
    });
    mocks.resetAccountPasswordByEmail.mockResolvedValue({
      email: 'customer@example.com',
    });
  });

  it('returns authorization failures before parsing the request', async () => {
    mocks.authorizeInternalAccountRequest.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    });

    const response = await POST(request({}));

    expect(response.status).toBe(403);
    expect(mocks.resetAccountPasswordByEmail).not.toHaveBeenCalled();
  });

  it('rejects malformed account recovery input', async () => {
    const response = await POST(
      request({
        action: 'reset_password',
        email: 'not-an-email',
        newPassword: 'short',
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.resetAccountPasswordByEmail).not.toHaveBeenCalled();
  });

  it('allows an authorized operator to reset any exact account email', async () => {
    const response = await POST(
      request({
        action: 'reset_password',
        email: 'customer@example.com',
        newPassword: 'secure-temporary-password',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.resetAccountPasswordByEmail).toHaveBeenCalledWith({
      actorUserId: 'operator-user',
      email: 'customer@example.com',
      newPassword: 'secure-temporary-password',
      sbAdmin: { auth: { admin: {} } },
    });
    await expect(response.json()).resolves.toEqual({
      email: 'customer@example.com',
      message: 'Account password updated',
    });
  });
});
