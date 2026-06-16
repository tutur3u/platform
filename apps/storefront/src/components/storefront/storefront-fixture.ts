import type {
  InventoryCheckoutResponse,
  InventoryCheckoutSession,
  InventoryPublicStorefrontResponse,
  InventoryStorefront,
} from '@tuturuuu/internal-api/inventory';

export const DEMO_STOREFRONT_SLUG = 'demo';
export const DEMO_STOREFRONT_ID = 'fixture-storefront-demo';
export const DEMO_ORDER_PUBLIC_TOKEN = 'demo-order';

const DEMO_WORKSPACE_ID = 'fixture-workspace-demo';
const DEMO_UNIT_ID = 'fixture-unit-each';
const DEMO_WAREHOUSE_ID = 'fixture-warehouse-main';
const DEMO_CREATED_AT = '2026-06-11T00:00:00.000Z';

export const demoStorefront: InventoryStorefront = {
  accentColor: null,
  analyticsEnabled: true,
  cornerStyle: 'rounded',
  coverImageUrl: null,
  createdAt: DEMO_CREATED_AT,
  currency: 'USD',
  checkoutMode: 'simulated',
  description:
    'A temporary testing storefront that demonstrates product browsing, cart review, checkout, and order status without touching production inventory.',
  heroImageUrl: null,
  id: DEMO_STOREFRONT_ID,
  layoutStyle: 'grid',
  listingsCount: 4,
  name: 'Tuturuuu Demo Store',
  sections: [
    {
      createdAt: DEMO_CREATED_AT,
      description: 'A polished sample storefront for testing carts and orders.',
      href: null,
      id: 'fixture-section-demo-banner',
      imageUrl: null,
      items: [],
      metadata: {},
      sectionType: 'promo',
      sortOrder: 0,
      status: 'published',
      storefrontId: DEMO_STOREFRONT_ID,
      title: 'Demo launch essentials',
      updatedAt: DEMO_CREATED_AT,
      wsId: DEMO_WORKSPACE_ID,
    },
  ],
  showInventoryBadges: true,
  slug: DEMO_STOREFRONT_SLUG,
  status: 'published',
  surfaceStyle: 'soft',
  themePreset: 'catalog',
  updatedAt: DEMO_CREATED_AT,
  visibility: 'public',
  wsId: DEMO_WORKSPACE_ID,
};

export const demoPublicStorefront: InventoryPublicStorefrontResponse = {
  bundles: [
    {
      availableQuantity: 8,
      components: [
        {
          bundleId: 'fixture-bundle-starter-kit',
          id: 'fixture-bundle-starter-kit-notebook',
          productId: 'fixture-product-notebook',
          productName: 'Launch Notebook',
          quantity: 1,
          unitId: DEMO_UNIT_ID,
          unitName: 'Each',
          warehouseId: DEMO_WAREHOUSE_ID,
          warehouseName: 'Demo Warehouse',
        },
        {
          bundleId: 'fixture-bundle-starter-kit',
          id: 'fixture-bundle-starter-kit-mug',
          productId: 'fixture-product-mug',
          productName: 'Workflow Mug',
          quantity: 1,
          unitId: DEMO_UNIT_ID,
          unitName: 'Each',
          warehouseId: DEMO_WAREHOUSE_ID,
          warehouseName: 'Demo Warehouse',
        },
      ],
      createdAt: DEMO_CREATED_AT,
      description:
        'A compact starter bundle for testing bundle-style listings.',
      id: 'fixture-bundle-starter-kit',
      imageUrl: null,
      maxPerOrder: 2,
      name: 'Starter Kit',
      // Prices are stored in minor units (cents): 4900 == $49.00.
      price: 4900,
      slug: 'starter-kit',
      status: 'active',
      storefrontId: DEMO_STOREFRONT_ID,
      updatedAt: DEMO_CREATED_AT,
      wsId: DEMO_WORKSPACE_ID,
    },
  ],
  listings: [
    {
      availableQuantity: 24,
      bundleId: null,
      compareAtPrice: null,
      createdAt: DEMO_CREATED_AT,
      description: 'A durable notebook for planning launch checklists.',
      id: 'fixture-listing-notebook',
      imageUrl: null,
      listingType: 'product',
      maxPerOrder: 5,
      price: 1800,
      productId: 'fixture-product-notebook',
      sortOrder: 1,
      status: 'published',
      storefrontId: DEMO_STOREFRONT_ID,
      title: 'Launch Notebook',
      unitId: DEMO_UNIT_ID,
      unitName: 'Each',
      updatedAt: DEMO_CREATED_AT,
      warehouseId: DEMO_WAREHOUSE_ID,
      warehouseName: 'Demo Warehouse',
      wsId: DEMO_WORKSPACE_ID,
    },
    {
      availableQuantity: 15,
      bundleId: null,
      compareAtPrice: 3200,
      createdAt: DEMO_CREATED_AT,
      description: 'A desk mug used for testing compare-at pricing.',
      id: 'fixture-listing-mug',
      imageUrl: null,
      listingType: 'product',
      maxPerOrder: 4,
      price: 2400,
      productId: 'fixture-product-mug',
      sortOrder: 2,
      status: 'published',
      storefrontId: DEMO_STOREFRONT_ID,
      title: 'Workflow Mug',
      unitId: DEMO_UNIT_ID,
      unitName: 'Each',
      updatedAt: DEMO_CREATED_AT,
      warehouseId: DEMO_WAREHOUSE_ID,
      warehouseName: 'Demo Warehouse',
      wsId: DEMO_WORKSPACE_ID,
    },
    {
      availableQuantity: 8,
      bundleId: 'fixture-bundle-starter-kit',
      compareAtPrice: null,
      createdAt: DEMO_CREATED_AT,
      description:
        'A bundle listing that exercises cart limits and bundle copy.',
      id: 'fixture-listing-starter-kit',
      imageUrl: null,
      listingType: 'bundle',
      maxPerOrder: 2,
      price: 4900,
      productId: null,
      sortOrder: 3,
      status: 'published',
      storefrontId: DEMO_STOREFRONT_ID,
      title: 'Starter Kit',
      unitId: null,
      unitName: null,
      updatedAt: DEMO_CREATED_AT,
      warehouseId: null,
      warehouseName: null,
      wsId: DEMO_WORKSPACE_ID,
    },
    {
      availableQuantity: 0,
      bundleId: null,
      compareAtPrice: null,
      createdAt: DEMO_CREATED_AT,
      description: 'An out-of-stock item for testing disabled add controls.',
      id: 'fixture-listing-archive-card',
      imageUrl: null,
      listingType: 'product',
      maxPerOrder: 3,
      price: 1200,
      productId: 'fixture-product-archive-card',
      sortOrder: 4,
      status: 'published',
      storefrontId: DEMO_STOREFRONT_ID,
      title: 'Archive Card Pack',
      unitId: DEMO_UNIT_ID,
      unitName: 'Each',
      updatedAt: DEMO_CREATED_AT,
      warehouseId: DEMO_WAREHOUSE_ID,
      warehouseName: 'Demo Warehouse',
      wsId: DEMO_WORKSPACE_ID,
    },
  ],
  storefront: demoStorefront,
};

export const demoCheckoutSession: InventoryCheckoutSession = {
  completedAt: null,
  conversionFeeEstimateAmount: 0,
  currency: 'USD',
  customerAuthUid: null,
  customerEmail: 'buyer@example.com',
  customerName: 'Demo Buyer',
  customerPhone: null,
  expiresAt: null,
  financeInvoiceId: null,
  id: 'fixture-checkout-demo',
  lines: [
    {
      bundleId: null,
      id: 'fixture-checkout-line-notebook',
      listingId: 'fixture-listing-notebook',
      variantId: null,
      productId: 'fixture-product-notebook',
      quantity: 1,
      subtotalAmount: 18,
      title: 'Launch Notebook',
      unitId: DEMO_UNIT_ID,
      unitPrice: 18,
      warehouseId: DEMO_WAREHOUSE_ID,
    },
  ],
  note: 'This is a local demo order. No inventory or payment state was changed.',
  platformFeeAmount: 0,
  polarCheckoutId: null,
  polarCheckoutUrl: null,
  polarEnvironment: null,
  polarOrderId: null,
  polarProductId: null,
  polarStatus: null,
  processingFeeEstimateAmount: 0,
  publicToken: DEMO_ORDER_PUBLIC_TOKEN,
  status: 'reserved',
  subtotalAmount: 18,
  totalAmount: 18,
  wsId: DEMO_WORKSPACE_ID,
};

export function isDemoStorefrontFixture(
  storefront: Pick<InventoryStorefront, 'id'> | null | undefined
) {
  return storefront?.id === DEMO_STOREFRONT_ID;
}

export function createDemoCheckoutResponse(
  storeSlug: string
): InventoryCheckoutResponse {
  return {
    checkout: demoCheckoutSession,
    checkoutUrl: `/${storeSlug}/orders/${DEMO_ORDER_PUBLIC_TOKEN}`,
  };
}

export function getDemoOrderResponse(publicToken: string): {
  order: InventoryCheckoutSession;
} {
  if (publicToken !== DEMO_ORDER_PUBLIC_TOKEN) {
    throw Object.assign(new Error('Demo order not found'), { status: 404 });
  }

  return { order: demoCheckoutSession };
}
