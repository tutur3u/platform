import { PLAN_AI_REFERENCE_POLICY_VERSION } from '@tuturuuu/utils/plan-ai-reference-policy';
import { describe, expect, it } from 'vitest';
import { publicVersionedWorkspacePrices } from './public-prices';
import { isSelfServeWorkspaceProduct } from './self-serve-products';
import {
  isStagedWorkspaceCatalogProduct,
  publicWorkspaceReferenceRates,
  selectWorkspaceCatalog,
  WORKSPACE_CATALOG_VERSION,
  workspaceCatalogOffers,
} from './workspace-catalog';

const bindings = workspaceCatalogOffers().map((offer) => ({
  ...offer,
  productId: `fixture-product-${offer.key}`,
  priceId: `fixture-price-${offer.key}`,
  currency: 'usd',
  pricingModel: 'seat_based',
  taxBehavior: 'exclusive',
  minSeats: 1,
  maxSeats: null,
}));

const approved = {
  version: WORKSPACE_CATALOG_VERSION,
  schemaStamp: 'fixture-schema',
  entitlementApproval: 'fixture-entitlements',
  providerReadback: 'fixture-readback',
  bindings,
};

const rows = bindings.map((offer) => ({
  id: offer.productId,
  tier: offer.tier.toUpperCase(),
  archived: false,
  pricing_model: 'seat_based',
  recurring_interval: offer.term,
  price_per_seat: offer.unitAmount,
}));

describe('workspace catalog migration', () => {
  it('keeps legacy checkout active and rejects higher tiers by default', () => {
    expect(selectWorkspaceCatalog(false, approved)).toBeNull();
    expect(isSelfServeWorkspaceProduct(rows[0]!)).toBe(true);
    expect(isSelfServeWorkspaceProduct(rows[4]!)).toBe(false);
    expect(isSelfServeWorkspaceProduct(rows[6]!)).toBe(false);
  });

  it('fails closed before approval and on incomplete or drifting bindings', () => {
    expect(() => selectWorkspaceCatalog(true)).toThrow();
    expect(() =>
      selectWorkspaceCatalog(true, { ...approved, schemaStamp: '' })
    ).toThrow();
    expect(() =>
      selectWorkspaceCatalog(true, { ...approved, bindings: bindings.slice(1) })
    ).toThrow();
    expect(() =>
      selectWorkspaceCatalog(true, {
        ...approved,
        bindings: [{ ...bindings[0]!, currency: 'vnd' }, ...bindings.slice(1)],
      })
    ).toThrow();
  });

  it('projects eight verified USD offers without exposing provider identifiers', () => {
    const selection = selectWorkspaceCatalog(true, approved)!;
    expect(publicVersionedWorkspacePrices(rows, selection)).toEqual({
      currency: 'usd',
      prices: {
        plus: { monthly: 1000, annual: 10000 },
        pro: { monthly: 2000, annual: 20000 },
        max: { monthly: 10000, annual: 100000 },
        ultra: { monthly: 20000, annual: 200000 },
      },
    });
    expect(() =>
      publicVersionedWorkspacePrices(rows.slice(1), selection)
    ).toThrow();
    expect(() =>
      publicVersionedWorkspacePrices([...rows, rows[0]!], selection)
    ).toThrow();
  });
});

it('publishes only display fields from a separately approved rate revision', () => {
  const snapshot = {
    revision: 'fixture-rate-revision',
    approval: 'fixture-admin-approval',
    rates: [
      {
        policyVersion: PLAN_AI_REFERENCE_POLICY_VERSION,
        modelId: 'fixture-model',
        referenceCredits: 44,
        multiplierBasisPoints: 15_500,
        exampleInputTokens: 2_000,
        exampleOutputTokens: 1_000,
      },
    ],
  } as const;
  expect(
    publicWorkspaceReferenceRates({ ...snapshot, approval: '' })
  ).toBeNull();
  expect(publicWorkspaceReferenceRates(snapshot)).toEqual({
    revision: 'fixture-rate-revision',
    rates: [
      {
        modelId: 'fixture-model',
        multiplierBasisPoints: 15_500,
        exampleCredits: 69,
        exampleInputTokens: 2_000,
        exampleOutputTokens: 1_000,
      },
    ],
  });
});

it('keeps only matching private staged products out of the legacy projection', () => {
  const product = {
    visibility: 'private',
    recurringInterval: 'year',
    metadata: {
      catalog_version: WORKSPACE_CATALOG_VERSION,
      catalog_key: 'max-year-usd',
      product_tier: 'MAX',
    },
  };
  expect(isStagedWorkspaceCatalogProduct(product)).toBe(true);
  expect(
    isStagedWorkspaceCatalogProduct({ ...product, visibility: 'public' })
  ).toBe(false);
  expect(
    isStagedWorkspaceCatalogProduct({
      ...product,
      metadata: { ...product.metadata, product_tier: 'PRO' },
    })
  ).toBe(false);
});
