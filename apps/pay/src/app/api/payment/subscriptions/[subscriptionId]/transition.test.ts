import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFixture } from './subscription-test-fixtures';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), update: vi.fn() }));
vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: () => ({ subscriptions: { update: mocks.update } }),
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: mocks.resolve,
}));

import { POST as change } from './change/route';
import { POST as preview } from './preview/route';

function request() {
  return new NextRequest(
    'https://pay.tuturuuu.com/api/payment/subscriptions/sub/change',
    {
      method: 'POST',
      body: JSON.stringify({
        productId: 'product',
        expectedSeats: 3,
        expectedPricePerSeat: 900,
      }),
    }
  );
}
const params = () => ({ params: Promise.resolve({ subscriptionId: 'sub' }) });
describe('subscription transition seats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({ id: 'polar-sub' });
  });
  it('previews the target minimum separately from current purchased seats', async () => {
    const f = adminFixture({ count: 2, currentSeats: 3, minSeats: 5 });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    const response = await preview(request(), params());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.currentPlan).toMatchObject({ seatCount: 3, price: 2400 });
    expect(data.newPlan).toMatchObject({ seatCount: 5, price: 4500 });
    expect(f.queries.workspace_members).toHaveBeenCalledWith(
      'ws_id',
      'workspace'
    );
  });
  it('previews members and both kinds of reserved invitations', async () => {
    const f = adminFixture({
      count: 2,
      currentSeats: 3,
      pendingInvites: 2,
      pendingEmailInvites: 1,
    });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    const response = await preview(request(), params());
    expect(response.status).toBe(200);
    expect((await response.json()).newPlan).toMatchObject({
      seatCount: 5,
      price: 4500,
    });
  });
  it('requires a separate seat adjustment instead of silently changing seats', async () => {
    for (const config of [
      { currentSeats: 3, count: 2, minSeats: 5 },
      { currentSeats: 3, count: 5 },
      { currentSeats: 3, count: 2, pendingInvites: 1, pendingEmailInvites: 1 },
    ]) {
      const f = adminFixture(config);
      mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
      expect((await change(request(), params())).status).toBe(409);
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('permits an unchanged verified quantity without modifying discounts', async () => {
    const f = adminFixture({ currentSeats: 3, count: 2 });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    expect((await change(request(), params())).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      id: 'polar-sub',
      subscriptionUpdate: {
        productId: 'product',
        prorationBehavior: 'invoice',
      },
    });
  });
  it('rejects a stale or missing confirmation before contacting Polar', async () => {
    const f = adminFixture({ currentSeats: 3, count: 2 });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    for (const confirmation of [
      {},
      { expectedSeats: 3, expectedPricePerSeat: 800 },
      { expectedSeats: 2, expectedPricePerSeat: 900 },
    ]) {
      const req = new NextRequest(
        'https://pay.tuturuuu.com/api/payment/subscriptions/sub/change',
        {
          method: 'POST',
          body: JSON.stringify({ productId: 'product', ...confirmation }),
        }
      );
      expect((await change(req, params())).status).toBe(409);
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('fails preview and mutation on unknown counts and target over-capacity', async () => {
    for (const config of [
      { currentSeats: null },
      { count: null },
      { currentSeats: 3, maxSeats: 2 },
    ]) {
      const f = adminFixture(config);
      mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
      const expected = config.maxSeats ? 400 : 503;
      expect((await preview(request(), params())).status).toBe(expected);
      expect((await change(request(), params())).status).toBe(expected);
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
