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
import {
  parseSignedUploadPayload,
  uploadFileWithSignedUrl,
  type WorkspaceStorageUploadProgress,
  type WorkspaceUploadUrlResponse,
} from './storage';

export const SUPPORTED_POLAR_CURRENCIES = [
  'AED',
  'ALL',
  'AMD',
  'AOA',
  'ARS',
  'AUD',
  'AWG',
  'AZN',
  'BAM',
  'BBD',
  'BDT',
  'BIF',
  'BMD',
  'BND',
  'BOB',
  'BRL',
  'BSD',
  'BWP',
  'BZD',
  'CAD',
  'CDF',
  'CHF',
  'CLP',
  'CNY',
  'COP',
  'CRC',
  'CVE',
  'CZK',
  'DJF',
  'DKK',
  'DOP',
  'DZD',
  'EGP',
  'ETB',
  'EUR',
  'FJD',
  'FKP',
  'GBP',
  'GEL',
  'GIP',
  'GMD',
  'GNF',
  'GTQ',
  'GYD',
  'HKD',
  'HNL',
  'HTG',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'ISK',
  'JMD',
  'JPY',
  'KES',
  'KGS',
  'KHR',
  'KMF',
  'KRW',
  'KYD',
  'KZT',
  'LAK',
  'LKR',
  'LRD',
  'LSL',
  'MAD',
  'MDL',
  'MGA',
  'MKD',
  'MNT',
  'MOP',
  'MUR',
  'MVR',
  'MWK',
  'MXN',
  'MYR',
  'MZN',
  'NAD',
  'NGN',
  'NIO',
  'NOK',
  'NPR',
  'NZD',
  'PAB',
  'PEN',
  'PGK',
  'PHP',
  'PKR',
  'PLN',
  'PYG',
  'QAR',
  'RON',
  'RSD',
  'RWF',
  'SAR',
  'SBD',
  'SCR',
  'SEK',
  'SGD',
  'SHP',
  'SOS',
  'SRD',
  'SZL',
  'THB',
  'TJS',
  'TOP',
  'TRY',
  'TTD',
  'TWD',
  'TZS',
  'UAH',
  'UGX',
  'USD',
  'UYU',
  'UZS',
  'VND',
  'VUV',
  'WST',
  'XAF',
  'XCD',
  'XCG',
  'XOF',
  'XPF',
  'YER',
  'ZAR',
  'ZMW',
] as const;

export type SupportedPolarCurrency =
  (typeof SUPPORTED_POLAR_CURRENCIES)[number];

/**
 * Normalizes a currency code for the Polar API boundary.
 *
 * Internally we store/display currencies uppercase (`USD`), but the Polar SDK's
 * Zod enum only accepts lowercase ISO 4217 codes (`usd`). Sending the uppercase
 * value makes Polar reject the checkout/price/discount with an
 * `invalid_value` error. Always pass currency through this helper right before
 * a Polar call. Unknown/empty values fall back to `usd`.
 */
export function toPolarCurrency(
  currency: string | null | undefined
): Lowercase<SupportedPolarCurrency> {
  const normalized = (currency ?? 'USD').trim().toUpperCase();
  const supported = (SUPPORTED_POLAR_CURRENCIES as readonly string[]).includes(
    normalized
  )
    ? (normalized as SupportedPolarCurrency)
    : 'USD';
  return supported.toLowerCase() as Lowercase<SupportedPolarCurrency>;
}

export type InventoryStorefrontStatus =
  | 'draft'
  | 'published'
  | 'paused'
  | 'archived';

export type InventoryStorefrontVisibility = 'private' | 'public';

export type InventoryStorefrontThemePreset =
  | 'boutique'
  | 'catalog'
  | 'editorial'
  | 'minimal';

export type InventoryStorefrontLayoutStyle = 'feature' | 'grid' | 'list';

export type InventoryStorefrontSurfaceStyle = 'glass' | 'soft' | 'solid';

export type InventoryStorefrontCornerStyle = 'compact' | 'rounded' | 'soft';

export type InventoryStorefrontCheckoutMode =
  | 'disabled'
  | 'polar'
  | 'square_terminal'
  | 'simulated';

export type InventoryStorefrontSectionType =
  | 'cover'
  | 'featured_banners'
  | 'featured_listings'
  | 'product_grid'
  | 'promo'
  | 'text';

export type InventoryStorefrontSectionStatus = 'draft' | 'hidden' | 'published';

export type InventoryStorefrontAnalyticsEventType =
  | 'add_to_cart'
  | 'banner_click'
  | 'checkout_completed'
  | 'checkout_created'
  | 'checkout_failed'
  | 'checkout_started'
  | 'product_view'
  | 'remove_from_cart'
  | 'view';

export type InventoryListingStatus =
  | 'draft'
  | 'published'
  | 'paused'
  | 'archived';

export type InventoryBundleStatus = 'draft' | 'active' | 'paused' | 'archived';

export type InventoryBundlePricingMode = 'fixed_price' | 'selected_items';

export type InventoryBundleCategoryCandidateScope =
  | 'published_listings'
  | 'all_stock';

export type InventoryBundleCategoryDiscountStrategy = 'none' | 'cheapest_free';

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
  coverImageUrl: string | null;
  heroImageUrl: string | null;
  accentColor: string | null;
  currency: string;
  checkoutMode: InventoryStorefrontCheckoutMode;
  themePreset: InventoryStorefrontThemePreset;
  layoutStyle: InventoryStorefrontLayoutStyle;
  surfaceStyle: InventoryStorefrontSurfaceStyle;
  cornerStyle: InventoryStorefrontCornerStyle;
  showInventoryBadges: boolean;
  analyticsEnabled: boolean;
  polarEnvironment?: InventoryPolarEnvironment;
  sections: InventoryStorefrontSection[];
  listingsCount?: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InventoryStorefrontSectionItem = {
  id: string;
  sectionId: string;
  storefrontId: string;
  wsId: string;
  listingId: string | null;
  bundleId: string | null;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  href: string | null;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InventoryStorefrontSection = {
  id: string;
  storefrontId: string;
  wsId: string;
  sectionType: InventoryStorefrontSectionType;
  status: InventoryStorefrontSectionStatus;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  href: string | null;
  sortOrder: number;
  metadata: Record<string, unknown>;
  items: InventoryStorefrontSectionItem[];
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
  polarProductId?: string | null;
  polarPriceId?: string | null;
  polarSyncStatus?: InventoryPolarSyncStatus;
  polarSyncedAt?: string | null;
  polarLastError?: string | null;
  options?: InventoryListingOptionGroup[];
  variants?: InventoryListingVariant[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type InventoryPolarSyncStatus =
  | 'pending'
  | 'synced'
  | 'error'
  | 'disabled';

export type InventoryVariantStatus = 'active' | 'hidden' | 'archived';

export type InventoryListingOptionValue = {
  id: string;
  label: string;
  sortOrder: number;
};

export type InventoryListingOptionGroup = {
  id: string;
  name: string;
  sortOrder: number;
  values: InventoryListingOptionValue[];
};

export type InventoryListingVariantOptionValue = {
  groupId: string;
  valueId: string;
  label: string;
};

export type InventoryListingVariant = {
  id: string;
  sku: string | null;
  title: string | null;
  productId: string;
  unitId: string;
  warehouseId: string;
  /** Resolved price in integer minor units (falls back to the listing price). */
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  sortOrder: number;
  status: InventoryVariantStatus;
  availableQuantity?: number | null;
  optionValues: InventoryListingVariantOptionValue[];
  polarSyncStatus?: InventoryPolarSyncStatus;
  polarSyncedAt?: string | null;
  polarLastError?: string | null;
};

export type InventoryOptionTemplateValue = {
  id: string;
  label: string;
  value: string | null;
  sortOrder: number;
};

export type InventoryOptionTemplateGroup = {
  id: string;
  name: string;
  sortOrder: number;
  values: InventoryOptionTemplateValue[];
};

export type InventoryOptionTemplate = {
  id: string;
  wsId: string;
  name: string;
  description: string | null;
  groups: InventoryOptionTemplateGroup[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type InventoryOptionTemplatePayload = {
  name: string;
  description?: string | null;
  groups: Array<{
    name: string;
    sortOrder?: number;
    values: Array<{
      label: string;
      value?: string | null;
      sortOrder?: number;
    }>;
  }>;
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

export type InventoryBundleCategoryCandidate = {
  selectionKind: 'listing' | 'variant' | 'stock';
  componentId: string;
  listingId: string | null;
  variantId: string | null;
  productId: string;
  unitId: string;
  warehouseId: string;
  title: string;
  imageUrl?: string | null;
  price: number;
  availableQuantity?: number | null;
  unitName?: string | null;
  warehouseName?: string | null;
};

export type InventoryBundleCategoryComponent = {
  id: string;
  bundleId: string;
  categoryId: string;
  categoryName?: string | null;
  quantityRequired: number;
  freeQuantity: number;
  discountStrategy: InventoryBundleCategoryDiscountStrategy;
  sortOrder?: number;
  candidateScope?: InventoryBundleCategoryCandidateScope;
  candidates?: InventoryBundleCategoryCandidate[];
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
  pricingMode: InventoryBundlePricingMode;
  categoryCandidateScope: InventoryBundleCategoryCandidateScope;
  status: InventoryBundleStatus;
  maxPerOrder: number;
  availableQuantity?: number;
  components: InventoryBundleComponent[];
  categoryComponents: InventoryBundleCategoryComponent[];
  polarProductId?: string | null;
  polarPriceId?: string | null;
  polarSyncStatus?: InventoryPolarSyncStatus;
  polarSyncedAt?: string | null;
  polarLastError?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InventoryCheckoutLine = {
  id: string;
  listingId: string | null;
  bundleId: string | null;
  variantId: string | null;
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
  checkoutProvider: InventoryStorefrontCheckoutMode | null;
  customerAuthUid: string | null;
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
  squareEnvironment: InventorySquareEnvironment | null;
  squareLocationId: string | null;
  squareDeviceId: string | null;
  squareOrderId: string | null;
  squareTerminalCheckoutId: string | null;
  squarePaymentId: string | null;
  squareReceiptUrl: string | null;
  squareStatus: InventorySquareTerminalCheckoutStatus | null;
  squareFailureReason: string | null;
  squareLastSyncedAt: string | null;
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
  webhookSecretLast4: string | null;
};

export type InventoryPolarSettings = {
  /**
   * Resolved workspace UUID (never the `personal` alias). Use this to build the
   * public Polar webhook URL — Polar calls it server-to-server with no session,
   * so an alias like `personal` would be unresolvable and fail verification.
   */
  wsId: string;
  testingEnvironment: InventoryPolarEnvironment;
  productionEnvironment: InventoryPolarEnvironment;
  integrations: InventoryPolarIntegration[];
};

export type InventoryPolarSettingsPayload = {
  environment?: InventoryPolarEnvironment;
  accessToken?: string;
  webhookSecret?: string;
  testingEnvironment?: InventoryPolarEnvironment;
  productionEnvironment?: InventoryPolarEnvironment;
};

export type InventorySquareEnvironment = 'production' | 'sandbox';

export type InventorySquareAuthMethod = 'manual' | 'oauth';

export type InventorySquareConnectionStatus =
  | 'error'
  | 'pending'
  | 'ready'
  | 'revoked';

export type InventorySquareTerminalCheckoutStatus =
  | 'cancel_requested'
  | 'canceled'
  | 'cancelled'
  | 'checkout_created'
  | 'completed'
  | 'expired'
  | 'failed'
  | 'in_progress'
  | 'paid'
  | 'pending';

export type InventorySquareReadinessIssue =
  | 'app_credentials_missing'
  | 'connection_missing'
  | 'device_missing'
  | 'location_missing'
  | 'scopes_missing'
  | 'webhook_signature_missing';

export type InventorySquareConnection = {
  environment: InventorySquareEnvironment;
  authMethod: InventorySquareAuthMethod;
  merchantId: string | null;
  accessTokenLast4: string | null;
  accessTokenFingerprint: string | null;
  refreshTokenLast4: string | null;
  tokenExpiresAt: string | null;
  scopes: string[];
  status: InventorySquareConnectionStatus;
  lastValidatedAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
  webhookSignatureKeyLast4: string | null;
};

export type InventorySquareAppCredential = {
  environment: InventorySquareEnvironment;
  applicationId: string | null;
  applicationSecretLast4: string | null;
  applicationSecretFingerprint: string | null;
  oauthRedirectUrl: string | null;
  webhookNotificationUrl: string | null;
  updatedAt: string | null;
};

export type InventorySquareSettings = {
  wsId: string;
  environment: InventorySquareEnvironment;
  locationId: string | null;
  locationName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  sandboxDeviceId: string | null;
  readiness: {
    ready: boolean;
    issues: InventorySquareReadinessIssue[];
  };
  appCredentials: InventorySquareAppCredential[];
  connections: InventorySquareConnection[];
};

export type InventorySquareSettingsPayload = {
  environment?: InventorySquareEnvironment;
  accessToken?: string;
  applicationId?: string;
  applicationSecret?: string;
  oauthRedirectUrl?: string | null;
  webhookNotificationUrl?: string | null;
  webhookSignatureKey?: string;
  locationId?: string | null;
  locationName?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  sandboxDeviceId?: string | null;
};

export type InventorySquareOAuthStartResponse = {
  authorizeUrl: string;
};

export type InventorySquareLocation = {
  id: string;
  name: string;
  status: string | null;
  country: string | null;
  currency: string | null;
};

export type InventorySquareDevice = {
  id: string;
  name: string;
  status: string | null;
  locationId: string | null;
  productType: string | null;
  code: string | null;
  pairedAt: string | null;
  updatedAt: string | null;
};

export type InventorySquareDeviceCode = {
  id: string;
  code: string;
  name: string | null;
  status: string | null;
  pairBy: string | null;
  locationId: string | null;
  productType: string | null;
};

export type InventorySquareTerminalCheckoutPayload = {
  checkoutId: string;
  deviceId?: string;
};

export type InventorySquareCatalogSyncDirection =
  | 'bidirectional'
  | 'from_square'
  | 'to_square';

export type InventorySquareCatalogSyncSummary = {
  centLevelPricesReady: boolean | null;
  conflicts: number;
  direction: InventorySquareCatalogSyncDirection;
  environment: InventorySquareEnvironment;
  inventoryPulled: number;
  inventoryPushed: number;
  itemsCreated: number;
  itemsPulled: number;
  itemsPushed: number;
  preservedRemoteDeletions: number;
  skipped: number;
  variationsPulled: number;
  variationsPushed: number;
};

export type InventorySquareCatalogLink = {
  lastError: string | null;
  lastSyncedAt: string | null;
  productId: string;
  productName: string;
  squareItemId: string;
  squareItemName: string | null;
  squareSku: string | null;
  squareVariationId: string;
  squareVariationName: string | null;
  status: 'active' | 'conflict' | 'error' | 'remote_deleted';
  syncOrigin: 'square' | 'tuturuuu';
  unitId: string;
  warehouseId: string;
};

export type InventorySquareCatalogSyncState = {
  environment: InventorySquareEnvironment;
  lastCatalogCursorAt: string | null;
  lastDirection: InventorySquareCatalogSyncDirection | null;
  lastError: string | null;
  lastInventorySyncAt: string | null;
  lastStatus: 'error' | 'idle' | 'partial' | 'running' | 'success';
  lastSummary: InventorySquareCatalogSyncSummary | null;
  links: InventorySquareCatalogLink[];
  updatedAt: string | null;
};

export type InventoryPolarSyncStatusCounts = {
  synced: number;
  pending: number;
  error: number;
  disabled: number;
  total: number;
};

export type InventoryStorefrontAnalytics = {
  days: number;
  funnel: Array<{ key: string; count: number }>;
  conversionRate: number;
};

export type InventoryPolarProductSyncSummary = {
  listings: InventoryPolarSyncStatusCounts;
  bundles: InventoryPolarSyncStatusCounts;
  items: Array<{
    kind: 'listing' | 'bundle';
    name: string;
    polarProductId: string | null;
    status: 'synced' | 'pending' | 'error' | 'disabled';
    syncedAt: string | null;
  }>;
  errors: Array<{
    kind: 'listing' | 'bundle';
    name: string;
    error: string;
    syncedAt: string | null;
  }>;
  lastSyncedAt: string | null;
};

export type InventoryOverviewResponse = {
  category_breakdown?: Array<Record<string, unknown>>;
  dashboard?: InventoryDashboardSnapshot | null;
  low_stock_products?: Array<Record<string, unknown>>;
  owner_breakdown?: Array<Record<string, unknown>>;
  realtime_enabled?: boolean;
  recent_sales?: Array<Record<string, unknown>>;
  totals?: Record<string, number>;
};

export type InventoryDashboardCounts = {
  products: number;
  stockRows: number;
  lowStock: number;
  categories: number;
  owners: number;
  manufacturers: number;
  units: number;
  warehouses: number;
  suppliers: number;
  batches: number;
  storefronts: number;
  publishedStorefronts: number;
  listings: number;
  publishedListings: number;
  bundles: number;
  activeBundles: number;
  checkouts: number;
  reservedCheckouts: number;
  staleCheckouts: number;
  sales: number;
  costingProfiles: number;
  polarReady: number;
  squareReady?: number;
  simulatedCheckoutStorefronts: number;
};

export type InventoryDashboardReadinessItem = {
  key: 'checkout' | 'costing' | 'products' | 'setup' | 'storefront';
  view: 'catalog' | 'commerce' | 'costing' | 'setup' | 'storefront';
  score: number;
  completed: number;
  total: number;
};

export type InventoryDashboardRisk = {
  kind: 'low_stock' | 'stale_checkout' | 'storefront_ready';
  severity: 'high' | 'medium' | 'low';
  view: InventoryOperatorDashboardView;
  entityId: string | null;
  label: string;
  detail: string | null;
  metric: number | null;
};

export type InventoryDashboardAction = {
  kind:
    | 'create_costing'
    | 'create_product'
    | 'publish_storefront'
    | 'resolve_low_stock'
    | 'setup_resources';
  view: InventoryOperatorDashboardView;
  priority: number;
};

export type InventoryDashboardTrendPoint = {
  date: string;
  revenue: number;
  quantity: number;
};

export type InventoryDashboardMixPoint = {
  label: string;
  revenue: number;
  quantity: number;
};

export type InventoryDashboardScenarioSummary = {
  profileId: string;
  profileName: string;
  scenarioId: string;
  scenarioName: string;
  grossMarginPercentage: number;
  breakEvenQuantity: number | null;
};

export type InventoryDashboardSnapshot = {
  counts: InventoryDashboardCounts;
  readiness: InventoryDashboardReadinessItem[];
  risks: InventoryDashboardRisk[];
  actions: InventoryDashboardAction[];
  analytics: {
    revenueTrend: InventoryDashboardTrendPoint[];
    categoryMix: InventoryDashboardMixPoint[];
    ownerMix: InventoryDashboardMixPoint[];
  };
  costing: {
    profilesCount: number;
    scenariosCount: number;
    averageMarginPercentage: number;
    lowestBreakEvenQuantity: number | null;
    bestScenario: InventoryDashboardScenarioSummary | null;
    weakestScenario: InventoryDashboardScenarioSummary | null;
  };
  storefrontHealth: {
    published: number;
    withoutPublishedListings: number;
    themeGaps: number;
    polarCheckout: number;
    squareTerminalCheckout?: number;
    simulatedCheckout: number;
    disabledCheckout: number;
  };
};

export type InventoryOperatorDashboardView =
  | 'catalog'
  | 'commerce'
  | 'costing'
  | 'setup'
  | 'stock'
  | 'storefront';

export type InventoryProductSummary = {
  archived?: boolean;
  avatar_url?: string | null;
  category?: string | null;
  category_id?: string | null;
  description?: string | null;
  finance_category_id?: string | null;
  id: string;
  inventory?: Array<Record<string, unknown>>;
  manufacturer_id?: string | null;
  manufacturer?: string | null;
  min_amount?: number | null;
  name: string;
  owner_id?: string | null;
  owner?: { id?: string | null; name?: string | null } | null;
  stock?: Array<Record<string, unknown>>;
  unit?: string | null;
  usage?: string | null;
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

export type InventoryProductInventoryItem = {
  warehouse_id: string;
  unit_id: string;
  amount: number | null;
  min_amount?: number;
  price: number;
  revenue_share_partner_id?: string | null;
  revenue_share_bps?: number;
  revenue_share_partner?: {
    id?: string | null;
    name?: string | null;
    avatar_url?: string | null;
    linked_workspace_user_id?: string | null;
  } | null;
};

export type InventoryStockChangeContext = {
  beneficiaryId?: string | null;
  note?: string | null;
};

export type InventoryStockMovementPerson = {
  id: string;
  name: string | null;
  email: string | null;
};

export type InventoryStockMovementRelation = {
  id: string;
  name: string | null;
};

export type InventoryStockMovement = {
  id: string;
  delta: number;
  direction: 'added' | 'removed';
  quantity: number;
  warehouseId: string;
  warehouse: InventoryStockMovementRelation | null;
  unitId: string;
  unit: InventoryStockMovementRelation | null;
  operatorId: string;
  operator: InventoryStockMovementPerson | null;
  beneficiaryId: string | null;
  beneficiary: InventoryStockMovementPerson | null;
  note: string | null;
  timestamp: string;
};

export type InventoryStockHistoryResponse = {
  data: InventoryStockMovement[];
  pagination: { hasMore: boolean; limit: number; offset: number };
};

export type InventoryStockBeneficiaryOption = InventoryStockMovementPerson;

export type InventoryStockBeneficiariesResponse = {
  data: InventoryStockBeneficiaryOption[];
};

export type InventoryProductPayload = {
  name: string;
  avatar_url?: string | null;
  manufacturer_id?: string | null;
  manufacturer?: string | null;
  description?: string;
  usage?: string;
  category_id: string;
  owner_id?: string;
  finance_category_id?: string | null;
  inventory?: InventoryProductInventoryItem[];
  archived?: boolean;
};

export type InventoryMediaUploadTarget =
  | 'bundle-image'
  | 'listing-image'
  | 'product-featured-image'
  | 'storefront-banner'
  | 'storefront-cover'
  | 'storefront-hero';

export type InventoryMediaUploadUrlResponse = WorkspaceUploadUrlResponse & {
  readUrl?: string;
  target: InventoryMediaUploadTarget;
};

export type InventoryMediaReadUrlResponse = {
  readUrl: string;
};

export type InventoryMediaUploadResult = {
  fullPath: string | null;
  path: string;
  target: InventoryMediaUploadTarget;
  url: string;
};

export type InventoryProductInventoryPayload = {
  changeContext?: InventoryStockChangeContext;
  inventory: InventoryProductInventoryItem[];
};

export type InventoryCategoryPayload = {
  name: string;
};

export type InventoryWarehousePayload = {
  name: string;
};

export type InventorySupplierPayload = {
  name: string;
};

export type InventoryOwnerPayload = {
  name: string;
  linked_workspace_user_id?: string | null;
  avatar_url?: string | null;
  archived?: boolean;
};

export type InventoryBatchPayload = {
  warehouse_id: string;
  supplier_id?: string | null;
  price?: number;
  total_diff?: number;
};

export type InventorySaleSource = 'checkout_session' | 'finance_invoice';

export type InventorySalesPeriodStatus = 'active' | 'archived';

export type InventorySalesPeriodProductScope =
  | 'all'
  | 'allowlist'
  | 'blocklist';

export type InventorySalesPeriod = {
  created_at: string;
  description: string | null;
  ends_at: string | null;
  id: string;
  name: string;
  product_ids: string[];
  product_scope: InventorySalesPeriodProductScope;
  sale_count: number;
  starts_at: string | null;
  status: InventorySalesPeriodStatus;
  updated_at: string;
  ws_id: string;
};

export type InventorySalesPeriodPayload = {
  description?: string | null;
  ends_at?: string | null;
  name: string;
  product_ids?: string[];
  product_scope?: InventorySalesPeriodProductScope;
  starts_at?: string | null;
};

export type InventorySaleSummary = {
  category_name?: string | null;
  completed_at: string | null;
  created_at: string | null;
  creator_name?: string | null;
  currency?: string | null;
  customer_name: string | null;
  id: string;
  items_count: number;
  note?: string | null;
  notice?: string | null;
  owners?: string[];
  paid_amount: number;
  period?: InventorySalesPeriod | null;
  polar_order_id?: string | null;
  public_token?: string | null;
  square_order_id?: string | null;
  source: InventorySaleSource;
  total_quantity: number;
  wallet_name?: string | null;
};

export type InventorySaleLine = {
  product_image_url?: string | null;
  product_id: string;
  product_name: string;
  owner_id: string | null;
  owner_name: string;
  unit_id: string;
  unit_name: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  price: number;
};

export type InventorySaleDetail = InventorySaleSummary & {
  notice: string | null;
  note: string | null;
  wallet_id: string | null;
  wallet_name: string | null;
  category_id: string | null;
  category_name: string | null;
  transaction_id: string | null;
  transaction_missing: boolean;
  customer_id: string | null;
  customer_name: string | null;
  creator_name: string | null;
  owners: string[];
  lines: InventorySaleLine[];
};

export type InventoryRevenueShareEarning = {
  partnerId: string;
  partnerName: string;
  avatarUrl?: string | null;
  revenueShareBps: number;
  splitPercent: number;
  currency: string;
  attributedRevenue: number;
  earnedAmount: number;
  unitsSold: number;
  salesCount: number;
  productCount: number;
  products: string[];
  firstSaleAt: string | null;
  lastSaleAt: string | null;
};

export type InventoryRevenueShareEarningsQuery = {
  partnerId?: string;
  q?: string;
  startAt?: string;
  endAt?: string;
  offset?: number;
  limit?: number;
};

export type InventorySaleUpdatePayload = {
  notice?: string | null;
  note?: string | null;
  wallet_id?: string | null;
  category_id?: string | null;
  products?: Array<{
    product_id: string;
    unit_id: string;
    warehouse_id: string;
    quantity: number;
    price: number;
  }>;
};

export type InventorySaleCreatePayload = {
  category_id: string;
  content: string;
  notes?: string;
  period_id?: string | null;
  products: Array<{
    category_id: string;
    price: number;
    product_id: string;
    quantity: number;
    unit_id: string;
    warehouse_id: string;
  }>;
  wallet_id: string;
};

export type InventorySaleCreateResponse = {
  data?: {
    category_id?: string | null;
    id?: string;
    products_count?: number;
    subtotal?: number;
    total?: number;
  };
  invoice_id: string;
  message: string;
  period_assignment_warning?: string;
};

export type InventoryAuditLogSummary = {
  auditRecordId: string;
  eventKind: string;
  entityKind: string;
  entityId: string | null;
  entityLabel: string | null;
  summary: string;
  changedFields: string[];
  fieldChanges: Array<{
    field: string;
    label: string;
    before: string | null;
    after: string | null;
  }>;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  actor: {
    authUid: string | null;
    workspaceUserId: string | null;
    displayName: string | null;
  };
  occurredAt: string | null;
  source: string | null;
};

export type InventoryAuditLogListQuery = InventoryOffsetListQuery & {
  dateFrom?: string;
  dateTo?: string;
  entityKind?: string;
  eventKind?: string;
  source?: string;
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

export type InventoryCostProfileListQuery = InventoryNamedListQuery & {
  status?: InventoryCostProfileStatus | 'all';
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

export type InventorySalesListQuery = InventoryOffsetListQuery & {
  period_id?: string;
  unassigned?: boolean;
};

export type InventoryOrderHistoryQuery = InventoryOffsetListQuery & {
  storeSlug?: string;
};

export type InventoryStorefrontPayload = {
  slug: string;
  name: string;
  description?: string | null;
  status?: InventoryStorefrontStatus;
  visibility?: InventoryStorefrontVisibility;
  coverImageUrl?: string | null;
  heroImageUrl?: string | null;
  accentColor?: string | null;
  currency?: string;
  checkoutMode?: InventoryStorefrontCheckoutMode;
  themePreset?: InventoryStorefrontThemePreset;
  layoutStyle?: InventoryStorefrontLayoutStyle;
  surfaceStyle?: InventoryStorefrontSurfaceStyle;
  cornerStyle?: InventoryStorefrontCornerStyle;
  showInventoryBadges?: boolean;
  analyticsEnabled?: boolean;
  polarEnvironment?: InventoryPolarEnvironment;
  sections?: InventoryStorefrontSectionPayload[];
};

export type InventoryStorefrontSectionItemPayload = {
  id?: string;
  listingId?: string | null;
  bundleId?: string | null;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  href?: string | null;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
};

export type InventoryStorefrontSectionPayload = {
  id?: string;
  sectionType: InventoryStorefrontSectionType;
  status?: InventoryStorefrontSectionStatus;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  href?: string | null;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
  items?: InventoryStorefrontSectionItemPayload[];
};

export type InventoryStorefrontAnalyticsEventPayload = {
  eventType: InventoryStorefrontAnalyticsEventType;
  listingId?: string | null;
  sectionId?: string | null;
  checkoutSessionId?: string | null;
  quantity?: number | null;
  metadata?: Record<string, unknown>;
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
  /** Copy an option template's groups/values onto this listing before saving. */
  applyOptionTemplateId?: string | null;
  options?: Array<{
    name: string;
    sortOrder?: number;
    values: Array<{ label: string; sortOrder?: number }>;
  }>;
  variants?: InventoryStorefrontListingVariantPayload[];
};

export type InventoryStorefrontListingVariantPayload = {
  id?: string;
  sku?: string | null;
  title?: string | null;
  productId: string;
  unitId: string;
  warehouseId: string;
  price?: number | null;
  compareAtPrice?: number | null;
  imageUrl?: string | null;
  sortOrder?: number;
  status?: InventoryVariantStatus;
  /** Maps an option group name to the selected value label for this variant. */
  optionValueLabels?: Record<string, string>;
};

export type InventoryBundlePayload = {
  storefrontId?: string | null;
  slug: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  pricingMode?: InventoryBundlePricingMode;
  categoryCandidateScope?: InventoryBundleCategoryCandidateScope;
  status?: InventoryBundleStatus;
  maxPerOrder?: number;
  components?: Array<{
    productId: string;
    unitId: string;
    warehouseId: string;
    quantity: number;
  }>;
  categoryComponents?: Array<{
    categoryId: string;
    quantityRequired: number;
    freeQuantity?: number;
    discountStrategy?: InventoryBundleCategoryDiscountStrategy;
    sortOrder?: number;
  }>;
};

export type InventoryCheckoutBundleSelectionItem = {
  listingId?: string | null;
  variantId?: string | null;
  productId?: string | null;
  unitId?: string | null;
  warehouseId?: string | null;
  quantity?: number;
};

export type InventoryCheckoutBundleSelection = {
  componentId?: string;
  items: InventoryCheckoutBundleSelectionItem[];
};

export type InventoryCheckoutBundleSelections =
  | Record<string, InventoryCheckoutBundleSelectionItem[]>
  | InventoryCheckoutBundleSelection[];

export type InventoryCheckoutCreatePayload = {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string | null;
  note?: string | null;
  lines: Array<{
    listingId?: string;
    bundleId?: string;
    variantId?: string;
    quantity: number;
    bundleSelections?: InventoryCheckoutBundleSelections;
  }>;
};

export type InventoryCostProfileStatus = 'active' | 'archived' | 'draft';

export type InventoryCostScenarioMetrics = {
  batchCost: number;
  breakEvenQuantity: number | null;
  grossMarginPercentage: number;
  grossProfitPerUnit: number;
  totalCostPerUnit: number;
};

export type InventoryCostScenario = {
  id: string;
  profileId: string;
  wsId: string;
  name: string;
  batchSize: number;
  manufacturingCostPerUnit: number;
  artCommissionCost: number;
  shippingCost: number;
  tariffCost: number;
  packagingCostPerUnit: number;
  otherCostPerUnit: number;
  sortOrder: number;
  metrics: InventoryCostScenarioMetrics;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InventoryCostProfitShare = {
  id: string;
  profileId: string;
  wsId: string;
  recipientLabel: string;
  sharePercentage: number;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InventoryCostProfile = {
  id: string;
  wsId: string;
  productId: string | null;
  productName?: string | null;
  categoryId: string | null;
  categoryName?: string | null;
  name: string;
  status: InventoryCostProfileStatus;
  currency: string;
  targetRetailPrice: number;
  notes: string | null;
  scenarios: InventoryCostScenario[];
  profitShares: InventoryCostProfitShare[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type InventoryCostProfilePayload = {
  productId?: string | null;
  categoryId?: string | null;
  name: string;
  status?: InventoryCostProfileStatus;
  currency?: string;
  targetRetailPrice: number;
  notes?: string | null;
  scenarios?: Array<{
    id?: string;
    name: string;
    batchSize: number;
    manufacturingCostPerUnit?: number;
    artCommissionCost?: number;
    shippingCost?: number;
    tariffCost?: number;
    packagingCostPerUnit?: number;
    otherCostPerUnit?: number;
    sortOrder?: number;
  }>;
  profitShares?: Array<{
    id?: string;
    recipientLabel: string;
    sharePercentage: number;
    sortOrder?: number;
  }>;
};

export type InventoryCostImportPreviewRow = {
  itemCategory: string;
  batchSize: number;
  manufacturingCostPerUnit: number;
  totalCostPerUnit: number | null;
  targetRetailPrice: number;
  artCommissionCost?: number | null;
  shippingCost?: number | null;
  tariffCost?: number | null;
  packagingCostPerUnit?: number | null;
  talentProfitPerSale?: number | null;
  partnerProfitPerSale?: number | null;
};

export type InventoryCostImportPreview = {
  rows: InventoryCostImportPreviewRow[];
  warnings: string[];
};

export type InventoryCostImportPayload = {
  csv: string;
  commit?: boolean;
};

export type InventoryCostingAnalyticsScenario = {
  profileId: string;
  profileName: string;
  scenarioId: string;
  scenarioName: string;
  currency: string;
  batchSize: number;
  targetRetailPrice: number;
  totalCostPerUnit: number;
  grossProfitPerUnit: number;
  grossMarginPercentage: number;
  breakEvenQuantity: number | null;
  batchCost: number;
};

export type InventoryCostingAnalytics = {
  profilesCount: number;
  scenariosCount: number;
  averageMarginPercentage: number;
  lowestBreakEvenQuantity: number | null;
  scenarios: InventoryCostingAnalyticsScenario[];
};

export type InventoryListResponse<T> = {
  data: T[];
  count: number;
};

export type InventorySalesListResponse =
  InventoryListResponse<InventorySaleSummary> & {
    realtime_enabled?: boolean;
    workspace_currency: string;
  };

export type InventoryCommerceSummary = {
  currency: string;
  estimatedGrossMarginPercentage: number;
  estimatedGrossProfit: number;
  excludedCurrencyCount: number;
  revenue: number;
  salesCount: number;
  unitsSold: number;
};

export type InventoryProductFormOptionsResponse = {
  categories: ProductCategory[];
  defaultFinanceCategoryId?: string | null;
  defaultRevenueWalletId?: string | null;
  defaultSalesPeriodId?: string | null;
  defaultWalletId?: string | null;
  financeCategories: TransactionCategory[];
  manufacturers: InventoryManufacturer[];
  owners: InventoryOwner[];
  units: ProductUnit[];
  wallets?: Array<{ id: string; name: string }>;
  warehouses: ProductWarehouse[];
};

export type InventorySalesDefaultsPayload = {
  defaultFinanceCategoryId: string | null;
  defaultRevenueWalletId: string | null;
  defaultSalesPeriodId: string | null;
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
  checkoutMode?: InventoryStorefrontCheckoutMode;
  nextUrl?: string | null;
};

export type InventoryOrderHistoryItem = {
  checkout: InventoryCheckoutSession;
  completedAt: string | null;
  createdAt: string | null;
  currency: string;
  id: string;
  lines: InventoryCheckoutLine[];
  polarStatus: InventoryPolarCheckoutStatus | null;
  squareStatus: InventorySquareTerminalCheckoutStatus | null;
  publicToken: string;
  status: InventoryCheckoutStatus;
  storefrontId: string;
  storefrontName: string;
  storefrontSlug: string;
  totalAmount: number;
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

export async function createInventoryMediaUploadUrl(
  wsId: string,
  payload: {
    contentType?: string;
    filename: string;
    size?: number;
    target: InventoryMediaUploadTarget;
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryMediaUploadUrlResponse>(
    workspaceInventoryPath(wsId, '/media/upload-url'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export async function createInventoryMediaReadUrl(
  wsId: string,
  payload: {
    path: string;
    provider?: 'r2' | 'supabase';
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryMediaReadUrlResponse>(
    workspaceInventoryPath(wsId, '/media/read-url'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export async function uploadInventoryMedia(
  wsId: string,
  file: File,
  target: InventoryMediaUploadTarget,
  options?: InternalApiClientOptions & {
    onUploadProgress?: (progress: WorkspaceStorageUploadProgress) => void;
  }
): Promise<InventoryMediaUploadResult> {
  const uploadTarget = await createInventoryMediaUploadUrl(
    wsId,
    {
      contentType: file.type || undefined,
      filename: file.name,
      size: file.size,
      target,
    },
    options
  );
  const uploadPayload = parseSignedUploadPayload(uploadTarget);

  await uploadFileWithSignedUrl(
    file,
    uploadPayload,
    options?.fetch ?? globalThis.fetch,
    options?.onUploadProgress
  );
  const readUrl =
    uploadTarget.readUrl ??
    (
      await createInventoryMediaReadUrl(
        wsId,
        {
          path: uploadPayload.path,
          provider: uploadPayload.provider,
        },
        options
      )
    ).readUrl;

  if (!readUrl) throw new Error('Inventory media read URL is missing');

  return {
    fullPath: uploadPayload.fullPath,
    path: uploadPayload.path,
    target: uploadTarget.target,
    url: readUrl,
  };
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

export function getInventoryStorefront(
  wsId: string,
  storefrontId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryStorefront }>(
    workspaceInventoryPath(
      wsId,
      `/storefronts/${encodePathSegment(storefrontId)}`
    ),
    { cache: 'no-store' }
  );
}

export function listInventoryCostProfiles(
  wsId: string,
  query?: InventoryCostProfileListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<InventoryCostProfile>
  >(workspaceInventoryPath(wsId, '/costing'), {
    cache: 'no-store',
    query: paginatedQuery(query),
  });
}

export function getInventoryCostProfile(
  wsId: string,
  profileId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryCostProfile }>(
    workspaceInventoryPath(wsId, `/costing/${encodePathSegment(profileId)}`),
    { cache: 'no-store' }
  );
}

export function getInventoryCostingAnalytics(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryCostingAnalytics>(
    workspaceInventoryPath(wsId, '/costing/analytics'),
    { cache: 'no-store' }
  );
}

export function importInventoryCostingCsv(
  wsId: string,
  payload: InventoryCostImportPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryCostImportPreview & { createdProfiles?: InventoryCostProfile[] }
  >(workspaceInventoryPath(wsId, '/costing/import'), {
    body: JSON.stringify(payload),
    headers: jsonHeaders(options?.defaultHeaders),
    method: 'POST',
  });
}

export function createInventoryCostProfile(
  wsId: string,
  payload: InventoryCostProfilePayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryCostProfile }>(
    workspaceInventoryPath(wsId, '/costing'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function updateInventoryCostProfile(
  wsId: string,
  profileId: string,
  payload: Partial<InventoryCostProfilePayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryCostProfile }>(
    workspaceInventoryPath(wsId, `/costing/${encodePathSegment(profileId)}`),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PATCH',
    }
  );
}

export function deleteInventoryCostProfile(
  wsId: string,
  profileId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: boolean }>(
    workspaceInventoryPath(wsId, `/costing/${encodePathSegment(profileId)}`),
    {
      headers: options?.defaultHeaders,
      method: 'DELETE',
    }
  );
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

export function updateInventorySalesDefaults(
  wsId: string,
  payload: InventorySalesDefaultsPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    workspaceInventoryPath(wsId, '/sales-defaults'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PUT',
    }
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

export function createInventoryProduct(
  wsId: string,
  payload: InventoryProductPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    workspaceInventoryPath(wsId, '/products'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function updateInventoryProduct(
  wsId: string,
  productId: string,
  payload: Partial<InventoryProductPayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    workspacePath(wsId, `/products/${encodePathSegment(productId)}`),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PATCH',
    }
  );
}

export function deleteInventoryProduct(
  wsId: string,
  productId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    disposition: 'archived' | 'deleted';
    message: string;
  }>(workspacePath(wsId, `/products/${encodePathSegment(productId)}`), {
    headers: options?.defaultHeaders,
    method: 'DELETE',
  });
}

export function updateInventoryProductInventory(
  wsId: string,
  productId: string,
  payload: InventoryProductInventoryPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    workspacePath(wsId, `/products/${encodePathSegment(productId)}/inventory`),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PATCH',
    }
  );
}

export function getInventoryProductStockHistory(
  wsId: string,
  productId: string,
  query?: { limit?: number; offset?: number },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryStockHistoryResponse>(
    workspacePath(
      wsId,
      `/products/${encodePathSegment(productId)}/inventory/history`
    ),
    { cache: 'no-store', query: asQuery(query) }
  );
}

export function listInventoryStockBeneficiaries(
  wsId: string,
  query?: { limit?: number; q?: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(
    options
  ).json<InventoryStockBeneficiariesResponse>(
    workspaceInventoryPath(wsId, '/stock-beneficiaries'),
    { cache: 'no-store', query: asQuery(query) }
  );
}

export function listInventoryProductCategories(
  wsId: string,
  query?: InventoryNamedListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<ProductCategory>
  >(workspaceInventoryPath(wsId, '/categories'), {
    cache: 'no-store',
    query: paginatedQuery(query),
  });
}

export function createInventoryProductCategory(
  wsId: string,
  payload: InventoryCategoryPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: ProductCategory;
  }>(workspaceInventoryPath(wsId, '/categories'), {
    body: JSON.stringify(payload),
    headers: jsonHeaders(options?.defaultHeaders),
    method: 'POST',
  });
}

export function updateInventoryProductCategory(
  wsId: string,
  categoryId: string,
  payload: Partial<InventoryCategoryPayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: ProductCategory;
  }>(
    workspaceInventoryPath(
      wsId,
      `/categories/${encodePathSegment(categoryId)}`
    ),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PUT',
    }
  );
}

export function deleteInventoryProductCategory(
  wsId: string,
  categoryId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    workspaceInventoryPath(
      wsId,
      `/categories/${encodePathSegment(categoryId)}`
    ),
    {
      headers: options?.defaultHeaders,
      method: 'DELETE',
    }
  );
}

export function listInventoryWarehouses(
  wsId: string,
  query?: InventoryNamedListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<ProductWarehouse>
  >(workspaceInventoryPath(wsId, '/warehouses'), {
    cache: 'no-store',
    query: paginatedQuery(query),
  });
}

export function createInventoryWarehouse(
  wsId: string,
  payload: InventoryWarehousePayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: ProductWarehouse;
  }>(workspaceInventoryPath(wsId, '/warehouses'), {
    body: JSON.stringify(payload),
    headers: jsonHeaders(options?.defaultHeaders),
    method: 'POST',
  });
}

export function updateInventoryWarehouse(
  wsId: string,
  warehouseId: string,
  payload: Partial<InventoryWarehousePayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: ProductWarehouse;
  }>(
    workspaceInventoryPath(
      wsId,
      `/warehouses/${encodePathSegment(warehouseId)}`
    ),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PUT',
    }
  );
}

export function deleteInventoryWarehouse(
  wsId: string,
  warehouseId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    workspaceInventoryPath(
      wsId,
      `/warehouses/${encodePathSegment(warehouseId)}`
    ),
    {
      headers: options?.defaultHeaders,
      method: 'DELETE',
    }
  );
}

export function listInventorySuppliers(
  wsId: string,
  query?: InventoryNamedListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<ProductSupplier>
  >(workspaceInventoryPath(wsId, '/suppliers'), {
    cache: 'no-store',
    query: paginatedQuery(query),
  });
}

export function createInventorySupplier(
  wsId: string,
  payload: InventorySupplierPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: ProductSupplier }>(
    workspaceInventoryPath(wsId, '/suppliers'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function updateInventorySupplier(
  wsId: string,
  supplierId: string,
  payload: Partial<InventorySupplierPayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: ProductSupplier }>(
    workspaceInventoryPath(wsId, `/suppliers/${encodePathSegment(supplierId)}`),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PUT',
    }
  );
}

export function deleteInventorySupplier(
  wsId: string,
  supplierId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    workspaceInventoryPath(wsId, `/suppliers/${encodePathSegment(supplierId)}`),
    {
      headers: options?.defaultHeaders,
      method: 'DELETE',
    }
  );
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

export function createInventoryBatch(
  wsId: string,
  payload: InventoryBatchPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: ProductBatch }>(
    workspaceInventoryPath(wsId, '/batches'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function updateInventoryBatch(
  wsId: string,
  batchId: string,
  payload: Partial<InventoryBatchPayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: ProductBatch }>(
    workspaceInventoryPath(wsId, `/batches/${encodePathSegment(batchId)}`),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PATCH',
    }
  );
}

export function deleteInventoryBatch(
  wsId: string,
  batchId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: boolean }>(
    workspaceInventoryPath(wsId, `/batches/${encodePathSegment(batchId)}`),
    {
      headers: options?.defaultHeaders,
      method: 'DELETE',
    }
  );
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

export type InventoryPromotionPayload = {
  code: string;
  description?: string;
  max_uses?: number | null;
  name: string;
  unit?: 'currency' | 'percentage';
  value: number;
};

export function createInventoryPromotion(
  wsId: string,
  payload: InventoryPromotionPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: ProductPromotion }>(
    workspacePath(wsId, '/promotions'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function updateInventoryPromotion(
  wsId: string,
  promotionId: string,
  payload: InventoryPromotionPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message?: string }>(
    workspacePath(wsId, `/promotions/${encodePathSegment(promotionId)}`),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PUT',
    }
  );
}

export function deleteInventoryPromotion(
  wsId: string,
  promotionId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message?: string }>(
    workspacePath(wsId, `/promotions/${encodePathSegment(promotionId)}`),
    {
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'DELETE',
    }
  );
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

export function listInventoryOwners(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventoryOwner[];
  }>(workspaceInventoryPath(wsId, '/owners'), {
    cache: 'no-store',
  });
}

export function createInventoryOwner(
  wsId: string,
  payload: InventoryOwnerPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryOwner }>(
    workspaceInventoryPath(wsId, '/owners'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function updateInventoryOwner(
  wsId: string,
  ownerId: string,
  payload: Partial<InventoryOwnerPayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryOwner }>(
    workspaceInventoryPath(wsId, `/owners/${encodePathSegment(ownerId)}`),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PATCH',
    }
  );
}

export function deleteInventoryOwner(
  wsId: string,
  ownerId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    workspaceInventoryPath(wsId, `/owners/${encodePathSegment(ownerId)}`),
    {
      headers: options?.defaultHeaders,
      method: 'DELETE',
    }
  );
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
  query?: InventorySalesListQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventorySalesListResponse>(
    workspaceInventoryPath(wsId, '/sales'),
    {
      cache: 'no-store',
      query: asQuery(query),
    }
  );
}

export function getInventoryCommerceSummary(
  wsId: string,
  query?: Pick<InventorySalesListQuery, 'period_id' | 'unassigned'>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryCommerceSummary>(
    workspaceInventoryPath(wsId, '/sales/summary'),
    {
      cache: 'no-store',
      query: asQuery(query),
    }
  );
}

export function listInventorySalesPeriods(
  wsId: string,
  query?: { include_archived?: boolean },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventorySalesPeriod[];
  }>(workspaceInventoryPath(wsId, '/sales-periods'), {
    cache: 'no-store',
    query: asQuery(query),
  });
}

export function createInventorySalesPeriod(
  wsId: string,
  payload: InventorySalesPeriodPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventorySalesPeriod }>(
    workspaceInventoryPath(wsId, '/sales-periods'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function updateInventorySalesPeriod(
  wsId: string,
  periodId: string,
  payload: Partial<
    InventorySalesPeriodPayload & { status: InventorySalesPeriodStatus }
  >,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventorySalesPeriod }>(
    workspaceInventoryPath(
      wsId,
      `/sales-periods/${encodePathSegment(periodId)}`
    ),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PATCH',
    }
  );
}

export function deleteInventorySalesPeriod(
  wsId: string,
  periodId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: true }>(
    workspaceInventoryPath(
      wsId,
      `/sales-periods/${encodePathSegment(periodId)}`
    ),
    { headers: options?.defaultHeaders, method: 'DELETE' }
  );
}

export function setInventorySalePeriod(
  wsId: string,
  saleId: string,
  payload: {
    period_id: string | null;
    source: InventorySaleSource;
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventorySalesPeriod | null;
  }>(
    workspaceInventoryPath(wsId, `/sales/${encodePathSegment(saleId)}/period`),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PUT',
    }
  );
}

export function setInventorySalesPeriodBulk(
  wsId: string,
  payload: {
    period_id: string | null;
    sales: Array<{ id: string; source: InventorySaleSource }>;
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventorySalesPeriod | null;
    updated: number;
  }>(workspaceInventoryPath(wsId, '/sales/bulk-period'), {
    body: JSON.stringify(payload),
    headers: jsonHeaders(options?.defaultHeaders),
    method: 'PUT',
  });
}

export type InventoryProductSalesRow = {
  productId: string;
  productName: string;
  revenue: number;
  unitsSold: number;
};

export function listInventorySalesByProduct(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventoryProductSalesRow[];
  }>(workspaceInventoryPath(wsId, '/sales/by-product'), {
    cache: 'no-store',
  });
}

export function getInventorySale(
  wsId: string,
  saleId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventorySaleDetail }>(
    workspaceInventoryPath(wsId, `/sales/${encodePathSegment(saleId)}`),
    { cache: 'no-store' }
  );
}

export function createInventorySale(
  wsId: string,
  payload: InventorySaleCreatePayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventorySaleCreateResponse>(
    workspaceInventoryPath(wsId, '/sales'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function updateInventorySale(
  wsId: string,
  saleId: string,
  payload: InventorySaleUpdatePayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventorySaleDetail }>(
    workspaceInventoryPath(wsId, `/sales/${encodePathSegment(saleId)}`),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PUT',
    }
  );
}

export function deleteInventorySale(
  wsId: string,
  saleId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ message: string }>(
    workspaceInventoryPath(wsId, `/sales/${encodePathSegment(saleId)}`),
    {
      headers: options?.defaultHeaders,
      method: 'DELETE',
    }
  );
}

export function listInventoryAuditLogs(
  wsId: string,
  query?: InventoryAuditLogListQuery,
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

export function deleteInventoryStorefront(
  wsId: string,
  storefrontId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: boolean }>(
    workspaceInventoryPath(
      wsId,
      `/storefronts/${encodePathSegment(storefrontId)}`
    ),
    {
      headers: options?.defaultHeaders,
      method: 'DELETE',
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

export function updateInventoryStorefrontListing(
  wsId: string,
  storefrontId: string,
  listingId: string,
  payload: Partial<InventoryStorefrontListingPayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventoryStorefrontListing;
  }>(
    workspaceInventoryPath(
      wsId,
      `/storefronts/${encodePathSegment(storefrontId)}/listings/${encodePathSegment(listingId)}`
    ),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PATCH',
    }
  );
}

export function deleteInventoryStorefrontListing(
  wsId: string,
  storefrontId: string,
  listingId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: boolean }>(
    workspaceInventoryPath(
      wsId,
      `/storefronts/${encodePathSegment(storefrontId)}/listings/${encodePathSegment(listingId)}`
    ),
    {
      headers: options?.defaultHeaders,
      method: 'DELETE',
    }
  );
}

export function listInventoryOptionTemplates(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventoryOptionTemplate[];
  }>(workspaceInventoryPath(wsId, '/option-templates'), {
    cache: 'no-store',
  });
}

export function createInventoryOptionTemplate(
  wsId: string,
  payload: InventoryOptionTemplatePayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryOptionTemplate }>(
    workspaceInventoryPath(wsId, '/option-templates'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function updateInventoryOptionTemplate(
  wsId: string,
  templateId: string,
  payload: Partial<InventoryOptionTemplatePayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ data: InventoryOptionTemplate }>(
    workspaceInventoryPath(
      wsId,
      `/option-templates/${encodePathSegment(templateId)}`
    ),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PATCH',
    }
  );
}

export function deleteInventoryOptionTemplate(
  wsId: string,
  templateId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: boolean }>(
    workspaceInventoryPath(
      wsId,
      `/option-templates/${encodePathSegment(templateId)}`
    ),
    {
      headers: options?.defaultHeaders,
      method: 'DELETE',
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

export function deleteInventoryBundle(
  wsId: string,
  bundleId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: boolean }>(
    workspaceInventoryPath(wsId, `/bundles/${encodePathSegment(bundleId)}`),
    {
      headers: options?.defaultHeaders,
      method: 'DELETE',
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

export function listInventoryRevenueShareEarnings(
  wsId: string,
  query?: InventoryRevenueShareEarningsQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<InventoryRevenueShareEarning>
  >(workspaceInventoryPath(wsId, '/revenue-share'), {
    cache: 'no-store',
    query: asQuery(query),
  });
}

export function releaseInventoryCheckout(
  wsId: string,
  checkoutId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventoryCheckoutSession;
  }>(
    workspaceInventoryPath(
      wsId,
      `/checkouts/${encodePathSegment(checkoutId)}/release`
    ),
    {
      headers: options?.defaultHeaders,
      method: 'POST',
    }
  );
}

export function createInventorySquareTerminalCheckout(
  wsId: string,
  payload: InventorySquareTerminalCheckoutPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventoryCheckoutSession;
  }>(workspaceInventoryPath(wsId, '/square/terminal-checkouts'), {
    body: JSON.stringify(payload),
    headers: jsonHeaders(options?.defaultHeaders),
    method: 'POST',
  });
}

export function cancelInventorySquareTerminalCheckout(
  wsId: string,
  checkoutId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventoryCheckoutSession;
  }>(
    workspaceInventoryPath(
      wsId,
      `/square/terminal-checkouts/${encodePathSegment(checkoutId)}/cancel`
    ),
    {
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
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

export function getInventorySquareSettings(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventorySquareSettings>(
    workspaceInventoryPath(wsId, '/square-settings'),
    { cache: 'no-store' }
  );
}

export function updateInventorySquareSettings(
  wsId: string,
  payload: InventorySquareSettingsPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventorySquareSettings>(
    workspaceInventoryPath(wsId, '/square-settings'),
    {
      body: JSON.stringify(payload),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'PUT',
    }
  );
}

export function getInventorySquareCatalogSyncState(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(
    options
  ).json<InventorySquareCatalogSyncState | null>(
    workspaceInventoryPath(wsId, '/square/catalog-sync'),
    { cache: 'no-store' }
  );
}

export function syncInventorySquareCatalog(
  wsId: string,
  direction: InventorySquareCatalogSyncDirection,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventorySquareCatalogSyncSummary>(
    workspaceInventoryPath(wsId, '/square/catalog-sync'),
    {
      body: JSON.stringify({ direction }),
      headers: jsonHeaders(options?.defaultHeaders),
      method: 'POST',
    }
  );
}

export function startInventorySquareOAuth(
  wsId: string,
  environment: InventorySquareEnvironment,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventorySquareOAuthStartResponse>(
    workspaceInventoryPath(
      wsId,
      `/square/oauth/start?environment=${encodeURIComponent(environment)}`
    ),
    { cache: 'no-store', headers: options?.defaultHeaders }
  );
}

export function listInventorySquareLocations(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventorySquareLocation[];
  }>(workspaceInventoryPath(wsId, '/square/locations'), {
    cache: 'no-store',
  });
}

export function listInventorySquareDevices(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventorySquareDevice[];
  }>(workspaceInventoryPath(wsId, '/square/devices'), {
    cache: 'no-store',
  });
}

export function createInventorySquareDeviceCode(
  wsId: string,
  payload: { locationId?: string; name?: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    data: InventorySquareDeviceCode;
  }>(workspaceInventoryPath(wsId, '/square/device-codes'), {
    body: JSON.stringify(payload),
    headers: jsonHeaders(options?.defaultHeaders),
    method: 'POST',
  });
}

export function getInventoryStorefrontAnalytics(
  wsId: string,
  query?: { days?: number },
  options?: InternalApiClientOptions
) {
  const suffix = query?.days ? `?days=${query.days}` : '';
  return getInternalApiClient(options).json<InventoryStorefrontAnalytics>(
    workspaceInventoryPath(wsId, `/analytics${suffix}`),
    { cache: 'no-store' }
  );
}

export function getInventoryPolarSyncSummary(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<InventoryPolarProductSyncSummary>(
    workspaceInventoryPath(wsId, '/polar-product-sync'),
    { cache: 'no-store' }
  );
}

export function syncInventoryPolarProducts(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    ok: boolean;
    synced: { bundles: number; listings: number };
  }>(workspaceInventoryPath(wsId, '/polar-product-sync'), {
    headers: jsonHeaders(options?.defaultHeaders),
    method: 'POST',
  });
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

export function recordInventoryStorefrontAnalyticsEvent(
  slug: string,
  payload: InventoryStorefrontAnalyticsEventPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: true }>(
    publicStorefrontPath(slug, '/analytics/events'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
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

export function listInventoryOrderHistory(
  query?: InventoryOrderHistoryQuery,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    InventoryListResponse<InventoryOrderHistoryItem>
  >('/api/v1/inventory/orders', {
    cache: 'no-store',
    query: asQuery(query),
  });
}
