import {
  type ApprovedModelRate,
  creditsForReferenceRate,
} from '@tuturuuu/utils/plan-ai-reference-policy';

export const WORKSPACE_CATALOG_VERSION = '20261126-v2';

const catalogPrices = {
  plus: { month: 1000, year: 10000 },
  pro: { month: 2000, year: 20000 },
  max: { month: 10000, year: 100000 },
  ultra: { month: 20000, year: 200000 },
} as const;

type Tier = keyof typeof catalogPrices;
type Term = 'month' | 'year';
type CatalogKey = `${Tier}-${Term}-usd`;

export function workspaceCatalogOffers() {
  return (Object.keys(catalogPrices) as Tier[]).flatMap((tier) =>
    (['month', 'year'] as const).map((term) => ({
      key: `${tier}-${term}-usd` as CatalogKey,
      tier,
      term,
      unitAmount: catalogPrices[tier][term],
    }))
  );
}

type Binding = {
  key: CatalogKey;
  productId: string;
  priceId: string;
  currency: string;
  unitAmount: number;
  pricingModel: string;
  taxBehavior: string;
  minSeats: number;
  maxSeats: number | null;
};

type VerifiedCatalog = {
  version: string;
  schemaStamp: string;
  entitlementApproval: string;
  providerReadback: string;
  bindings: readonly Binding[];
};

type ReferenceRateSnapshot = {
  revision: string;
  approval: string;
  rates: readonly (ApprovedModelRate & {
    exampleInputTokens: number;
    exampleOutputTokens: number;
  })[];
};

// Populate from reviewed server-side bindings after the schema and entitlement gates.
const workspaceCatalogConfig: {
  enabled: boolean;
  approved?: VerifiedCatalog;
  approvedReferenceRates?: ReferenceRateSnapshot;
} = { enabled: false };

export function selectWorkspaceCatalog(
  enabled = false,
  catalog: VerifiedCatalog | undefined = workspaceCatalogConfig.approved
) {
  if (!enabled) return null;
  if (
    catalog?.version !== WORKSPACE_CATALOG_VERSION ||
    !catalog.schemaStamp.trim() ||
    !catalog.entitlementApproval.trim() ||
    !catalog.providerReadback.trim()
  )
    throw new Error('Workspace catalog approval is incomplete');

  const offers = workspaceCatalogOffers();
  const { bindings } = catalog;
  if (
    bindings.length !== offers.length ||
    new Set(bindings.map(({ productId }) => productId)).size !==
      offers.length ||
    new Set(bindings.map(({ priceId }) => priceId)).size !== offers.length
  )
    throw new Error('Workspace catalog bindings are incomplete or ambiguous');

  return offers.map((offer) => {
    const binding = bindings.find(({ key }) => key === offer.key);
    if (
      !binding?.productId.trim() ||
      !binding.priceId.trim() ||
      binding.currency !== 'usd' ||
      binding.unitAmount !== offer.unitAmount ||
      binding.pricingModel !== 'seat_based' ||
      binding.taxBehavior !== 'exclusive' ||
      binding.minSeats !== 1 ||
      binding.maxSeats !== null
    )
      throw new Error('Workspace catalog binding mismatch');
    return { ...offer, productId: binding.productId, priceId: binding.priceId };
  });
}

export type SelectedWorkspaceCatalog = NonNullable<
  ReturnType<typeof selectWorkspaceCatalog>
>;

// Cutover requires an approved binding set and a reviewed source change.
export function activeWorkspaceCatalog() {
  return selectWorkspaceCatalog(workspaceCatalogConfig.enabled);
}

export function publicWorkspaceReferenceRates(
  snapshot = workspaceCatalogConfig.approvedReferenceRates
) {
  if (
    !snapshot?.revision.trim() ||
    !snapshot.approval.trim() ||
    snapshot.rates.length === 0 ||
    new Set(snapshot.rates.map((rate) => rate.modelId)).size !==
      snapshot.rates.length
  )
    return null;

  const rates = snapshot.rates.map((rate) => {
    const exampleCredits = creditsForReferenceRate(rate);
    if (
      exampleCredits === null ||
      !Number.isSafeInteger(rate.exampleInputTokens) ||
      rate.exampleInputTokens <= 0 ||
      !Number.isSafeInteger(rate.exampleOutputTokens) ||
      rate.exampleOutputTokens <= 0
    )
      return null;
    return {
      modelId: rate.modelId,
      multiplierBasisPoints: rate.multiplierBasisPoints,
      exampleCredits,
      exampleInputTokens: rate.exampleInputTokens,
      exampleOutputTokens: rate.exampleOutputTokens,
    };
  });
  if (rates.some((rate) => rate === null)) return null;
  return {
    revision: snapshot.revision,
    rates: rates.filter((rate) => rate !== null),
  };
}

export function isStagedWorkspaceCatalogProduct(product: {
  visibility: string;
  recurringInterval: string | null;
  metadata: Readonly<Record<string, unknown>>;
}) {
  if (workspaceCatalogConfig.enabled || product.visibility !== 'private')
    return false;
  const { catalog_key, catalog_version, product_tier } = product.metadata;
  return (
    catalog_version === WORKSPACE_CATALOG_VERSION &&
    workspaceCatalogOffers().some(
      (offer) =>
        offer.key === catalog_key &&
        offer.term === product.recurringInterval &&
        offer.tier.toUpperCase() === product_tier
    )
  );
}

export function isReservedWorkspaceCatalogProduct(productId: string) {
  return (
    workspaceCatalogConfig.approved?.bindings.some(
      (binding) => binding.productId === productId
    ) ?? false
  );
}

export function matchesWorkspaceCatalogOffer(
  row: {
    id?: string;
    tier: string | null;
    archived: boolean | null;
    pricing_model: string | null;
    price_per_seat?: number | null;
    recurring_interval?: string | null;
  },
  offer: SelectedWorkspaceCatalog[number]
) {
  return (
    row.id === offer.productId &&
    row.tier === offer.tier.toUpperCase() &&
    row.archived === false &&
    row.pricing_model === 'seat_based' &&
    row.price_per_seat === offer.unitAmount &&
    row.recurring_interval === offer.term
  );
}
