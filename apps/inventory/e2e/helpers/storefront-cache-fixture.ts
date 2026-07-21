import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect } from '@playwright/test';
import {
  LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from '../../../web/e2e/helpers/environment';

export const INVENTORY_URL = 'http://localhost:7815';
export const SUPABASE_URL = LOCAL_E2E_SUPABASE_URL;
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

type Fixture = {
  accessToken: string;
  categoryId: string;
  ownerId: string;
  productId: string;
  slug: string;
  storefrontId: string;
  unitId: string;
  warehouseId: string;
  workspaceId: string;
};

function serviceHeaders(schema: 'private' | 'public' = 'public') {
  return {
    'accept-profile': schema,
    apikey: LOCAL_E2E_SUPABASE_SECRET_KEY,
    authorization: `Bearer ${LOCAL_E2E_SUPABASE_SECRET_KEY}`,
    'content-profile': schema,
    'content-type': 'application/json',
    prefer: 'return=minimal',
  };
}

async function insert(
  request: APIRequestContext,
  table: string,
  data: unknown,
  schema: 'private' | 'public' = 'public'
) {
  const response = await request.post(`${SUPABASE_URL}/rest/v1/${table}`, {
    data,
    failOnStatusCode: false,
    headers: serviceHeaders(schema),
  });
  expect(response.status(), await response.text()).toBe(201);
}

export async function createStorefrontCacheFixture(
  request: APIRequestContext
): Promise<Fixture> {
  const workspaceId = randomUUID();
  const categoryId = randomUUID();
  const ownerId = randomUUID();
  const productId = randomUUID();
  const unitId = randomUUID();
  const warehouseId = randomUUID();
  const storefrontId = randomUUID();
  const slug = `e2e-cache-${workspaceId.slice(0, 8)}`;

  const auth = await request.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      data: { email: 'local@tuturuuu.com', password: 'password123' },
      headers: {
        apikey: LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
        'content-type': 'application/json',
      },
    }
  );
  expect(auth.ok(), await auth.text()).toBe(true);
  const accessToken = String((await auth.json()).access_token);

  await insert(request, 'workspaces', {
    creator_id: TEST_USER_ID,
    handle: slug,
    id: workspaceId,
    name: 'E2E Storefront Cache',
    personal: false,
  });
  await insert(request, 'workspace_secrets', {
    name: 'ENABLE_INVENTORY',
    value: 'true',
    ws_id: workspaceId,
  });
  await insert(request, 'workspace_members', {
    type: 'MEMBER',
    user_id: TEST_USER_ID,
    ws_id: workspaceId,
  });
  await insert(request, 'product_categories', {
    id: categoryId,
    name: 'E2E Products',
    ws_id: workspaceId,
  });
  await insert(
    request,
    'inventory_owners',
    { id: ownerId, name: 'E2E Owner', ws_id: workspaceId },
    'private'
  );
  await insert(
    request,
    'inventory_units',
    { id: unitId, name: 'Piece', ws_id: workspaceId },
    'private'
  );
  await insert(
    request,
    'inventory_warehouses',
    { id: warehouseId, name: 'E2E Warehouse', ws_id: workspaceId },
    'private'
  );
  await insert(request, 'workspace_products', {
    category_id: categoryId,
    id: productId,
    name: 'Cache Test Product',
    owner_id: ownerId,
    ws_id: workspaceId,
  });
  await insert(
    request,
    'inventory_products',
    {
      amount: 4,
      price: 20,
      product_id: productId,
      unit_id: unitId,
      warehouse_id: warehouseId,
    },
    'private'
  );
  await insert(
    request,
    'inventory_storefronts',
    {
      checkout_mode: 'simulated',
      currency: 'USD',
      id: storefrontId,
      name: 'Cache Test Store',
      slug,
      status: 'published',
      visibility: 'public',
      ws_id: workspaceId,
    },
    'private'
  );
  await insert(
    request,
    'inventory_storefront_listings',
    {
      id: randomUUID(),
      listing_type: 'product',
      max_per_order: 4,
      price: 2000,
      product_id: productId,
      status: 'published',
      storefront_id: storefrontId,
      title: 'Cache Test Product',
      unit_id: unitId,
      warehouse_id: warehouseId,
      ws_id: workspaceId,
    },
    'private'
  );

  return {
    accessToken,
    categoryId,
    ownerId,
    productId,
    slug,
    storefrontId,
    unitId,
    warehouseId,
    workspaceId,
  };
}

export async function deleteStorefrontCacheFixture(
  request: APIRequestContext,
  fixture: Fixture
) {
  for (const [table, schema] of [
    ['inventory_storefront_listings', 'private'],
    ['inventory_storefronts', 'private'],
    ['inventory_products', 'private'],
    ['inventory_warehouses', 'private'],
    ['inventory_units', 'private'],
    ['inventory_owners', 'private'],
    ['workspace_products', 'public'],
    ['product_categories', 'public'],
    ['workspace_members', 'public'],
    ['workspace_secrets', 'public'],
  ] as const) {
    await request.delete(
      `${SUPABASE_URL}/rest/v1/${table}?ws_id=eq.${fixture.workspaceId}`,
      { failOnStatusCode: false, headers: serviceHeaders(schema) }
    );
  }
  await request.delete(
    `${SUPABASE_URL}/rest/v1/workspaces?id=eq.${fixture.workspaceId}`,
    { failOnStatusCode: false, headers: serviceHeaders() }
  );
}
