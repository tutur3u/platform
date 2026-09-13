import type { Product } from '@tuturuuu/payment/polar';
import { getSupportedProductPrice } from './polar-price';
import { PROPOSED_WORKSPACE_CATALOG } from './subscription-constants';

export const CATALOG_KEYS = [
  'plus-month',
  'plus-year',
  'pro-month',
  'pro-year',
] as const;
export type CatalogKey = (typeof CATALOG_KEYS)[number];
export type CatalogMapping = Record<CatalogKey, string>;

/** Explicit IDs bind existing products; never infer ownership from a product name. */
export function planCatalogSync(
  products: Product[],
  mapping: CatalogMapping,
  organizationId: string
) {
  if (
    new Set(CATALOG_KEYS.map((key) => mapping[key])).size !==
    CATALOG_KEYS.length
  ) {
    throw new Error('Every catalog entry must bind a distinct Polar product');
  }
  return CATALOG_KEYS.map((key) => {
    const [plan, interval] = key.split('-') as [
      'plus' | 'pro',
      'month' | 'year',
    ];
    const product = products.find((item) => item.id === mapping[key]);
    if (
      !product ||
      product.organizationId !== organizationId ||
      product.isArchived
    ) {
      throw new Error(
        `Missing, archived, or wrong-organization product for ${key}`
      );
    }
    if (
      product.recurringInterval !== interval ||
      (product.recurringIntervalCount ?? 1) !== 1
    ) {
      throw new Error(
        `Recurring interval mismatch for ${key}; create a separately reviewed product`
      );
    }
    if (product.metadata.product_tier !== plan.toUpperCase()) {
      throw new Error(`Tier metadata mismatch for ${key}`);
    }
    const current = getSupportedProductPrice(product);
    if (current.price.amountType !== 'seat_based') {
      throw new Error(
        `Changing billing models for ${key} requires a separate migration`
      );
    }
    if (current.minSeats !== 1 || current.maxSeats !== null) {
      throw new Error(
        `Seat bounds for ${key} differ from the proposed catalog`
      );
    }
    const amount =
      PROPOSED_WORKSPACE_CATALOG.prices[plan][
        interval === 'year' ? 'annual' : 'monthly'
      ];
    return {
      key,
      productId: product.id,
      interval,
      amount,
      currentAmount: current.pricePerSeat,
      currentPriceId: current.price.id,
      catalogVersion: PROPOSED_WORKSPACE_CATALOG.version,
      needsUpdate:
        current.pricePerSeat !== amount ||
        product.metadata.catalog_version !==
          PROPOSED_WORKSPACE_CATALOG.version ||
        product.metadata.catalog_key !== key,
    };
  });
}

/** Validate the whole database binding before the first provider mutation. */
export function assertCatalogDatabaseSnapshot(
  changes: ReturnType<typeof planCatalogSync>,
  rows: Array<Record<string, unknown>>
) {
  for (const change of changes) {
    const matches = rows.filter((row) => row.id === change.productId);
    const row = matches[0];
    if (
      matches.length !== 1 ||
      !row ||
      row.archived !== false ||
      row.pricing_model !== 'seat_based' ||
      row.recurring_interval !== change.interval ||
      row.tier !== change.key.split('-')[0]?.toUpperCase() ||
      (row.price_per_seat !== change.currentAmount &&
        row.price_per_seat !== change.amount)
    ) {
      throw new Error(
        `Database catalog mismatch for ${change.key}; no provider changes applied`
      );
    }
  }
}
