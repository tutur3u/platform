import type {
  InventoryBundle,
  InventoryCheckoutBundleSelections,
  InventoryListingVariant,
  InventoryStorefrontListing,
} from '@tuturuuu/internal-api/inventory';

export type StorefrontCartLine = {
  listingId: string;
  bundleSelections?: InventoryCheckoutBundleSelections;
  selectionKey?: string | null;
  variantId?: string | null;
  quantity: number;
};

export type StorefrontCartEntry = {
  bundle?: InventoryBundle;
  line: StorefrontCartLine;
  listing: InventoryStorefrontListing;
  variant?: InventoryListingVariant;
};

export type StorefrontBuyerDefaults = {
  email?: string | null;
  name?: string | null;
};

export type StorefrontSurfaceMode =
  | 'cart'
  | 'checkout'
  | 'preview'
  | 'product'
  | 'store';

export type StorefrontSurfaceLabels = {
  add: string;
  allItems: string;
  available: string;
  browse: string;
  bundle: string;
  bundles: string;
  bundleSelectionTitle: string;
  buyNow: string;
  cart: string;
  cheapestFreePreview: string;
  checkout: string;
  checkoutDisabled: string;
  checkoutDisabledBadge: string;
  clearFilters: string;
  contactDetails: string;
  couponNote: string;
  demoBadge: string;
  emptyCart: string;
  fromPrice: string;
  instantCheckout: string;
  orderSummary: string;
  redirectingToCheckout: string;
  requiredItems: string;
  selectOptions: string;
  searchBundleItems: string;
  searchStore: string;
  selectedItems: string;
  viewDetails: string;
  emptyListingsDescription: string;
  emptyListingsTitle: string;
  fallbackDescription: string;
  noResultsDescription: string;
  noResultsTitle: string;
  form: {
    email: string;
    name: string;
    note: string;
    phone: string;
  };
  privateStore: string;
  previewBadge: string;
  product: string;
  products: string;
  publicStore: string;
  quantity: string;
  reserve: string;
  reserving: string;
  reservedCopy: string;
  simulatedBadge: string;
  soldOut: string;
  shopTitle: string;
  total: string;
  visibleItems: string;
};

export const defaultStorefrontSurfaceLabels: StorefrontSurfaceLabels = {
  add: 'Add',
  allItems: 'All',
  available: 'available',
  browse: 'Browse',
  bundle: 'Bundle',
  bundles: 'Bundles',
  bundleSelectionTitle: 'Build bundle',
  buyNow: 'Buy now',
  cart: 'Cart',
  cheapestFreePreview: 'Cheapest eligible item is free.',
  checkout: 'Checkout',
  checkoutDisabled: 'Checkout is disabled in preview',
  checkoutDisabledBadge: 'Checkout disabled',
  clearFilters: 'Clear filters',
  contactDetails: 'Contact details',
  couponNote: 'Have a coupon? You can apply it at checkout.',
  demoBadge: 'Demo',
  emptyCart: 'Add a listing to start checkout.',
  fromPrice: 'From',
  instantCheckout: 'Instant checkout',
  orderSummary: 'Order summary',
  redirectingToCheckout: 'Taking you to secure checkout…',
  requiredItems: 'Select {count} items',
  selectOptions: 'Select options',
  searchBundleItems: 'Search items',
  searchStore: 'Search this store',
  selectedItems: '{selected} of {required} selected',
  viewDetails: 'View details',
  emptyListingsDescription:
    'Publish a listing to make this storefront ready for buyers.',
  emptyListingsTitle: 'No listings yet',
  fallbackDescription: 'This listing is available for checkout.',
  noResultsDescription: 'Try another search or show every item.',
  noResultsTitle: 'No matching items',
  form: {
    email: 'Email',
    name: 'Name',
    note: 'Order note',
    phone: 'Phone',
  },
  privateStore: 'Private',
  previewBadge: 'Preview',
  product: 'Product',
  products: 'Products',
  publicStore: 'Public',
  quantity: 'Qty',
  reserve: 'Reserve with Polar',
  reserving: 'Reserving...',
  reservedCopy:
    'Review your cart, then continue with the available checkout mode.',
  simulatedBadge: 'Simulated checkout',
  soldOut: 'Sold out',
  shopTitle: 'Shop',
  total: 'Total',
  visibleItems: '{count} items',
};

export function mergeStorefrontSurfaceLabels(
  labels?: Partial<StorefrontSurfaceLabels>
) {
  return {
    ...defaultStorefrontSurfaceLabels,
    ...labels,
    form: {
      ...defaultStorefrontSurfaceLabels.form,
      ...labels?.form,
    },
  };
}
