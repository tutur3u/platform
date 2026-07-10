import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPaySubscriptionCheckout,
  getPayWorkspaceBillingSummary,
  updatePaySubscriptionCancellation,
} from './pay';

describe('Pay internal API helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the workspace billing summary from the configured Pay origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        isPersonalWorkspace: false,
        subscription: null,
      }),
      ok: true,
      status: 200,
    });

    await getPayWorkspaceBillingSummary('workspace / one', {
      baseUrl: 'https://pay.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://pay.example.com/api/v1/workspaces/workspace%20%2F%20one/billing/summary',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('creates subscription checkouts through encoded Pay paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ url: 'https://checkout.example' }),
      ok: true,
      status: 200,
    });

    await createPaySubscriptionCheckout(
      'subscription/1',
      { productId: 'product-1', wsId: 'ws-1' },
      {
        baseUrl: 'https://pay.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://pay.example.com/api/payment/subscriptions/subscription%2F1/checkouts',
      expect.objectContaining({
        body: JSON.stringify({ productId: 'product-1', wsId: 'ws-1' }),
        method: 'POST',
      })
    );
  });

  it.each([
    [true, 'DELETE'],
    [false, 'PATCH'],
  ])('maps cancellation state %s to %s', async (cancel, method) => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ success: true }),
      ok: true,
      status: 200,
    });

    await updatePaySubscriptionCancellation('sub-1', cancel, {
      baseUrl: 'https://pay.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://pay.example.com/api/payment/customer-portal/subscriptions/sub-1',
      expect.objectContaining({ method })
    );
  });
});
