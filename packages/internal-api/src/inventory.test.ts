import { describe, expect, it, vi } from 'vitest';
import {
  createInventoryCheckoutSession,
  createInventoryStorefront,
  getInventoryPublicOrder,
  getInventoryPublicStorefront,
  listInventoryBundles,
  listInventoryStorefronts,
} from './inventory';

function createJsonResponse(data: unknown) {
  return {
    json: async () => data,
    ok: true,
    status: 200,
  };
}

describe('inventory internal API helpers', () => {
  it('lists protected storefronts through the workspace API with filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: [],
        count: 0,
      })
    );

    await listInventoryStorefronts(
      'personal',
      { q: 'spring', status: 'published' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/personal/inventory/storefronts?q=spring&status=published',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('creates protected storefronts through the workspace API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ data: { id: 'store_1' } }));

    await createInventoryStorefront(
      'workspace 1',
      {
        name: 'Studio Store',
        slug: 'studio-store',
        status: 'draft',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/inventory/storefronts',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Studio Store',
          slug: 'studio-store',
          status: 'draft',
        }),
        method: 'POST',
      })
    );
  });

  it('lists bundles through the workspace API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: [],
        count: 0,
      })
    );

    await listInventoryBundles(
      'ws_1',
      { status: 'active' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/bundles?status=active',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('reads public storefronts and creates checkout sessions without workspace auth paths', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ storefront: { slug: 'shop' } })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          checkout: { publicToken: 'order_token' },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({ order: { status: 'pending' } })
      );

    await getInventoryPublicStorefront('shop', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await createInventoryCheckoutSession(
      'shop',
      {
        customerEmail: 'buyer@example.com',
        customerName: 'Buyer',
        lines: [{ listingId: 'listing_1', quantity: 2 }],
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await getInventoryPublicOrder('order_token', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/inventory/storefronts/shop',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/inventory/storefronts/shop/checkouts',
      expect.objectContaining({
        body: JSON.stringify({
          customerEmail: 'buyer@example.com',
          customerName: 'Buyer',
          lines: [{ listingId: 'listing_1', quantity: 2 }],
        }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/inventory/orders/order_token',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });
});
