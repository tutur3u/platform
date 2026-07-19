import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from './route';

const mocks = vi.hoisted(() => ({
  authorizeInternalAccountRequest: vi.fn(),
  mutateInternalAccount: vi.fn(),
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
  mutateInternalAccount: mocks.mutateInternalAccount,
}));

const targetUserId = '11111111-1111-4111-8111-111111111111';

function request(body: unknown) {
  return new Request('https://infra.test/api', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  });
}

function params(userId = targetUserId) {
  return { params: Promise.resolve({ userId }) };
}

describe('internal account mutation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeInternalAccountRequest.mockResolvedValue({
      ok: true,
      sbAdmin: { auth: { admin: {} } },
      user: { id: 'operator-1' },
    });
    mocks.mutateInternalAccount.mockResolvedValue({
      email: 'local@tuturuuu.com',
      id: targetUserId,
    });
  });

  it('returns authorization failures before parsing action input', async () => {
    mocks.authorizeInternalAccountRequest.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    });

    const response = await PATCH(request({}), params());

    expect(response.status).toBe(403);
    expect(mocks.mutateInternalAccount).not.toHaveBeenCalled();
  });

  it('rejects reset requests without a sufficiently strong password', async () => {
    const response = await PATCH(
      request({
        action: 'reset_password',
        confirmationEmail: 'local@tuturuuu.com',
        newPassword: 'short',
      }),
      params()
    );

    expect(response.status).toBe(400);
    expect(mocks.mutateInternalAccount).not.toHaveBeenCalled();
  });

  it('passes a validated target and typed confirmation to the service', async () => {
    const response = await PATCH(
      request({
        action: 'disable_access',
        confirmationEmail: 'local@tuturuuu.com',
      }),
      params()
    );

    expect(response.status).toBe(200);
    expect(mocks.mutateInternalAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'disable_access',
        actorUserId: 'operator-1',
        confirmationEmail: 'local@tuturuuu.com',
        targetUserId,
      })
    );
  });
});
