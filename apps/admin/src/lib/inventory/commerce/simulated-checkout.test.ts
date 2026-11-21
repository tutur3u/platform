import { describe, expect, it } from 'vitest';
import {
  createSimulatedOrderToken,
  getSimulatedOrderResponse,
  verifySimulatedOrderToken,
} from './simulated-checkout';

const tokenPayload = {
  currency: 'USD',
  customerEmail: 'buyer@example.com',
  customerName: 'Buyer',
  storeSlug: 'shop',
  subtotalAmount: 5000,
  totalAmount: 5000,
  wsId: 'workspace-1',
};

describe('simulated checkout tokens', () => {
  it('rejects forged simulated order tokens', () => {
    expect(
      verifySimulatedOrderToken('simulated-order-anything', {
        secret: 'test-secret',
      })
    ).toMatchObject({
      error: 'malformed_token',
      ok: false,
    });
  });

  it('returns simulated order details only for signed tokens', () => {
    const now = new Date('2026-06-15T00:00:00.000Z');
    const token = createSimulatedOrderToken(tokenPayload, {
      now,
      secret: 'test-secret',
    });

    expect(
      verifySimulatedOrderToken(token, { now, secret: 'test-secret' })
    ).toMatchObject({
      claims: expect.objectContaining({
        totalAmount: 5000,
        wsId: 'workspace-1',
      }),
      ok: true,
    });
    expect(
      getSimulatedOrderResponse(token, { now, secret: 'test-secret' })
    ).toMatchObject({
      order: {
        currency: 'USD',
        customerEmail: 'buyer@example.com',
        customerName: 'Buyer',
        publicToken: token,
        status: 'completed',
        totalAmount: 5000,
        wsId: 'workspace-1',
      },
    });
  });

  it('rejects expired signed simulated order tokens', () => {
    const token = createSimulatedOrderToken(tokenPayload, {
      now: new Date('2026-06-15T00:00:00.000Z'),
      secret: 'test-secret',
    });

    expect(
      verifySimulatedOrderToken(token, {
        now: new Date('2026-06-16T00:00:01.000Z'),
        secret: 'test-secret',
      })
    ).toMatchObject({
      error: 'expired_token',
      ok: false,
    });
  });
});
