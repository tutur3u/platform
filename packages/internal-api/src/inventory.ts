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
  lines: InventoryCheckoutLine[];
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
  manufacturer?: string | null;
  min_amount?: number | null;
  name: string;
  owner?: { name?: string | null } | null;
  stock?: Array<Record<string, unknown>>;
  unit?: string | null;
  warehouse?: string | null;
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
  page?: number;
  pageSize?: number;
  q?: string;
  status?: 'active' | 'archived' | 'all';
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

export type InventoryPublicStorefrontResponse = {
  storefront: InventoryStorefront;
  listings: InventoryStorefrontListing[];
  bundles: InventoryBundle[];
};

export type InventoryCheckoutResponse = {
  checkout: InventoryCheckoutSession;
};

function workspaceInventoryPath(wsId: string, suffix: string) {
  return `/api/v1/workspaces/${encodePathSegment(wsId)}/inventory${suffix}`;
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

export function listInventoryStorefronts(
  wsId: string,
  query?: InventoryStorefrontListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<InventoryStorefront>
  >(workspaceInventoryPath(wsId, '/storefronts'), {
    query: asQuery(query),
  });
}

export function getInventoryOverview(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryOverviewResponse>(
    workspaceInventoryPath(wsId, '/overview')
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
    query: asQuery(query),
  });
}

export function listInventorySales(
  wsId: string,
  query?: InventoryOffsetListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<InventorySaleSummary>
  >(workspaceInventoryPath(wsId, '/sales'), {
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
    query: asQuery(query),
  });
}

export function getInventoryPublicStorefront(
  slug: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryPublicStorefrontResponse>(
    publicStorefrontPath(slug)
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
  }>(`/api/v1/inventory/orders/${encodePathSegment(publicToken)}`);
}
