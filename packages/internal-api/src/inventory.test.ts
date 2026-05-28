import { describe, expect, it, vi } from 'vitest';
import {
  createInventoryCheckoutSession,
  createInventoryStorefront,
  createInventoryUnit,
  deleteInventoryUnit,
  getInventoryPublicOrder,
  getInventoryPublicStorefront,
  listInventoryBundles,
  listInventoryStorefronts,
  listInventoryUnits,
  updateInventoryUnit,
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

  it('lists product units through the legacy workspace API with no-store caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse([]));

    await listInventoryUnits('workspace 1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/product-units',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('creates, updates, and deletes product units through the workspace API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: { id: 'unit_1' },
        message: 'success',
      })
    );

    await createInventoryUnit(
      'ws_1',
      { name: 'Box' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await updateInventoryUnit(
      'ws_1',
      'unit 1',
      { name: 'Carton' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await deleteInventoryUnit('ws_1', 'unit 1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws_1/product-units',
      expect.objectContaining({
        body: JSON.stringify({ name: 'Box' }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws_1/product-units/unit%201',
      expect.objectContaining({
        body: JSON.stringify({ name: 'Carton' }),
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws_1/product-units/unit%201',
      expect.objectContaining({
        method: 'DELETE',
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
