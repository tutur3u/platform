import type {
  InventoryBundle,
  InventoryBundleComponent,
  InventoryBundleStatus,
  InventoryCheckoutSession,
  InventoryCheckoutStatus,
  InventoryListingStatus,
  InventoryPolarCheckoutStatus,
  InventoryPolarEnvironment,
  InventoryStorefront,
  InventoryStorefrontCheckoutMode,
  InventoryStorefrontListing,
  InventoryStorefrontStatus,
  InventoryStorefrontVisibility,
} from '@tuturuuu/internal-api/inventory';

export type StorefrontRow = {
  accent_color: string | null;
  created_at: string | null;
  currency: string;
  checkout_mode: InventoryStorefrontCheckoutMode | null;
  description: string | null;
  hero_image_url: string | null;
  theme_preset: InventoryStorefront['themePreset'];
  layout_style: InventoryStorefront['layoutStyle'];
  surface_style: InventoryStorefront['surfaceStyle'];
  corner_style: InventoryStorefront['cornerStyle'];
  show_inventory_badges: boolean | null;
  id: string;
  listings_count: number;
  name: string;
  slug: string;
  status: InventoryStorefrontStatus;
  updated_at: string | null;
  visibility: InventoryStorefrontVisibility;
  ws_id: string;
};

export type ListingRow = {
  available_quantity: number | null;
  bundle_id: string | null;
  compare_at_price: number | null;
  created_at: string | null;
  description: string | null;
  id: string;
  image_url: string | null;
  listing_type: 'product' | 'bundle';
  max_per_order: number;
  price: number;
  product_id: string | null;
  sort_order: number;
  status: InventoryListingStatus;
  storefront_id: string;
  title: string;
  unit_id: string | null;
  unit_name: string | null;
  updated_at: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  ws_id: string;
};

export type BundleRow = {
  available_quantity: number | null;
  created_at: string | null;
  description: string | null;
  id: string;
  image_url: string | null;
  max_per_order: number;
  name: string;
  price: number;
  slug: string;
  status: InventoryBundleStatus;
  storefront_id: string | null;
  updated_at: string | null;
  ws_id: string;
};

export type BundleComponentRow = {
  bundle_id: string;
  id: string;
  product_id: string;
  product_name: string | null;
  quantity: number;
  unit_id: string;
  unit_name: string | null;
  warehouse_id: string;
  warehouse_name: string | null;
};

export type CheckoutRow = {
  completed_at: string | null;
  conversion_fee_estimate_amount: number;
  currency: string;
  customer_email: string;
  customer_name: string;
  customer_phone: string | null;
  expires_at: string | null;
  finance_invoice_id: string | null;
  id: string;
  note: string | null;
  platform_fee_amount: number;
  polar_checkout_id: string | null;
  polar_checkout_url: string | null;
  polar_environment: InventoryPolarEnvironment | null;
  polar_order_id: string | null;
  polar_product_id: string | null;
  polar_status: InventoryPolarCheckoutStatus | null;
  processing_fee_estimate_amount: number;
  public_token: string;
  status: InventoryCheckoutStatus;
  subtotal_amount: number;
  total_amount: number;
  ws_id: string;
};

export type CheckoutLineRow = {
  bundle_id: string | null;
  checkout_session_id: string;
  id: string;
  listing_id: string | null;
  product_id: string;
  quantity: number;
  subtotal_amount: number;
  title: string;
  unit_id: string;
  unit_price: number;
  warehouse_id: string;
};

export type ListQuery<TStatus extends string> = {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: TStatus | 'all';
};

export function mapStorefront(row: StorefrontRow): InventoryStorefront {
  return {
    accentColor: row.accent_color,
    createdAt: row.created_at,
    currency: row.currency,
    checkoutMode: row.checkout_mode ?? 'polar',
    description: row.description,
    heroImageUrl: row.hero_image_url,
    themePreset: row.theme_preset ?? 'minimal',
    layoutStyle: row.layout_style ?? 'grid',
    surfaceStyle: row.surface_style ?? 'solid',
    cornerStyle: row.corner_style ?? 'rounded',
    showInventoryBadges: row.show_inventory_badges ?? true,
    id: row.id,
    listingsCount: row.listings_count,
    name: row.name,
    slug: row.slug,
    status: row.status,
    updatedAt: row.updated_at,
    visibility: row.visibility,
    wsId: row.ws_id,
  };
}

export function mapListing(row: ListingRow): InventoryStorefrontListing {
  return {
    availableQuantity: row.available_quantity ?? undefined,
    bundleId: row.bundle_id,
    compareAtPrice: row.compare_at_price,
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    imageUrl: row.image_url,
    listingType: row.listing_type,
    maxPerOrder: row.max_per_order,
    price: row.price,
    productId: row.product_id,
    sortOrder: row.sort_order,
    status: row.status,
    storefrontId: row.storefront_id,
    title: row.title,
    unitId: row.unit_id,
    unitName: row.unit_name,
    updatedAt: row.updated_at,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name,
    wsId: row.ws_id,
  };
}

export function mapComponent(
  row: BundleComponentRow
): InventoryBundleComponent {
  return {
    bundleId: row.bundle_id,
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: row.quantity,
    unitId: row.unit_id,
    unitName: row.unit_name,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name,
  };
}

export function mapBundle(
  row: BundleRow,
  componentsByBundleId: Map<string, InventoryBundleComponent[]>
): InventoryBundle {
  return {
    availableQuantity: row.available_quantity ?? undefined,
    components: componentsByBundleId.get(row.id) ?? [],
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    imageUrl: row.image_url,
    maxPerOrder: row.max_per_order,
    name: row.name,
    price: row.price,
    slug: row.slug,
    status: row.status,
    storefrontId: row.storefront_id,
    updatedAt: row.updated_at,
    wsId: row.ws_id,
  };
}

export function mapCheckout(
  row: CheckoutRow,
  lines: CheckoutLineRow[]
): InventoryCheckoutSession {
  return {
    completedAt: row.completed_at,
    conversionFeeEstimateAmount: row.conversion_fee_estimate_amount,
    currency: row.currency,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    expiresAt: row.expires_at,
    financeInvoiceId: row.finance_invoice_id,
    id: row.id,
    wsId: row.ws_id,
    lines: lines.map((line) => ({
      bundleId: line.bundle_id,
      id: line.id,
      listingId: line.listing_id,
      productId: line.product_id,
      quantity: line.quantity,
      subtotalAmount: line.subtotal_amount,
      title: line.title,
      unitId: line.unit_id,
      unitPrice: line.unit_price,
      warehouseId: line.warehouse_id,
    })),
    note: row.note,
    platformFeeAmount: row.platform_fee_amount,
    polarCheckoutId: row.polar_checkout_id,
    polarCheckoutUrl: row.polar_checkout_url,
    polarEnvironment: row.polar_environment,
    polarOrderId: row.polar_order_id,
    polarProductId: row.polar_product_id,
    polarStatus: row.polar_status,
    processingFeeEstimateAmount: row.processing_fee_estimate_amount,
    publicToken: row.public_token,
    status: row.status,
    subtotalAmount: row.subtotal_amount,
    totalAmount: row.total_amount,
  };
}
