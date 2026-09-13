import type { Polar } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { describe, expect, it, vi } from 'vitest';
import { assignSeatToMember } from './polar-seat-helper';

function client(subscription: unknown, product: unknown) {
  const query = (result: unknown) => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => result),
    };
    return builder;
  };
  return {
    from: () => query(subscription),
    schema: () => ({ from: () => query(product) }),
  } as unknown as TypedSupabaseClient;
}

describe('seat assignment accounting failures', () => {
  it.each([
    [{ data: null, error: { message: 'unavailable' } }, undefined],
    [
      {
        data: { product_id: 'product', polar_subscription_id: 'subscription' },
        error: null,
      },
      { data: null, error: { message: 'unavailable' } },
    ],
    [
      {
        data: { product_id: 'product', polar_subscription_id: null },
        error: null,
      },
      { data: { pricing_model: 'seat_based' }, error: null },
    ],
  ])(
    'does not treat unknown billing state as a seat-free subscription',
    async (subscription, product) => {
      const assignSeat = vi.fn();
      const polar = { customerSeats: { assignSeat } } as unknown as Polar;
      await expect(
        assignSeatToMember(
          polar,
          client(subscription, product),
          'workspace',
          'user'
        )
      ).rejects.toThrow();
      expect(assignSeat).not.toHaveBeenCalled();
    }
  );

  it('allows a verified workspace without an active subscription to use its existing policy', async () => {
    await expect(
      assignSeatToMember(
        {} as Polar,
        client({ data: null, error: null }, undefined),
        'workspace',
        'user'
      )
    ).resolves.toEqual({ required: false });
  });
});
