import { describe, expect, it, vi } from 'vitest';
import {
  cancelInventorySquareTerminalCheckout,
  createInventoryBatch,
  createInventoryBundle,
  createInventoryCheckoutSession,
  createInventoryCostProfile,
  createInventoryMediaUploadUrl,
  createInventoryOwner,
  createInventoryProduct,
  createInventoryProductCategory,
  createInventoryPromotion,
  createInventorySquareDeviceCode,
  createInventorySquareTerminalCheckout,
  createInventoryStorefront,
  createInventorySupplier,
  createInventoryUnit,
  createInventoryWarehouse,
  deleteInventoryBatch,
  deleteInventoryBundle,
  deleteInventoryCostProfile,
  deleteInventoryOwner,
  deleteInventoryProduct,
  deleteInventoryProductCategory,
  deleteInventoryPromotion,
  deleteInventorySale,
  deleteInventoryStorefront,
  deleteInventoryStorefrontListing,
  deleteInventorySupplier,
  deleteInventoryUnit,
  deleteInventoryWarehouse,
  getInventoryCostingAnalytics,
  getInventoryOverview,
  getInventoryProductStockHistory,
  getInventoryPublicOrder,
  getInventoryPublicStorefront,
  getInventorySale,
  getInventorySquareSettings,
  importInventoryCostingCsv,
  listInventoryBundles,
  listInventoryCostProfiles,
  listInventoryPromotions,
  listInventoryRevenueShareEarnings,
  listInventorySquareDevices,
  listInventorySquareLocations,
  listInventoryStockBeneficiaries,
  listInventoryStorefronts,
  listInventoryUnits,
  recordInventoryStorefrontAnalyticsEvent,
  releaseInventoryCheckout,
  startInventorySquareOAuth,
  toPolarCurrency,
  updateInventoryBatch,
  updateInventoryCostProfile,
  updateInventoryOwner,
  updateInventoryProduct,
  updateInventoryProductCategory,
  updateInventoryProductInventory,
  updateInventoryPromotion,
  updateInventorySale,
  updateInventorySquareSettings,
  updateInventoryStorefrontListing,
  updateInventorySupplier,
  updateInventoryUnit,
  updateInventoryWarehouse,
  uploadInventoryMedia,
} from './inventory';

function createJsonResponse(data: unknown) {
  return {
    json: async () => data,
    ok: true,
    status: 200,
  };
}

describe('inventory internal API helpers', () => {
  it('loads the protected dashboard overview through the workspace API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        dashboard: null,
        realtime_enabled: false,
      })
    );

    await getInventoryOverview('workspace 1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/inventory/overview',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

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

  it('routes product create, update, stock update, and delete through workspace product APIs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        message: 'success',
      })
    );
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await createInventoryProduct(
      'ws_1',
      {
        category_id: 'category_1',
        name: 'Coffee Beans',
      },
      options
    );
    await updateInventoryProduct(
      'ws_1',
      'product 1',
      { name: 'Coffee Blend' },
      options
    );
    await updateInventoryProductInventory(
      'ws_1',
      'product 1',
      {
        changeContext: { beneficiaryId: 'person_1', note: 'Cycle count' },
        inventory: [
          {
            amount: 10,
            price: 1200,
            unit_id: 'unit_1',
            warehouse_id: 'warehouse_1',
          },
        ],
      },
      options
    );
    await deleteInventoryProduct('ws_1', 'product 1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/products',
      expect.objectContaining({
        body: JSON.stringify({
          category_id: 'category_1',
          name: 'Coffee Beans',
        }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws_1/products/product%201',
      expect.objectContaining({
        body: JSON.stringify({ name: 'Coffee Blend' }),
        method: 'PATCH',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws_1/products/product%201/inventory',
      expect.objectContaining({
        body: JSON.stringify({
          changeContext: {
            beneficiaryId: 'person_1',
            note: 'Cycle count',
          },
          inventory: [
            {
              amount: 10,
              price: 1200,
              unit_id: 'unit_1',
              warehouse_id: 'warehouse_1',
            },
          ],
        }),
        method: 'PATCH',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/ws_1/products/product%201',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });

  it('loads stock history and searchable beneficiaries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: [],
        pagination: { hasMore: false, limit: 25, offset: 0 },
      })
    );
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await getInventoryProductStockHistory(
      'workspace 1',
      'product 1',
      { limit: 25, offset: 50 },
      options
    );
    await listInventoryStockBeneficiaries(
      'workspace 1',
      { limit: 10, q: 'Ada Lovelace' },
      options
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/workspace%201/products/product%201/inventory/history?limit=25&offset=50',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/workspace%201/inventory/stock-beneficiaries?limit=10&q=Ada+Lovelace',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('routes storefront listing update/delete and checkout release through protected inventory APIs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: { id: 'listing_1' },
      })
    );
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await updateInventoryStorefrontListing(
      'ws_1',
      'storefront 1',
      'listing 1',
      { price: 2500, status: 'published' },
      options
    );
    await deleteInventoryStorefrontListing(
      'ws_1',
      'storefront 1',
      'listing 1',
      options
    );
    await releaseInventoryCheckout('ws_1', 'checkout 1', options);
    await deleteInventoryStorefront('ws_1', 'storefront 1', options);
    await deleteInventoryBundle('ws_1', 'bundle 1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/storefronts/storefront%201/listings/listing%201',
      expect.objectContaining({
        body: JSON.stringify({ price: 2500, status: 'published' }),
        method: 'PATCH',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/storefronts/storefront%201/listings/listing%201',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/checkouts/checkout%201/release',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/storefronts/storefront%201',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/bundles/bundle%201',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('routes promotion helpers through the shared workspace promotion API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ message: 'success' }));
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };
    const payload = {
      code: 'SAVE',
      max_uses: null,
      name: 'Save',
      unit: 'percentage' as const,
      value: 10,
    };

    await listInventoryPromotions('workspace 1', { q: 'Save' }, options);
    await createInventoryPromotion('workspace 1', payload, options);
    await expect(
      updateInventoryPromotion('workspace 1', 'promo/1', payload, options)
    ).resolves.toEqual({ message: 'success' });
    await deleteInventoryPromotion('workspace 1', 'promo/1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/workspace%201/promotions?q=Save&inventoryOnly=true&response=paginated',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/workspace%201/promotions',
      expect.objectContaining({
        body: JSON.stringify(payload),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/workspace%201/promotions/promo%2F1',
      expect.objectContaining({
        body: JSON.stringify(payload),
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/workspace%201/promotions/promo%2F1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('routes batch create, update, and delete through the inventory batch API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: { id: 'batch_1' },
      })
    );
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await createInventoryBatch(
      'ws_1',
      { price: 500, supplier_id: null, warehouse_id: 'warehouse_1' },
      options
    );
    await updateInventoryBatch('ws_1', 'batch 1', { price: 700 }, options);
    await deleteInventoryBatch('ws_1', 'batch 1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/batches',
      expect.objectContaining({
        body: JSON.stringify({
          price: 500,
          supplier_id: null,
          warehouse_id: 'warehouse_1',
        }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/batches/batch%201',
      expect.objectContaining({
        body: JSON.stringify({ price: 700 }),
        method: 'PATCH',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/batches/batch%201',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });

  it('routes setup resource CRUD through setup APIs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: { id: 'resource_1' },
        message: 'success',
      })
    );
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await createInventoryProductCategory('ws_1', { name: 'Tea' }, options);
    await updateInventoryProductCategory(
      'ws_1',
      'category 1',
      { name: 'Coffee' },
      options
    );
    await deleteInventoryProductCategory('ws_1', 'category 1', options);
    await createInventoryWarehouse('ws_1', { name: 'Main' }, options);
    await updateInventoryWarehouse(
      'ws_1',
      'warehouse 1',
      { name: 'Back' },
      options
    );
    await deleteInventoryWarehouse('ws_1', 'warehouse 1', options);
    await createInventorySupplier('ws_1', { name: 'Supplier' }, options);
    await updateInventorySupplier(
      'ws_1',
      'supplier 1',
      { name: 'Vendor' },
      options
    );
    await deleteInventorySupplier('ws_1', 'supplier 1', options);
    await createInventoryOwner('ws_1', { name: 'Ops' }, options);
    await updateInventoryOwner('ws_1', 'owner 1', { archived: true }, options);
    await deleteInventoryOwner('ws_1', 'owner 1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/categories',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/categories/category%201',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/categories/category%201',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/warehouses',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/warehouses/warehouse%201',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/warehouses/warehouse%201',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/suppliers',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/suppliers/supplier%201',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      9,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/suppliers/supplier%201',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      10,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/owners',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      12,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/owners/owner%201',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('routes sale detail, update, and delete through the inventory sale API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: { id: 'sale_1' },
      })
    );
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await getInventorySale('ws_1', 'sale 1', options);
    await updateInventorySale(
      'ws_1',
      'sale 1',
      { note: 'Packed', wallet_id: 'wallet_1' },
      options
    );
    await deleteInventorySale('ws_1', 'sale 1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/sales/sale%201',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/sales/sale%201',
      expect.objectContaining({
        body: JSON.stringify({ note: 'Packed', wallet_id: 'wallet_1' }),
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/sales/sale%201',
      expect.objectContaining({ method: 'DELETE' })
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
        lines: [
          {
            bundleId: 'bundle_1',
            bundleSelections: {
              component_1: [
                { listingId: 'listing_1', quantity: 1 },
                { listingId: 'listing_2', quantity: 1 },
                { listingId: 'listing_3', quantity: 1 },
              ],
            },
            listingId: 'bundle_listing_1',
            quantity: 1,
          },
        ],
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
          lines: [
            {
              bundleId: 'bundle_1',
              bundleSelections: {
                component_1: [
                  { listingId: 'listing_1', quantity: 1 },
                  { listingId: 'listing_2', quantity: 1 },
                  { listingId: 'listing_3', quantity: 1 },
                ],
              },
              listingId: 'bundle_listing_1',
              quantity: 1,
            },
          ],
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

  it('serializes category bundle payloads and revenue-share report queries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ data: { id: 'bundle_1' } }))
      .mockResolvedValueOnce(createJsonResponse({ count: 0, data: [] }));
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await createInventoryBundle(
      'ws_1',
      {
        categoryCandidateScope: 'all_stock',
        categoryComponents: [
          {
            categoryId: 'category_1',
            discountStrategy: 'cheapest_free',
            freeQuantity: 1,
            quantityRequired: 3,
          },
        ],
        name: 'Buy 2 Get 1 Keychains',
        price: 0,
        pricingMode: 'selected_items',
        slug: 'buy-2-get-1-keychains',
      },
      options
    );
    await listInventoryRevenueShareEarnings(
      'ws_1',
      {
        startAt: '2026-07-01T00:00:00.000Z',
        endAt: '2026-07-31T23:59:59.999Z',
        partnerId: 'owner_1',
        q: 'talent',
      },
      options
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/bundles',
      expect.objectContaining({
        body: JSON.stringify({
          categoryCandidateScope: 'all_stock',
          categoryComponents: [
            {
              categoryId: 'category_1',
              discountStrategy: 'cheapest_free',
              freeQuantity: 1,
              quantityRequired: 3,
            },
          ],
          name: 'Buy 2 Get 1 Keychains',
          price: 0,
          pricingMode: 'selected_items',
          slug: 'buy-2-get-1-keychains',
        }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws_1/inventory/revenue-share?startAt=2026-07-01T00%3A00%3A00.000Z&endAt=2026-07-31T23%3A59%3A59.999Z&partnerId=owner_1&q=talent',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });

  it('routes costing helpers through inventory costing APIs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: { id: 'cost_1' },
        rows: [],
      })
    );
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await listInventoryCostProfiles('ws 1', { q: 'poster' }, options);
    await getInventoryCostingAnalytics('ws 1', options);
    await importInventoryCostingCsv(
      'ws 1',
      { commit: false, csv: 'Item Category,Batch Size (Units)\nPoster,10' },
      options
    );
    await createInventoryCostProfile(
      'ws 1',
      {
        name: 'Poster',
        scenarios: [{ batchSize: 10, name: '10 units' }],
        targetRetailPrice: 20,
      },
      options
    );
    await updateInventoryCostProfile(
      'ws 1',
      'cost 1',
      { status: 'archived' },
      options
    );
    await deleteInventoryCostProfile('ws 1', 'cost 1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/costing?q=poster&response=paginated',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/costing/analytics',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/costing/import',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/costing',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/costing/cost%201',
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/costing/cost%201',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('uploads inventory media through the scoped inventory media endpoint', async () => {
    const file = new File(['image'], 'poster.webp', { type: 'image/webp' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          contentType: 'image/webp',
          fullPath:
            'ws-1/inventory/media/product-featured-image/upload-id-poster.webp',
          headers: { 'Content-Type': 'image/webp' },
          path: 'inventory/media/product-featured-image/upload-id-poster.webp',
          provider: 'r2',
          signedUrl: 'https://storage.example.com/upload',
          target: 'product-featured-image',
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          contentType: 'image/webp',
          fullPath:
            'ws-1/inventory/media/product-featured-image/upload-id-poster.webp',
          headers: { 'Content-Type': 'image/webp' },
          path: 'inventory/media/product-featured-image/upload-id-poster.webp',
          provider: 'r2',
          signedUrl: 'https://storage.example.com/upload',
          target: 'product-featured-image',
        })
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
      })
      .mockResolvedValueOnce(
        createJsonResponse({
          readUrl: 'https://storage.example.com/read',
        })
      );

    await createInventoryMediaUploadUrl(
      'ws 1',
      {
        contentType: 'image/webp',
        filename: 'poster.webp',
        size: file.size,
        target: 'product-featured-image',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    const result = await uploadInventoryMedia(
      'ws 1',
      file,
      'product-featured-image',
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/media/upload-url',
      expect.objectContaining({
        body: JSON.stringify({
          contentType: 'image/webp',
          filename: 'poster.webp',
          size: file.size,
          target: 'product-featured-image',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/media/upload-url',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://storage.example.com/upload',
      expect.objectContaining({
        body: file,
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/media/read-url',
      expect.objectContaining({
        body: JSON.stringify({
          path: 'inventory/media/product-featured-image/upload-id-poster.webp',
          provider: 'r2',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(result).toEqual({
      fullPath:
        'ws-1/inventory/media/product-featured-image/upload-id-poster.webp',
      path: 'inventory/media/product-featured-image/upload-id-poster.webp',
      target: 'product-featured-image',
      url: 'https://storage.example.com/read',
    });
  });

  it('records storefront analytics events through the public storefront API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ ok: true }));

    await recordInventoryStorefrontAnalyticsEvent(
      'shop',
      {
        eventType: 'add_to_cart',
        listingId: 'listing_1',
        quantity: 1,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/inventory/storefronts/shop/analytics/events',
      expect.objectContaining({
        body: JSON.stringify({
          eventType: 'add_to_cart',
          listingId: 'listing_1',
          quantity: 1,
        }),
        method: 'POST',
      })
    );
  });

  it('routes Square settings and device helpers through workspace inventory APIs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: [],
        readiness: { issues: [], ready: true },
      })
    );
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await getInventorySquareSettings('ws 1', options);
    await updateInventorySquareSettings(
      'ws 1',
      {
        environment: 'sandbox',
        locationId: 'loc-1',
        webhookSignatureKey: 'sig-key',
      },
      options
    );
    await startInventorySquareOAuth('ws 1', 'production', options);
    await listInventorySquareLocations('ws 1', options);
    await listInventorySquareDevices('ws 1', options);
    await createInventorySquareDeviceCode(
      'ws 1',
      { locationId: 'loc-1', name: 'Front counter' },
      options
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/square-settings',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/square-settings',
      expect.objectContaining({
        body: JSON.stringify({
          environment: 'sandbox',
          locationId: 'loc-1',
          webhookSignatureKey: 'sig-key',
        }),
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/square/oauth/start?environment=production',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/square/locations',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/square/devices',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/square/device-codes',
      expect.objectContaining({
        body: JSON.stringify({ locationId: 'loc-1', name: 'Front counter' }),
        method: 'POST',
      })
    );
  });

  it('routes Square terminal checkout actions through workspace APIs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        checkout: { id: 'checkout 1' },
        squareCheckout: { id: 'terminal-checkout-1' },
      })
    );
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await createInventorySquareTerminalCheckout(
      'ws 1',
      { checkoutId: 'checkout 1', deviceId: 'device 1' },
      options
    );
    await cancelInventorySquareTerminalCheckout('ws 1', 'checkout 1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/square/terminal-checkouts',
      expect.objectContaining({
        body: JSON.stringify({
          checkoutId: 'checkout 1',
          deviceId: 'device 1',
        }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws%201/inventory/square/terminal-checkouts/checkout%201/cancel',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });
});

describe('toPolarCurrency', () => {
  it('lowercases an uppercase stored currency for the Polar boundary', () => {
    // Regression: the DB stores `USD`, but Polar's SDK enum only accepts `usd`.
    expect(toPolarCurrency('USD')).toBe('usd');
    expect(toPolarCurrency('EUR')).toBe('eur');
  });

  it('trims and normalizes mixed-case input', () => {
    expect(toPolarCurrency('  Usd ')).toBe('usd');
  });

  it('falls back to usd for empty, null, or unsupported values', () => {
    expect(toPolarCurrency(null)).toBe('usd');
    expect(toPolarCurrency(undefined)).toBe('usd');
    expect(toPolarCurrency('')).toBe('usd');
    expect(toPolarCurrency('XYZ')).toBe('usd');
  });
});
