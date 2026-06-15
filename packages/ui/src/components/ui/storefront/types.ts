import type { InventoryStorefrontListing } from '@tuturuuu/internal-api/inventory';

export type StorefrontCartLine = {
  listingId: string;
  quantity: number;
};

export type StorefrontCartEntry = {
  line: StorefrontCartLine;
  listing: InventoryStorefrontListing;
};

export type StorefrontSurfaceMode =
  | 'cart'
  | 'checkout'
  | 'preview'
  | 'product'
  | 'store';

export type StorefrontSurfaceLabels = {
  add: string;
  available: string;
  browse: string;
  bundle: string;
  cart: string;
  checkout: string;
  checkoutDisabled: string;
  checkoutDisabledBadge: string;
  couponNote: string;
  demoBadge: string;
  emptyCart: string;
  emptyListingsDescription: string;
  emptyListingsTitle: string;
  fallbackDescription: string;
  form: {
    email: string;
    name: string;
    note: string;
    phone: string;
  };
  privateStore: string;
  previewBadge: string;
  product: string;
  publicStore: string;
  quantity: string;
  reserve: string;
  reserving: string;
  reservedCopy: string;
  simulatedBadge: string;
  soldOut: string;
  total: string;
};

export const defaultStorefrontSurfaceLabels: StorefrontSurfaceLabels = {
  add: 'Add',
  available: 'available',
  browse: 'Browse',
  bundle: 'Bundle',
  cart: 'Cart',
  checkout: 'Checkout',
  checkoutDisabled: 'Checkout is disabled in preview',
  checkoutDisabledBadge: 'Checkout disabled',
  couponNote: 'Have a coupon? You can apply it at checkout.',
  demoBadge: 'Demo',
  emptyCart: 'Add a listing to start checkout.',
  emptyListingsDescription:
    'Publish a listing to make this storefront ready for buyers.',
  emptyListingsTitle: 'No listings yet',
  fallbackDescription: 'This listing is available for checkout.',
  form: {
    email: 'Email',
    name: 'Name',
    note: 'Order note',
    phone: 'Phone',
  },
  privateStore: 'Private',
  previewBadge: 'Preview',
  product: 'Product',
  publicStore: 'Public',
  quantity: 'Qty',
  reserve: 'Reserve with Polar',
  reserving: 'Reserving...',
  reservedCopy:
    'Review your cart, then continue with the available checkout mode.',
  simulatedBadge: 'Simulated checkout',
  soldOut: 'Sold out',
  total: 'Total',
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
