import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { TEST_USER } from './helpers/constants';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

function serviceHeaders({
  prefer,
  schema,
}: {
  prefer?: string;
  schema?: 'private' | 'public';
} = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
    ...(schema
      ? {
          'accept-profile': schema,
          'content-profile': schema,
        }
      : {}),
  };
}

test.describe('Inventory public checkout modes', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('supports simulated checkout and blocks disabled checkout without Polar', async ({
    baseURL,
    request,
  }) => {
    const origin = baseURL ?? 'https://tuturuuu.localhost';
    const workspaceId = randomUUID();
    const categoryId = randomUUID();
    const ownerId = randomUUID();
    const productId = randomUUID();
    const unitId = randomUUID();
    const warehouseId = randomUUID();
    const simulatedStorefrontId = randomUUID();
    const disabledStorefrontId = randomUUID();
    const simulatedListingId = randomUUID();
    const disabledListingId = randomUUID();
    const slugSuffix = workspaceId.slice(0, 8);
    const simulatedSlug = `e2e-simulated-${slugSuffix}`;
    const disabledSlug = `e2e-disabled-${slugSuffix}`;

    try {
      const workspaceResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspaces`,
        {
          data: {
            creator_id: TEST_USER.id,
            handle: `e2e-inventory-checkout-${slugSuffix}`,
            id: workspaceId,
            name: 'E2E Inventory Checkout Modes',
            personal: false,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(workspaceResponse.status()).toBe(201);

      const secretResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_secrets`,
        {
          data: {
            name: 'ENABLE_INVENTORY',
            value: 'true',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(secretResponse.status()).toBe(201);

      const categoryResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/product_categories`,
        {
          data: {
            id: categoryId,
            name: 'E2E Merch',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(categoryResponse.status()).toBe(201);

      const ownerResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/inventory_owners`,
        {
          data: {
            id: ownerId,
            name: 'Unassigned',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(ownerResponse.status()).toBe(201);

      const productResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/workspace_products`,
        {
          data: {
            category_id: categoryId,
            id: productId,
            name: 'E2E Poster',
            owner_id: ownerId,
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      expect(productResponse.status()).toBe(201);

      const unitResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/inventory_units`,
        {
          data: {
            id: unitId,
            name: 'piece',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(unitResponse.status()).toBe(201);

      const warehouseResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/inventory_warehouses`,
        {
          data: {
            id: warehouseId,
            name: 'Main',
            ws_id: workspaceId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(warehouseResponse.status()).toBe(201);

      const stockResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/inventory_products`,
        {
          data: {
            amount: 10,
            price: 2500,
            product_id: productId,
            unit_id: unitId,
            warehouse_id: warehouseId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(stockResponse.status()).toBe(201);

      const storefrontResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/inventory_storefronts`,
        {
          data: [
            {
              checkout_mode: 'simulated',
              currency: 'USD',
              id: simulatedStorefrontId,
              name: 'E2E Simulated Storefront',
              slug: simulatedSlug,
              status: 'published',
              visibility: 'public',
              ws_id: workspaceId,
            },
            {
              checkout_mode: 'disabled',
              currency: 'USD',
              id: disabledStorefrontId,
              name: 'E2E Disabled Storefront',
              slug: disabledSlug,
              status: 'published',
              visibility: 'public',
              ws_id: workspaceId,
            },
          ],
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(storefrontResponse.status()).toBe(201);

      const listingResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/inventory_storefront_listings`,
        {
          data: [
            {
              id: simulatedListingId,
              listing_type: 'product',
              max_per_order: 5,
              price: 2500,
              product_id: productId,
              status: 'published',
              storefront_id: simulatedStorefrontId,
              title: 'E2E Poster',
              unit_id: unitId,
              warehouse_id: warehouseId,
              ws_id: workspaceId,
            },
            {
              id: disabledListingId,
              listing_type: 'product',
              max_per_order: 5,
              price: 2500,
              product_id: productId,
              status: 'published',
              storefront_id: disabledStorefrontId,
              title: 'E2E Poster',
              unit_id: unitId,
              warehouse_id: warehouseId,
              ws_id: workspaceId,
            },
          ],
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      expect(listingResponse.status()).toBe(201);

      const simulatedCheckout = await request.post(
        `${origin}/api/v1/inventory/storefronts/${simulatedSlug}/checkouts`,
        {
          data: {
            customerEmail: 'buyer@example.com',
            customerName: 'Buyer',
            lines: [{ listingId: simulatedListingId, quantity: 2 }],
          },
          failOnStatusCode: false,
        }
      );
      expect(simulatedCheckout.status()).toBe(201);
      const simulatedBody = await simulatedCheckout.json();
      expect(simulatedBody.checkout.publicToken).toMatch(/^simulated-order-/);
      expect(simulatedBody.checkout.totalAmount).toBe(5000);
      expect(simulatedBody.checkoutUrl).toContain(
        `/store/${simulatedSlug}/orders/simulated-order-`
      );

      const disabledCheckout = await request.post(
        `${origin}/api/v1/inventory/storefronts/${disabledSlug}/checkouts`,
        {
          data: {
            customerEmail: 'buyer@example.com',
            customerName: 'Buyer',
            lines: [{ listingId: disabledListingId, quantity: 1 }],
          },
          failOnStatusCode: false,
        }
      );
      expect(disabledCheckout.status()).toBe(409);
      await expect(disabledCheckout.json()).resolves.toEqual({
        message: 'Checkout is disabled for this storefront',
      });
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/inventory_checkout_sessions?ws_id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
            schema: 'private',
          }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspace_products?id=eq.${productId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
      await request.delete(
        `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );
    }
  });
});
