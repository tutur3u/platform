import productIds from './polar-workspace-product-ids.json';
import {
  type SelectedWorkspaceCatalog,
  matchesWorkspaceCatalogOffer,
} from './workspace-catalog';

export {
  activeWorkspaceCatalog,
  getVersionedWorkspaceProductPrices,
  publicWorkspaceReferenceRates,
  resolveWorkspaceCheckoutCurrency,
  type WorkspaceCheckoutCurrency,
} from './workspace-catalog';

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

export interface PublicCurrencyPriceRow {
  product_id: string;
  price_id: string;
  currency: string;
  amount_per_seat: number;
}

export function publicVersionedWorkspacePrices(
  rows: PublicPriceRow[],
  catalog: SelectedWorkspaceCatalog,
  currencyRows: readonly PublicCurrencyPriceRow[]
) {
  const prices = {
    plus: { monthly: 0, annual: 0 },
    pro: { monthly: 0, annual: 0 },
    max: { monthly: 0, annual: 0 },
    ultra: { monthly: 0, annual: 0 },
  };
  const vndPrices = {
    plus: { monthly: 0, annual: 0 },
    pro: { monthly: 0, annual: 0 },
    max: { monthly: 0, annual: 0 },
    ultra: { monthly: 0, annual: 0 },
  };
  if (currencyRows.length !== catalog.length * 2) {
    throw new Error('Public currency catalog is unavailable');
  }
  for (const offer of catalog) {
    const matches = rows.filter((row) => row.id === offer.productId);
    const row = matches[0];
    if (
      matches.length !== 1 ||
      !row ||
      !matchesWorkspaceCatalogOffer(row, offer)
    )
      throw new Error('Public catalog is unavailable');
    const readPrice = (currency: string, priceId: string, amount: number) => {
      const pricesForCurrency = currencyRows.filter(
        (price) =>
          price.product_id === offer.productId && price.currency === currency
      );
      if (
        pricesForCurrency.length !== 1 ||
        pricesForCurrency[0]?.price_id !== priceId ||
        pricesForCurrency[0]?.amount_per_seat !== amount
      ) {
        throw new Error('Public currency catalog is unavailable');
      }
      return amount;
    };
    const term = offer.term === 'month' ? 'monthly' : 'annual';
    prices[offer.tier][term] = readPrice(
      'usd',
      offer.priceId,
      offer.unitAmount
    );
    vndPrices[offer.tier][term] = readPrice(
      'vnd',
      offer.vndPriceId,
      offer.vndUnitAmount
    );
  }
  return { currency: 'usd' as const, prices, vndPrices };
}
