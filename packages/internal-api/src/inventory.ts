import type { InventoryOwner } from '@tuturuuu/types/primitives/InventoryOwner';
import type { Product } from '@tuturuuu/types/primitives/Product';
import type { ProductBatch } from '@tuturuuu/types/primitives/ProductBatch';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import type { ProductSupplier } from '@tuturuuu/types/primitives/ProductSupplier';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQuery,
} from './client';

export type InventoryStorefrontStatus =
  | 'draft'
  | 'published'
  | 'paused'
  | 'archived';

export type InventoryStorefrontVisibility = 'private' | 'public';

export type InventoryListingStatus =
  | 'draft'
  | 'published'
  | 'paused'
  | 'archived';

export type InventoryBundleStatus = 'draft' | 'active' | 'paused' | 'archived';

export type InventoryCheckoutStatus =
  | 'reserved'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type InventoryStorefront = {
  id: string;
  wsId: string;
  slug: string;
  name: string;
  description: string | null;
  status: InventoryStorefrontStatus;
  visibility: InventoryStorefrontVisibility;
  heroImageUrl: string | null;
  accentColor: string | null;
  currency: string;
  listingsCount?: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InventoryStorefrontListing = {
  id: string;
  storefrontId: string;
  wsId: string;
  listingType: 'product' | 'bundle';
  productId: string | null;
  bundleId: string | null;
  unitId: string | null;
  warehouseId: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  compareAtPrice: number | null;
  status: InventoryListingStatus;
  sortOrder: number;
  maxPerOrder: number;
  availableQuantity?: number;
  unitName?: string | null;
  warehouseName?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InventoryBundleComponent = {
  id: string;
  bundleId: string;
  productId: string;
  unitId: string;
  warehouseId: string;
  quantity: number;
  productName?: string | null;
  unitName?: string | null;
  warehouseName?: string | null;
};

export type InventoryBundle = {
  id: string;
  wsId: string;
  storefrontId: string | null;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  status: InventoryBundleStatus;
  maxPerOrder: number;
  availableQuantity?: number;
  components: InventoryBundleComponent[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type InventoryCheckoutLine = {
  id: string;
  listingId: string | null;
  bundleId: string | null;
  productId: string;
  unitId: string;
  warehouseId: string;
  title: string;
  quantity: number;
  unitPrice: number;
  subtotalAmount: number;
};

export type InventoryCheckoutSession = {
  id: string;
  wsId: string;
  publicToken: string;
  status: InventoryCheckoutStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  note: string | null;
  currency: string;
  subtotalAmount: number;
  platformFeeAmount: number;
  processingFeeEstimateAmount: number;
  conversionFeeEstimateAmount: number;
  totalAmount: number;
  expiresAt: string | null;
  completedAt: string | null;
  financeInvoiceId: string | null;
  polarCheckoutId: string | null;
  polarCheckoutUrl: string | null;
  polarEnvironment: InventoryPolarEnvironment | null;
  polarOrderId: string | null;
  polarProductId: string | null;
  polarStatus: InventoryPolarCheckoutStatus | null;
  lines: InventoryCheckoutLine[];
};

export type InventoryPolarEnvironment = 'production' | 'sandbox';

export type InventoryPolarCheckoutStatus =
  | 'cancelled'
  | 'checkout_created'
  | 'expired'
  | 'failed'
  | 'paid'
  | 'pending';

export type InventoryPolarIntegrationStatus = 'error' | 'pending' | 'ready';

export type InventoryPolarIntegration = {
  environment: InventoryPolarEnvironment;
  accessTokenLast4: string | null;
  accessTokenFingerprint: string | null;
  polarProductId: string | null;
  polarProductName: string;
  status: InventoryPolarIntegrationStatus;
  lastValidatedAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

export type InventoryPolarSettings = {
  testingEnvironment: InventoryPolarEnvironment;
  productionEnvironment: InventoryPolarEnvironment;
  integrations: InventoryPolarIntegration[];
};

export type InventoryPolarSettingsPayload = {
  environment?: InventoryPolarEnvironment;
  accessToken?: string;
  testingEnvironment?: InventoryPolarEnvironment;
  productionEnvironment?: InventoryPolarEnvironment;
};

export type InventoryOverviewResponse = {
  category_breakdown?: Array<Record<string, unknown>>;
  low_stock_products?: Array<Record<string, unknown>>;
  owner_breakdown?: Array<Record<string, unknown>>;
  realtime_enabled?: boolean;
  recent_sales?: Array<Record<string, unknown>>;
  totals?: Record<string, number>;
};

export type InventoryProductSummary = {
  archived?: boolean;
  category?: string | null;
  id: string;
  inventory?: Array<Record<string, unknown>>;
  manufacturer_id?: string | null;
  manufacturer?: string | null;
  min_amount?: number | null;
  name: string;
  owner?: { name?: string | null } | null;
  stock?: Array<Record<string, unknown>>;
  unit?: string | null;
  warehouse?: string | null;
};

export type InventoryManufacturer = {
  id: string;
  ws_id: string;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type InventoryUnit = {
  id: string;
  ws_id: string;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type InventorySaleSummary = {
  completed_at: string | null;
  created_at: string | null;
  customer_name: string | null;
  id: string;
  items_count: number;
  paid_amount: number;
  total_quantity: number;
};

export type InventoryAuditLogSummary = {
  actor_auth_uid?: string | null;
  created_at: string | null;
  entity_id?: string | null;
  entity_kind: string;
  entity_label?: string | null;
  event_kind: string;
  id: string;
  summary: string;
};

export type InventoryStorefrontListQuery = {
  q?: string;
  status?: InventoryStorefrontStatus | 'all';
  page?: number;
  pageSize?: number;
};

export type InventoryBundleListQuery = {
  q?: string;
  status?: InventoryBundleStatus | 'all';
  page?: number;
  pageSize?: number;
};

export type InventoryCheckoutListQuery = {
  q?: string;
  status?: InventoryCheckoutStatus | 'all';
  page?: number;
  pageSize?: number;
};

export type InventoryCatalogListQuery = {
  categoryId?: string;
  manufacturerId?: string;
  page?: number;
  pageSize?: number;
  q?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: 'active' | 'archived' | 'all';
};

export type InventoryNamedListQuery = {
  q?: string;
  page?: number;
  pageSize?: number;
};

export type InventoryManufacturerPayload = {
  name: string;
};

export type InventoryUnitPayload = {
  name: string;
};

export type InventoryOffsetListQuery = {
  limit?: number;
  offset?: number;
};

export type InventoryStorefrontPayload = {
  slug: string;
  name: string;
  description?: string | null;
  status?: InventoryStorefrontStatus;
  visibility?: InventoryStorefrontVisibility;
  heroImageUrl?: string | null;
  accentColor?: string | null;
  currency?: string;
};

export type InventoryStorefrontListingPayload = {
  listingType?: 'product' | 'bundle';
  productId?: string | null;
  bundleId?: string | null;
  unitId?: string | null;
  warehouseId?: string | null;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  compareAtPrice?: number | null;
  status?: InventoryListingStatus;
  sortOrder?: number;
  maxPerOrder?: number;
};

export type InventoryBundlePayload = {
  storefrontId?: string | null;
  slug: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  status?: InventoryBundleStatus;
  maxPerOrder?: number;
  components?: Array<{
    productId: string;
    unitId: string;
    warehouseId: string;
    quantity: number;
  }>;
};

export type InventoryCheckoutCreatePayload = {
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  note?: string | null;
  lines: Array<{
    listingId?: string;
    bundleId?: string;
    quantity: number;
  }>;
};

export type InventoryListResponse<T> = {
  data: T[];
  count: number;
};

export type InventoryProductFormOptionsResponse = {
  categories: ProductCategory[];
  financeCategories: TransactionCategory[];
  manufacturers: InventoryManufacturer[];
  owners: InventoryOwner[];
  units: ProductUnit[];
  warehouses: ProductWarehouse[];
};

export type InventoryStatisticsResponse = {
  batches: number;
  categories: number;
  inventoryProducts: number;
  products: number;
  promotions: number;
  suppliers: number;
  units: number;
  warehouses: number;
};

export type InventoryPublicStorefrontResponse = {
  storefront: InventoryStorefront;
  listings: InventoryStorefrontListing[];
  bundles: InventoryBundle[];
};

export type InventoryCheckoutResponse = {
  checkout: InventoryCheckoutSession;
  checkoutUrl: string | null;
};

function workspaceInventoryPath(wsId: string, suffix: string) {
  return `/api/v1/workspaces/${encodePathSegment(wsId)}/inventory${suffix}`;
}

function workspacePath(wsId: string, suffix: string) {
  return `/api/v1/workspaces/${encodePathSegment(wsId)}${suffix}`;
}

function workspaceProductUnitsPath(wsId: string, suffix = '') {
  return `/api/v1/workspaces/${encodePathSegment(wsId)}/product-units${suffix}`;
}

function publicStorefrontPath(slug: string, suffix = '') {
  return `/api/v1/inventory/storefronts/${encodePathSegment(slug)}${suffix}`;
}

function asQuery(
  query?: Record<string, unknown>
): InternalApiQuery | undefined {
  if (!query) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined)
  ) as InternalApiQuery;
}

function jsonHeaders(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);
  if (!nextHeaders.has('Content-Type')) {
    nextHeaders.set('Content-Type', 'application/json');
  }
  return nextHeaders;
}

function paginatedQuery(query?: InventoryNamedListQuery) {
  return asQuery({
    ...query,
    response: 'paginated',
  });
}

export function listInventoryStorefronts(
  wsId: string,
  query?: InventoryStorefrontListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<InventoryStorefront>
  >(workspaceInventoryPath(wsId, '/storefronts'), {
    cache: 'no-store',
    query: asQuery(query),
  });
}

export function getInventoryStatistics(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryStatisticsResponse>(
    workspaceInventoryPath(wsId, '/statistics'),
    { cache: 'no-store' }
  );
}

export function getInventoryOverview(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryOverviewResponse>(
    workspaceInventoryPath(wsId, '/overview'),
    { cache: 'no-store' }
  );
}

export function getInventoryProduct(
  wsId: string,
  productId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<Product>(
    workspacePath(wsId, `/products/${encodePathSegment(productId)}`),
    { cache: 'no-store' }
  );
}

export function getInventoryProductFormOptions(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(
    options
  ).json<InventoryProductFormOptionsResponse>(
    workspaceInventoryPath(wsId, '/product-form-options'),
    { cache: 'no-store' }
  );
}

export function listInventoryProducts(
  wsId: string,
  query?: InventoryCatalogListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<InventoryProductSummary>
  >(workspaceInventoryPath(wsId, '/products'), {
    cache: 'no-store',
    query: asQuery(query),
  });
}

export function listInventoryProductCategories(
  wsId: string,
  query?: InventoryNamedListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<ProductCategory>
  >(workspacePath(wsId, '/product-categories'), {
    cache: 'no-store',
    query: paginatedQuery(query),
  });
}

export function listInventoryWarehouses(
  wsId: string,
  query?: InventoryNamedListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<ProductWarehouse>
  >(workspacePath(wsId, '/product-warehouses'), {
    cache: 'no-store',
    query: paginatedQuery(query),
  });
}

export function listInventorySuppliers(
  wsId: string,
  query?: InventoryNamedListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<ProductSupplier>
  >(workspacePath(wsId, '/product-suppliers'), {
    cache: 'no-store',
    query: paginatedQuery(query),
  });
}

export function listInventoryBatches(
  wsId: string,
  query?: InventoryNamedListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<ProductBatch>
  >(workspaceInventoryPath(wsId, '/batches'), {
    cache: 'no-store',
    query: paginatedQuery(query),
  });
}

export function listInventoryPromotions(
  wsId: string,
  query?: InventoryNamedListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<ProductPromotion>
  >(workspacePath(wsId, '/promotions'), {
    cache: 'no-store',
    query: asQuery({
      ...query,
      inventoryOnly: true,
      response: 'paginated',
    }),
  });
}

export function listInventoryManufacturers(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventoryManufacturer[];
  }>(workspaceInventoryPath(wsId, '/manufacturers'), {
    cache: 'no-store',
  });
}

export function listInventoryManufacturersPage(
  wsId: string,
  query?: InventoryNamedListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<InventoryManufacturer>
  >(workspaceInventoryPath(wsId, '/manufacturers'), {
    cache: 'no-store',
    query: paginatedQuery(query),
  });
}

export function listInventoryUnits(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryUnit[]>(
    workspaceProductUnitsPath(wsId),
    {
      cache: 'no-store',
    }
  );
}

export function listInventoryUnitsPage(
  wsId: string,
  query?: InventoryNamedListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryListResponse<ProductUnit>>(
    workspaceProductUnitsPath(wsId),
    {
      cache: 'no-store',
      query: paginatedQuery(query),
    }
  );
}

export function listInventorySales(
  wsId: string,
  query?: InventoryOffsetListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<InventorySaleSummary>
  >(workspaceInventoryPath(wsId, '/sales'), {
    cache: 'no-store',
    query: asQuery(query),
  });
}

export function listInventoryAuditLogs(
  wsId: string,
  query?: InventoryOffsetListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<InventoryAuditLogSummary>
  >(workspaceInventoryPath(wsId, '/audit-logs'), {
    cache: 'no-store',
    query: asQuery(query),
  });
}

export function createInventoryStorefront(
  wsId: string,
  payload: InventoryStorefrontPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryStorefront }>(
    workspaceInventoryPath(wsId, '/storefronts'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function createInventoryManufacturer(
  wsId: string,
  payload: InventoryManufacturerPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryManufacturer }>(
    workspaceInventoryPath(wsId, '/manufacturers'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function createInventoryUnit(
  wsId: string,
  payload: InventoryUnitPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventoryUnit;
    message: string;
  }>(workspaceProductUnitsPath(wsId), {
    body: JSON.stringify(payload),
    headers: jsonHeaders(options?.defaultHeaders),
    method: 'POST',
  });
}

export function updateInventoryManufacturer(
  wsId: string,
  manufacturerId: string,
  payload: Partial<InventoryManufacturerPayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryManufacturer }>(
    workspaceInventoryPath(
      wsId,
      `/manufacturers/${encodePathSegment(manufacturerId)}`
    ),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PATCH',
    }
  );
}

export function updateInventoryUnit(
  wsId: string,
  unitId: string,
  payload: Partial<InventoryUnitPayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventoryUnit;
    message: string;
  }>(workspaceProductUnitsPath(wsId, `/${encodePathSegment(unitId)}`), {
    body: JSON.stringify(payload),
    headers: jsonHeaders(options?.defaultHeaders),
    method: 'PUT',
  });
}

export function deleteInventoryManufacturer(
  wsId: string,
  manufacturerId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    workspaceInventoryPath(
      wsId,
      `/manufacturers/${encodePathSegment(manufacturerId)}`
    ),
    {
      headers: options?.defaultHeaders,
      method: 'DELETE',
    }
  );
}

export function deleteInventoryUnit(
  wsId: string,
  unitId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    workspaceProductUnitsPath(wsId, `/${encodePathSegment(unitId)}`),
    {
      headers: options?.defaultHeaders,
      method: 'DELETE',
    }
  );
}

export function updateInventoryStorefront(
  wsId: string,
  storefrontId: string,
  payload: Partial<InventoryStorefrontPayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryStorefront }>(
    workspaceInventoryPath(
      wsId,
      `/storefronts/${encodePathSegment(storefrontId)}`
    ),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PATCH',
    }
  );
}

export function listInventoryStorefrontListings(
  wsId: string,
  storefrontId: string,
  query?: { status?: InventoryListingStatus | 'all' },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<InventoryStorefrontListing>
  >(
    workspaceInventoryPath(
      wsId,
      `/storefronts/${encodePathSegment(storefrontId)}/listings`
    ),
    {
      cache: 'no-store',
      query: asQuery(query),
    }
  );
}

export function createInventoryStorefrontListing(
  wsId: string,
  storefrontId: string,
  payload: InventoryStorefrontListingPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventoryStorefrontListing;
  }>(
    workspaceInventoryPath(
      wsId,
      `/storefronts/${encodePathSegment(storefrontId)}/listings`
    ),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function listInventoryBundles(
  wsId: string,
  query?: InventoryBundleListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<InventoryBundle>
  >(workspaceInventoryPath(wsId, '/bundles'), {
    cache: 'no-store',
    query: asQuery(query),
  });
}

export function createInventoryBundle(
  wsId: string,
  payload: InventoryBundlePayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryBundle }>(
    workspaceInventoryPath(wsId, '/bundles'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function updateInventoryBundle(
  wsId: string,
  bundleId: string,
  payload: Partial<InventoryBundlePayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryBundle }>(
    workspaceInventoryPath(wsId, `/bundles/${encodePathSegment(bundleId)}`),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PATCH',
    }
  );
}

export function listInventoryCheckouts(
  wsId: string,
  query?: InventoryCheckoutListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<InventoryCheckoutSession>
  >(workspaceInventoryPath(wsId, '/checkouts'), {
    cache: 'no-store',
    query: asQuery(query),
  });
}

export function getInventoryPolarSettings(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryPolarSettings>(
    workspaceInventoryPath(wsId, '/polar-settings'),
    { cache: 'no-store' }
  );
}

export function updateInventoryPolarSettings(
  wsId: string,
  payload: InventoryPolarSettingsPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryPolarSettings>(
    workspaceInventoryPath(wsId, '/polar-settings'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PUT',
    }
  );
}

export function getInventoryPublicStorefront(
  slug: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryPublicStorefrontResponse>(
    publicStorefrontPath(slug),
    { cache: 'no-store' }
  );
}

export function createInventoryCheckoutSession(
  slug: string,
  payload: InventoryCheckoutCreatePayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryCheckoutResponse>(
    publicStorefrontPath(slug, '/checkouts'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function getInventoryPublicOrder(
  publicToken: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    order: InventoryCheckoutSession;
  }>(`/api/v1/inventory/orders/${encodePathSegment(publicToken)}`, {
    cache: 'no-store',
  });
}
