import type { Polar, Product } from '@tuturuuu/payment/polar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { describe, expect, it, vi } from 'vitest';
import { syncProductToDatabase } from './polar-product-helper';
import { getSeatStatus } from './seat-limits';
import { createFreeSubscription } from './subscription-helper';

describe('billing fail-closed safeguards', () => {
  it('archives existing products even when no sellable price remains', async () => {
    const update = vi.fn().mockReturnThis();
    const query = {
      update,
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { id: 'product', archived: true } }),
    };
    const db = {
      schema: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(query) }),
    } as unknown as TypedSupabaseClient;
    await syncProductToDatabase(db, {
      id: 'product',
      isArchived: true,
      prices: [],
      metadata: {},
    } as unknown as Product);
    expect(update).toHaveBeenCalledWith({ archived: true });
  });
  it('does not create a free subscription when the provider lookup fails', async () => {
    const create = vi.fn();
    const polar = {
      subscriptions: {
        list: vi.fn().mockRejectedValue(new Error('unavailable')),
        create,
      },
    } as unknown as Polar;
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'ws' } }),
    };
    const db = {
      from: vi.fn().mockReturnValue(query),
    } as unknown as TypedSupabaseClient;
    expect((await createFreeSubscription(polar, db, 'ws')).status).toBe(
      'error'
    );
    expect(create).not.toHaveBeenCalled();
  });
  it.each([null, -1, Number.NaN, 1.5])(
    'does not grant seats with invalid member count %s',
    async (count) => {
      const subscription = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      };
      const members = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ count }),
      };
      const db = {
        from: vi.fn((table) =>
          table === 'workspace_members' ? members : subscription
        ),
      } as unknown as TypedSupabaseClient;
      expect((await getSeatStatus(db, 'ws')).canAddMember).toBe(false);
    }
  );
});
