// @vitest-environment node
import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { onSubscriptionCreatedSpy } = vi.hoisted(() => ({
  onSubscriptionCreatedSpy: vi.fn(),
}));

// Stand-in for the Polar adapter: rejects every request the way the real one
// rejects a failed signature check, so reaching it is observable.
vi.mock('@tuturuuu/payment/polar/next', () => ({
  Webhooks: vi.fn(() => async (request: Request) => {
    await request.text();
    return Response.json({ received: false }, { status: 403 });
  }),
}));

vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: onSubscriptionCreatedSpy,
}));

vi.mock('@tuturuuu/inventory-core/commerce/polar', () => ({
  syncInventoryPolarCheckout: onSubscriptionCreatedSpy,
  syncInventoryPolarOrder: onSubscriptionCreatedSpy,
}));

vi.mock('@tuturuuu/inventory-core/commerce/polar-product-sync', () => ({
  applyPolarProductToInventory: onSubscriptionCreatedSpy,
}));

vi.mock('@tuturuuu/payment-core/migrations-helper', () => ({
  upsertSubscriptionError: onSubscriptionCreatedSpy,
}));

vi.mock('@tuturuuu/payment-core/polar-order-helper', () => ({
  syncOrderToDatabase: onSubscriptionCreatedSpy,
}));

vi.mock('@tuturuuu/payment-core/polar-product-helper', () => ({
  syncProductToDatabase: onSubscriptionCreatedSpy,
}));

vi.mock('@tuturuuu/payment-core/polar-seat-helper', () => ({
  assignSeatsToAllMembers: onSubscriptionCreatedSpy,
}));

vi.mock('@tuturuuu/payment-core/polar-subscription-helper', () => ({
  syncSubscriptionToDatabase: onSubscriptionCreatedSpy,
}));

vi.mock('@tuturuuu/payment-core/subscription-helper', () => ({
  createFreeSubscription: onSubscriptionCreatedSpy,
  hasActiveSubscription: onSubscriptionCreatedSpy,
}));

import { Webhooks } from '@tuturuuu/payment/polar/next';
import { POST } from './route';

const SECRET_ENV = 'POLAR_WEBHOOK_SECRET';

const createRequest = () =>
  new Request('http://localhost/api/payment/webhooks', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': 'msg_test',
      'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
      'webhook-signature': 'v1,invalid',
    },
    body: JSON.stringify({ type: 'subscription.created', data: {} }),
  }) as NextRequest;

describe('Polar webhook secret handling', () => {
  const originalSecret = process.env[SECRET_ENV];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env[SECRET_ENV];
    else process.env[SECRET_ENV] = originalSecret;
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['whitespace-only', ' \t\n '],
  ])(
    'rejects with 500 before validation when the secret is %s',
    async (_label, value) => {
      if (value === undefined) delete process.env[SECRET_ENV];
      else process.env[SECRET_ENV] = value;

      const response = await POST(createRequest());

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Internal Server Error');
      expect(Webhooks).not.toHaveBeenCalled();
      expect(onSubscriptionCreatedSpy).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining(SECRET_ENV)
      );
    }
  );

  it('does not read the request body when the secret is unset', async () => {
    delete process.env[SECRET_ENV];
    const request = createRequest();

    await POST(request);

    expect(request.bodyUsed).toBe(false);
  });

  it('hands a configured secret to the adapter, whose bad-signature rejection is returned', async () => {
    const secret = `test-${crypto.randomUUID()}`;
    process.env[SECRET_ENV] = secret;

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ received: false });
    expect(Webhooks).toHaveBeenCalledTimes(1);
    expect(Webhooks).toHaveBeenCalledWith(
      expect.objectContaining({ webhookSecret: secret })
    );
    expect(onSubscriptionCreatedSpy).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
