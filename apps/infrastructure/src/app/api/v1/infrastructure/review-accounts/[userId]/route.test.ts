import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from './route';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/internal-accounts/authorization', () => ({
  authorizeInternalAccountRequest: mocks.authorize,
}));
vi.mock('@/lib/review-accounts/service', () => ({
  updateReviewAccount: mocks.update,
  ReviewAccountError: class ReviewAccountError extends Error {},
}));

function request(
  email = 'review@tuturuuu.com',
  origin = 'https://infrastructure.tuturuuu.com'
) {
  return new Request(
    'https://infrastructure.tuturuuu.com/api/v1/infrastructure/review-accounts/review-1',
    {
      body: JSON.stringify({
        action: 'rotate_password',
        confirmationEmail: email,
      }),
      headers: {
        'content-type': 'application/json',
        origin,
        'x-tuturuuu-account-action': '1',
      },
      method: 'PATCH',
    }
  );
}

const params = { params: Promise.resolve({ userId: 'review-1' }) };

describe('review account action API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      user: { id: 'operator' },
      sbAdmin: {},
    });
    mocks.update.mockResolvedValue({
      email: 'review@tuturuuu.com',
      password: 'new-secret',
    });
  });

  it('requires same-origin action and administrator access', async () => {
    expect(
      (await PATCH(request(undefined, 'https://attacker.example'), params))
        .status
    ).toBe(403);
    expect(mocks.authorize).not.toHaveBeenCalled();
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: NextResponse.json({}, { status: 403 }),
    });
    expect((await PATCH(request(), params)).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects malformed confirmation and returns private credential rotation', async () => {
    expect((await PATCH(request('not-an-email'), params)).status).toBe(400);
    const response = await PATCH(request(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'review-1',
        actorUserId: 'operator',
        confirmationEmail: 'review@tuturuuu.com',
      })
    );
  });
});
