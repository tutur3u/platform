import { PLAN_AI_REFERENCE_POLICY_VERSION } from '@tuturuuu/utils/plan-ai-reference-policy';
import { describe, expect, it } from 'vitest';
import { publicVersionedWorkspacePrices } from './public-prices';
import { isSelfServeWorkspaceProduct } from './self-serve-products';
import {
  resolveWorkspaceCheckoutCurrency,
  publicWorkspaceReferenceRates,
  selectWorkspaceCatalog,
  WORKSPACE_CATALOG_VERSION,
  workspaceCatalogOffers,
} from './workspace-catalog';

const bindings = workspaceCatalogOffers().map((offer) => ({
  ...offer,
  productId: `fixture-product-${offer.key}`,
  priceId: `fixture-price-${offer.key}`,
  vndPriceId: `fixture-vnd-price-${offer.key}`,
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

  const currencyRows = bindings.flatMap((offer) => [
    {
      product_id: offer.productId,
      price_id: offer.priceId,
      currency: 'usd',
      amount_per_seat: offer.unitAmount,
    },
    {
      product_id: offer.productId,
      price_id: offer.vndPriceId,
      currency: 'vnd',
      amount_per_seat: offer.vndUnitAmount,
    },
  ]);

  it('projects eight verified USD and VND offers without exposing provider identifiers', () => {
    const selection = selectWorkspaceCatalog(true, approved)!;
    expect(
      publicVersionedWorkspacePrices(rows, selection, currencyRows)
    ).toEqual({
      currency: 'usd',
      prices: {
        plus: { monthly: 1000, annual: 10000 },
        pro: { monthly: 2000, annual: 20000 },
        max: { monthly: 10000, annual: 100000 },
        ultra: { monthly: 20000, annual: 200000 },
      },
      vndPrices: {
        plus: { monthly: 249000, annual: 2490000 },
        pro: { monthly: 499000, annual: 4990000 },
        max: { monthly: 2499000, annual: 24990000 },
        ultra: { monthly: 4999000, annual: 49990000 },
      },
    });
    expect(() =>
      publicVersionedWorkspacePrices(rows, selection, currencyRows.slice(1))
    ).toThrow();
    expect(() =>
      publicVersionedWorkspacePrices(rows.slice(1), selection, currencyRows)
    ).toThrow();
    expect(() =>
      publicVersionedWorkspacePrices(
        [...rows, rows[0]!],
        selection,
        currencyRows
      )
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

it('resolves explicit currency before country and locale', () => {
  expect(resolveWorkspaceCheckoutCurrency({ billingCountry: ' vn ' })).toBe(
    'vnd'
  );
  expect(resolveWorkspaceCheckoutCurrency({ locale: 'en-VN' })).toBe('vnd');
  expect(resolveWorkspaceCheckoutCurrency({ locale: 'vi' })).toBe('vnd');
  expect(
    resolveWorkspaceCheckoutCurrency({ billingCountry: 'US', locale: 'vi' })
  ).toBe('usd');
  expect(
    resolveWorkspaceCheckoutCurrency({ billingCountry: 'VN', override: 'usd' })
  ).toBe('usd');
  expect(resolveWorkspaceCheckoutCurrency({ locale: 'en-US' })).toBe('usd');
});
