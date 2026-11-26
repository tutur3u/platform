import productIds from './polar-workspace-product-ids.json';
import {
  type SelectedWorkspaceCatalog,
  matchesWorkspaceCatalogOffer,
} from './workspace-catalog';

export { activeWorkspaceCatalog } from './workspace-catalog';

export const PUBLIC_WORKSPACE_PRODUCT_IDS = Object.values(productIds);

export interface PublicPriceRow {
  id: string;
  tier: string | null;
  archived: boolean | null;
  pricing_model: string | null;
  price_per_seat: number | null;
  recurring_interval: string | null;
}

/** Only the four explicitly bound, active USD seat products reach public clients. */
export function publicWorkspacePrices(rows: PublicPriceRow[]) {
  const prices = {
    plus: { monthly: 0, annual: 0 },
    pro: { monthly: 0, annual: 0 },
  };
  for (const [key, id] of Object.entries(productIds)) {
    const matches = rows.filter((row) => row.id === id);
    const row = matches[0];
    const [tier, interval] = key.split('-') as [
      'plus' | 'pro',
      'month' | 'year',
    ];
    if (
      matches.length !== 1 ||
      !row ||
      row.archived !== false ||
      row.pricing_model !== 'seat_based' ||
      row.tier !== tier.toUpperCase() ||
      row.recurring_interval !== interval ||
      !Number.isSafeInteger(row.price_per_seat) ||
      (row.price_per_seat ?? 0) <= 0
    )
      throw new Error('Public catalog is unavailable');
    prices[tier][interval === 'month' ? 'monthly' : 'annual'] =
      row.price_per_seat!;
  }
  return { currency: 'usd' as const, prices };
}

export function publicVersionedWorkspacePrices(
  rows: PublicPriceRow[],
  catalog: SelectedWorkspaceCatalog
) {
  const prices = {
    plus: { monthly: 0, annual: 0 },
    pro: { monthly: 0, annual: 0 },
    max: { monthly: 0, annual: 0 },
    ultra: { monthly: 0, annual: 0 },
  };
  for (const offer of catalog) {
    const matches = rows.filter((row) => row.id === offer.productId);
    const row = matches[0];
    if (
      matches.length !== 1 ||
      !row ||
      !matchesWorkspaceCatalogOffer(row, offer)
    )
      throw new Error('Public catalog is unavailable');
    prices[offer.tier][offer.term === 'month' ? 'monthly' : 'annual'] =
      offer.unitAmount;
  }
  return { currency: 'usd' as const, prices };
}
