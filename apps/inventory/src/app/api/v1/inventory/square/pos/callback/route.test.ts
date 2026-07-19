import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completeInventorySquarePosCallback: vi.fn(),
  getCheckoutStorefrontAccessByPublicToken: vi.fn(),
  parseSquarePosCallback: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/checkouts', () => ({
  getCheckoutStorefrontAccessByPublicToken: (...args: unknown[]) =>
    mocks.getCheckoutStorefrontAccessByPublicToken(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/square', () => ({
  completeInventorySquarePosCallback: (...args: unknown[]) =>
    mocks.completeInventorySquarePosCallback(...args),
  parseSquarePosCallback: (...args: unknown[]) =>
    mocks.parseSquarePosCallback(...args),
  SquarePosCallbackError: class SquarePosCallbackError extends Error {},
}));

vi.mock('@/constants/common', () => ({
  STOREFRONT_APP_URL: 'https://store.tuturuuu.com',
}));

describe('Square POS callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseSquarePosCallback.mockReturnValue({
      requestState: 'public-token.request-id',
      transactionId: 'square-order-1',
    });
    mocks.completeInventorySquarePosCallback.mockResolvedValue({
      checkout: { publicToken: 'public-token' },
      outcome: 'completed',
    });
    mocks.getCheckoutStorefrontAccessByPublicToken.mockResolvedValue({
      storefrontSlug: 'vaiolis',
    });
  });

  it('accepts Android query callbacks and returns to the public order', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'https://inventory.tuturuuu.com/api/v1/inventory/square/pos/callback?com.squareup.pos.SERVER_TRANSACTION_ID=square-order-1&com.squareup.pos.REQUEST_METADATA=public-token.request-id'
      )
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'https://store.tuturuuu.com/vaiolis/orders/public-token?square_pos=completed'
    );
    expect(mocks.parseSquarePosCallback).toHaveBeenCalledWith(
      expect.any(URLSearchParams)
    );
  });

  it('accepts iOS form callbacks', async () => {
    const { POST } = await import('./route');
    const form = new URLSearchParams({
      data: JSON.stringify({
        state: 'public-token.request-id',
        transaction_id: 'square-order-1',
      }),
    });
    const response = await POST(
      new Request(
        'https://inventory.tuturuuu.com/api/v1/inventory/square/pos/callback',
        {
          body: form,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          method: 'POST',
        }
      )
    );

    expect(response.status).toBe(303);
    const parsed = mocks.parseSquarePosCallback.mock
      .calls[0]?.[0] as URLSearchParams;
    expect(parsed.get('data')).toContain('square-order-1');
  });
});
