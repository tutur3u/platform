import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const mocks = vi.hoisted(() => ({
  authorizeInternalAccountRequest: vi.fn(),
  resetAccountPasswordByEmail: vi.fn(),
  listInternalAccountUsers: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
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
  listInternalAccountUsers: mocks.listInternalAccountUsers,
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

describe('internal account directory pagination contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeInternalAccountRequest.mockResolvedValue({
      ok: true,
      sbAdmin: { auth: { admin: {} } },
      user: { id: 'operator-user' },
    });
    mocks.listInternalAccountUsers.mockResolvedValue({
      accounts: [],
      count: 60,
      nextCursor: '50',
    });
  });

  it('accepts the native 50-account request including disabled and pending accounts', async () => {
    const response = await GET(
      new Request(
        'https://infra.test/api/v1/infrastructure/internal-accounts?limit=50&activeOnly=false&verifiedOnly=false'
      )
    );
    expect(response.status).toBe(200);
    expect(mocks.listInternalAccountUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 50,
        activeOnly: false,
        verifiedOnly: false,
        actorUserId: 'operator-user',
      })
    );
    await expect(response.json()).resolves.toEqual({
      accounts: [],
      count: 60,
      nextCursor: '50',
    });
  });

  it('retains the native cursor and trimmed search on the next page', async () => {
    const response = await GET(
      new Request(
        'https://infra.test/api/v1/infrastructure/internal-accounts?limit=50&cursor=50&q=%20staff%20'
      )
    );
    expect(response.status).toBe(200);
    expect(mocks.listInternalAccountUsers).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, cursor: '50', q: 'staff' })
    );
  });

  it.each(['51', '0', '-1', '1.5', 'invalid'])(
    'rejects invalid page size %s before loading accounts',
    async (limit) => {
      const response = await GET(
        new Request(
          `https://infra.test/api/v1/infrastructure/internal-accounts?limit=${limit}`
        )
      );
      expect(response.status).toBe(400);
      expect(mocks.listInternalAccountUsers).not.toHaveBeenCalled();
    }
  );

  it('still requires administrator authorization for a valid native query', async () => {
    mocks.authorizeInternalAccountRequest.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    });
    const response = await GET(
      new Request(
        'https://infra.test/api/v1/infrastructure/internal-accounts?limit=50'
      )
    );
    expect(response.status).toBe(403);
    expect(mocks.listInternalAccountUsers).not.toHaveBeenCalled();
  });
});
