import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const OWNER = '11111111-1111-4111-8111-111111111111';
const SERVICE = 'fixture-store-service'.repeat(2);
const mocks = vi.hoisted(() => ({
  isFleetOwner: vi.fn(),
  isUserCurrentlySuspended: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mastermind/fleet/auth', () => ({
  isFleetOwner: mocks.isFleetOwner,
}));
vi.mock('@tuturuuu/utils/abuse-protection/user-suspension', () => ({
  isUserCurrentlySuspended: mocks.isUserCurrentlySuspended,
}));

function authorize(authorization: string) {
  return POST(
    new NextRequest(
      'https://tuturuuu.com/api/v1/mastermind/fleet/live/owner-authorization',
      {
        method: 'POST',
        headers: { authorization },
        body: JSON.stringify({ ownerId: OWNER }),
      }
    )
  );
}

describe('owner notice authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MASTERMIND_STORE_TOKEN', SERVICE);
    mocks.isFleetOwner.mockResolvedValue(true);
    mocks.isUserCurrentlySuspended.mockResolvedValue(false);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('requires the store service credential before looking up an owner', async () => {
    expect((await authorize('Bearer unrelated')).status).toBe(401);
    expect(mocks.isFleetOwner).not.toHaveBeenCalled();
  });

  it('denies delivery when suspension verification is unavailable', async () => {
    mocks.isUserCurrentlySuspended.mockRejectedValueOnce(new Error('offline'));
    expect((await authorize(`Bearer ${SERVICE}`)).status).toBe(503);
  });

  it('checks the bound subject again after revocation', async () => {
    const authorization = `Bearer ${SERVICE}`;
    const allowed = await authorize(authorization);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('cache-control')).toBe('private, no-store');
    mocks.isFleetOwner.mockResolvedValue(false);
    expect((await authorize(authorization)).status).toBe(403);
    expect(mocks.isFleetOwner.mock.calls).toEqual([
      [{ id: OWNER }],
      [{ id: OWNER }],
    ]);
  });
});
