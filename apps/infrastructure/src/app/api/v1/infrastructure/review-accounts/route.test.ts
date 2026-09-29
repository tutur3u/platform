import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/internal-accounts/authorization', () => ({
  authorizeInternalAccountRequest: mocks.authorize,
}));
vi.mock('@/lib/review-accounts/service', () => ({
  createReviewAccount: mocks.create,
  listReviewAccounts: mocks.list,
  ReviewAccountError: class ReviewAccountError extends Error {},
}));

function request(origin = 'https://infrastructure.tuturuuu.com') {
  return new Request(
    'https://infrastructure.tuturuuu.com/api/v1/infrastructure/review-accounts',
    {
      body: JSON.stringify({
        displayName: 'App Reviewer',
        email: 'review@tuturuuu.com',
        kind: 'review',
      }),
      headers: {
        'content-type': 'application/json',
        origin: origin,
        'x-tuturuuu-account-action': '1',
      },
      method: 'POST',
    }
  );
}

describe('review account API boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      user: { id: 'operator' },
      sbAdmin: {},
    });
    mocks.create.mockResolvedValue({
      id: 'review-1',
      email: 'review@tuturuuu.com',
      kind: 'review',
      password: 'hidden',
    });
    mocks.list.mockResolvedValue([]);
  });

  it('rejects cross-origin creation before authorization', async () => {
    const response = await POST(request('https://attacker.example'));
    expect(response.status).toBe(403);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it('rejects callers without account administration permission', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: NextResponse.json({}, { status: 403 }),
    });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns private, uncached one-time credentials', async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'operator', kind: 'review' })
    );
  });

  it('requires authorization for account directory reads', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: NextResponse.json({}, { status: 403 }),
    });
    expect(
      (
        await GET(
          new Request(
            'https://infrastructure.tuturuuu.com/api/v1/infrastructure/review-accounts'
          )
        )
      ).status
    ).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
