import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFixture } from './subscription-test-fixtures';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  update: vi.fn(),
  get: vi.fn(),
  sync: vi.fn(),
}));
vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: () => ({
    subscriptions: { update: mocks.update, get: mocks.get },
  }),
}));
vi.mock('@tuturuuu/payment-core/polar-subscription-helper', () => ({
  syncSubscriptionToDatabase: mocks.sync,
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
    mocks.update.mockResolvedValue({ id: 'polar-sub', productId: 'product' });
    mocks.get.mockResolvedValue({
      id: 'polar-sub',
      productId: 'current-product',
      seats: 3,
    });
    mocks.sync.mockResolvedValue({ subscriptionData: { id: 'sub' } });
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
  it('rejects live product or quantity drift before a charge or projection', async () => {
    const f = adminFixture({ currentSeats: 3, count: 2 });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    for (const live of [
      { productId: 'current-product', seats: 5 },
      { productId: 'another-product', seats: 3 },
    ]) {
      mocks.get.mockResolvedValue(live);
      expect((await change(request(), params())).status).toBe(409);
    }
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it('waits for projection before reporting synchronized success', async () => {
    const f = adminFixture({ currentSeats: 3, count: 2 });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    const response = await change(request(), params());
    expect(await response.json()).toEqual({
      success: true,
      syncPending: false,
    });
    expect(mocks.sync).toHaveBeenCalledWith(
      f.admin,
      expect.objectContaining({
        productId: 'product',
        metadata: { wsId: 'workspace' },
      })
    );
  });
  it('reports projection delay without encouraging another billing mutation', async () => {
    const f = adminFixture({ currentSeats: 3, count: 2 });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    mocks.sync.mockRejectedValue(new Error('unavailable'));
    const response = await change(request(), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, syncPending: true });
  });
  it('reconciles an already-applied plan without replaying the charge', async () => {
    const f = adminFixture({ currentSeats: 3, count: 2 });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    mocks.get.mockResolvedValue({
      id: 'polar-sub',
      productId: 'product',
      seats: 3,
    });
    expect((await change(request(), params())).status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.sync).toHaveBeenCalledOnce();
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
