import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), create: vi.fn() }));
vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: () => ({ checkouts: { create: mocks.create } }),
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: mocks.resolve,
}));

import { adminFixture } from '../subscription-test-fixtures';
import { POST } from './route';

async function checkout() {
  return POST(
    new NextRequest(
      'https://pay.tuturuuu.com/api/payment/subscriptions/sub/checkouts',
      {
        method: 'POST',
        body: JSON.stringify({ wsId: 'workspace', productId: 'product' }),
      }
    ),
    { params: Promise.resolve({ subscriptionId: 'sub' }) }
  );
}

describe('workspace checkout boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ url: 'https://polar.sh/checkout/test' });
  });
  it('binds the subscription to the authorized workspace before contacting Polar', async () => {
    const f = adminFixture({ subscription: false });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    expect((await checkout()).status).toBe(404);
    expect(f.queries.workspace_subscriptions).toHaveBeenCalledWith('id', 'sub');
    expect(f.queries.workspace_subscriptions).toHaveBeenCalledWith(
      'ws_id',
      'workspace'
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('supplies one verified seat for a personal workspace', async () => {
    const f = adminFixture();
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    expect((await checkout()).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ seats: 1, metadata: { wsId: 'workspace' } })
    );
  });
  it('requires period-end cancellation for paid-to-Free changes', async () => {
    const f = adminFixture({ targetTier: 'FREE', model: 'free' });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    expect((await checkout()).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('fails closed when the current product cannot be verified', async () => {
    const f = adminFixture({ currentMissing: true });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    expect((await checkout()).status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('permits a verified Free-to-paid checkout', async () => {
    const f = adminFixture({ currentTier: 'FREE' });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    expect((await checkout()).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it('uses the target minimum while retaining purchased capacity', async () => {
    for (const [currentSeats, minSeats, expected] of [
      [3, 5, 5],
      [5, 1, 5],
    ]) {
      const f = adminFixture({ currentSeats, minSeats, count: 2 });
      mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
      expect((await checkout()).status).toBe(200);
      expect(mocks.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ seats: expected })
      );
    }
  });
  it('rejects excessive or unverifiable purchased capacity', async () => {
    for (const { config, status } of [
      { config: { currentSeats: 3, maxSeats: 2 }, status: 400 },
      { config: { currentSeats: null }, status: 503 },
      { config: { currentSeats: 0 }, status: 503 },
      { config: { currentModel: null }, status: 503 },
      { config: { currentModel: 'unknown' }, status: 503 },
      { config: { minSeats: null }, status: 400 },
      { config: { pendingInvites: null }, status: 503 },
      { config: { pendingEmailInvites: null }, status: 503 },
      { config: { pendingInvites: -1 }, status: 503 },
      { config: { pendingEmailInvites: 3, maxSeats: 2 }, status: 400 },
    ]) {
      const f = adminFixture(config);
      mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
      expect((await checkout()).status).toBe(status);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('quotes reserved invitations when a legacy fixed workspace moves to seats', async () => {
    const f = adminFixture({
      currentModel: 'fixed',
      currentSeats: null,
      count: 2,
      pendingInvites: 3,
      pendingEmailInvites: 4,
    });
    mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
    expect((await checkout()).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ seats: 9 })
    );
    for (const table of [
      'workspace_members',
      'workspace_invites',
      'workspace_email_invites',
    ])
      expect(f.queries[table]).toHaveBeenCalledWith('ws_id', 'workspace');
  });
  it('denies legacy fixed products and unavailable seat accounting', async () => {
    for (const { config, status } of [
      { config: { model: 'fixed' }, status: 400 },
      { config: { count: null }, status: 503 },
      { config: { count: 0 }, status: 503 },
    ]) {
      const f = adminFixture(config);
      mocks.resolve.mockResolvedValue({ admin: f.admin, user: { id: 'user' } });
      expect((await checkout()).status).toBe(status);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
