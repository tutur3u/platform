import { describe, expect, it } from 'vitest';
import {
  grandfatherSubscription,
  PERSONAL_CATALOG_VERSION,
  PERSONAL_PROFILES,
  personalOffers,
  personalPurchaseAdmission,
  planPersonalCatalog,
  qualifyPersonalCatalog,
  type BillingProvider,
  type LegacySubscription,
  type ObservedOffer,
  type Qualification,
} from './versioned-pricing-catalog';

const sourceSha = 'a'.repeat(40);

function observations(provider: BillingProvider): ObservedOffer[] {
  return personalOffers(provider).map((offer) => ({
    provider,
    accountId: 'expected-account',
    environment: 'production',
    catalogVersion: PERSONAL_CATALOG_VERSION,
    plan: offer.plan,
    period: offer.period,
    productId:
      offer.productIdentity.kind === 'provider_assigned'
        ? `provider-assigned-${offer.plan}-${offer.period}`
        : offer.productIdentity.productId,
    ...(offer.productIdentity.kind === 'play'
      ? { basePlanId: offer.productIdentity.basePlanId }
      : {}),
    currency: 'USD',
    amountMinor: offer.amountMinor,
    status: 'active',
    pricingModel: 'personal_fixed',
    readbackReceipt: 'provider-readback',
  }));
}

function qualifications(provider: BillingProvider): Qualification[] {
  return PERSONAL_PROFILES.map((profile) => ({
    provider,
    plan: profile.plan,
    catalogVersion: PERSONAL_CATALOG_VERSION,
    sourceSha,
    enforcedMonthlyAiUnits: profile.monthlyAiUnits,
    enforcedStorageBytes: profile.storageBytes,
    allocationReadReceipt: 'rex-live-allocation-read',
    enforcementTestReceipt: 'exact-source-quota-proof',
    providerLifecycleTestReceipt: 'exact-source-lifecycle-proof',
    securityAckReceipt: 'exact-source-security-ack',
  }));
}

function qualification(
  provider: BillingProvider,
  observed = observations(provider),
  proof = qualifications(provider)
) {
  return qualifyPersonalCatalog({
    provider,
    expectedAccountId: 'expected-account',
    sourceSha,
    observed,
    qualifications: proof,
  });
}

const legacy: LegacySubscription = {
  provider: 'polar',
  subscriptionId: 'legacy-subscription',
  productId: 'legacy-product',
  plan: 'plus',
  period: 'monthly',
  currency: 'USD',
  unitAmountMinor: 900,
  quantity: 7,
  monthlyAiUnits: 80_000,
  storageBytes: 40 * 1024 ** 3,
  discountIds: ['retained-discount'],
  scope: 'workspace',
  state: 'continuing',
};

describe('approved personal catalog', () => {
  it('uses exact integer prices, differentiated allowances and Max+ 1 TiB', () => {
    expect(
      PERSONAL_PROFILES.map((profile) => [
        profile.monthlyMinor,
        profile.annualMinor,
      ])
    ).toEqual([
      [999, 9999],
      [1999, 19999],
      [4999, 49999],
      [9999, 99999],
      [19999, 199999],
    ]);
    expect(PERSONAL_PROFILES.map((profile) => profile.monthlyAiUnits)).toEqual([
      50_000, 150_000, 250_000, 500_000, 1_000_000,
    ]);
    expect(PERSONAL_PROFILES.map((profile) => profile.storageBytes)).toEqual([
      20 * 1024 ** 3,
      100 * 1024 ** 3,
      1024 ** 4,
      1024 ** 4,
      1024 ** 4,
    ]);
  });

  it('annual billing replenishes the monthly allowance, with no annual lump sum', () => {
    const offers = personalOffers('apple');
    const monthly = offers.find(
      (offer) => offer.plan === 'ultimate' && offer.period === 'monthly'
    );
    const annual = offers.find(
      (offer) => offer.plan === 'ultimate' && offer.period === 'annual'
    );
    expect(monthly?.monthlyAiUnits).toBe(1_000_000);
    expect(annual?.monthlyAiUnits).toBe(monthly?.monthlyAiUnits);
    expect(annual?.replenishment).toBe('monthly');
    expect(annual?.quantity).toBe(1);
    expect(annual?.voice).toBe('free_metered');
  });

  it.each(['polar', 'apple', 'play'] as const)(
    'qualifies all five %s tiers only with every offer and proof',
    (provider) => {
      expect(qualification(provider).kind).toBe('qualified');
      expect(qualification(provider).decisions).toHaveLength(10);
      expect(qualification(provider, observations(provider), []).kind).toBe(
        'blocked'
      );
      expect(
        qualification(provider, observations(provider).slice(1)).kind
      ).toBe('blocked');
    }
  );

  it('does not let other-provider, stale-source or quota-mismatch proof authorize sale', () => {
    expect(
      qualification('apple', observations('apple'), qualifications('play')).kind
    ).toBe('blocked');
    expect(
      qualification(
        'apple',
        observations('apple'),
        qualifications('apple').map((proof) => ({
          ...proof,
          sourceSha: 'b'.repeat(40),
        }))
      ).kind
    ).toBe('blocked');
    expect(
      qualification(
        'apple',
        observations('apple'),
        qualifications('apple').map((proof) => ({
          ...proof,
          enforcedStorageBytes: 100 * 1024 ** 3,
        }))
      ).kind
    ).toBe('blocked');
  });

  it('requires the live allocation receipt and exact enforcement/security receipts', () => {
    const proofs = qualifications('polar').map((proof) => ({
      ...proof,
      allocationReadReceipt: '',
    }));
    expect(qualification('polar', observations('polar'), proofs).kind).toBe(
      'blocked'
    );
  });

  it.each([
    { currency: 'EUR' },
    { amountMinor: 998 },
    { status: 'inactive' },
    { pricingModel: 'seat_based' },
    { catalogVersion: 'legacy' },
    { readbackReceipt: '' },
  ] as const)('blocks observed drift %j', (drift) => {
    const observed = observations('polar').map((item, index) =>
      index === 0 ? { ...item, ...drift } : item
    );
    expect(qualification('polar', observed).kind).toBe('blocked');
  });

  it('rejects duplicate provider identities and ambiguous offer slots', () => {
    const observed = observations('polar');
    const first = observed[0];
    if (!first) throw new Error('Missing fixture');
    const reused = observed.map((item, index) =>
      index === 1 ? { ...item, productId: first.productId } : item
    );
    expect(qualification('polar', reused).kind).toBe('blocked');
    expect(qualification('polar', [...observed, first]).kind).toBe('blocked');
  });

  it('uses five Play products, ten base plans, and never invents Polar IDs', () => {
    const play = personalOffers('play');
    expect(
      new Set(
        play.map((offer) =>
          offer.productIdentity.kind === 'play'
            ? offer.productIdentity.productId
            : ''
        )
      ).size
    ).toBe(5);
    expect(
      planPersonalCatalog({
        provider: 'play',
        expectedAccountId: 'expected-account',
        observed: [],
      }).filter((action) => action.kind === 'create_new_versioned_product')
    ).toHaveLength(5);
    expect(
      planPersonalCatalog({
        provider: 'play',
        expectedAccountId: 'expected-account',
        observed: [],
      }).filter((action) => action.kind === 'create_base_plan')
    ).toHaveLength(5);
    expect(
      personalOffers('polar').every(
        (offer) => offer.productIdentity.kind === 'provider_assigned'
      )
    ).toBe(true);
  });

  it('plans missing versioned products but holds existing drift instead of repricing', () => {
    expect(
      planPersonalCatalog({
        provider: 'polar',
        expectedAccountId: 'expected-account',
        observed: [],
      })
    ).toHaveLength(10);
    expect(
      planPersonalCatalog({
        provider: 'polar',
        expectedAccountId: 'expected-account',
        observed: observations('polar'),
      }).every((action) => action.kind === 'retain')
    ).toBe(true);
    const drift = observations('polar').map((item) => ({
      ...item,
      amountMinor: 900,
    }));
    expect(
      planPersonalCatalog({
        provider: 'polar',
        expectedAccountId: 'expected-account',
        observed: drift,
      }).every((action) => action.kind === 'hold')
    ).toBe(true);
  });

  it('adds a missing Play base plan without recreating its existing product', () => {
    const annualOnly = observations('play').filter(
      (item) => item.period === 'annual'
    );
    const actions = planPersonalCatalog({
      provider: 'play',
      expectedAccountId: 'expected-account',
      observed: annualOnly,
    });
    expect(
      actions.filter((action) => action.kind === 'create_new_versioned_product')
    ).toHaveLength(0);
    expect(
      actions.filter((action) => action.kind === 'create_base_plan')
    ).toHaveLength(5);
    const legacyAnnual = annualOnly.map((item) => ({
      ...item,
      catalogVersion: 'legacy',
    }));
    expect(
      planPersonalCatalog({
        provider: 'play',
        expectedAccountId: 'expected-account',
        observed: legacyAnnual,
      }).every((action) => action.kind === 'hold')
    ).toBe(true);
  });

  it('does not qualify sandbox or wrong-account readback for sale', () => {
    expect(
      qualification(
        'apple',
        observations('apple').map((item) => ({
          ...item,
          environment: 'sandbox',
        }))
      ).kind
    ).toBe('blocked');
    expect(
      qualification(
        'polar',
        observations('polar').map((item) => ({
          ...item,
          accountId: 'another-account',
        }))
      ).kind
    ).toBe('blocked');
    expect(() =>
      planPersonalCatalog({
        provider: 'polar',
        expectedAccountId: 'expected-account',
        observed: observations('polar').map((item) => ({
          ...item,
          accountId: 'another-account',
        })),
      })
    ).toThrow('Wrong provider account or environment');
  });
});

describe('grandfathering and purchase admission', () => {
  it('preserves actual legacy price, capacity, seats and discounts with no provider mutation', () => {
    const result = grandfatherSubscription(legacy);
    expect(result.kind).toBe('preserve');
    if (result.kind !== 'preserve') throw new Error('Expected grandfathering');
    expect(result.subscription).toEqual(legacy);
    expect(result.subscription.unitAmountMinor).toBe(900);
    expect(result.subscription.quantity).toBe(7);
    expect(result.subscription.monthlyAiUnits).toBe(80_000);
    expect(result.subscription.discountIds).toEqual(['retained-discount']);
    expect(result.providerWrites).toEqual([]);
  });

  it('retains a canceled paid term and requires new checkout only after expiry', () => {
    expect(
      grandfatherSubscription({ ...legacy, state: 'canceled_paid_term' }).kind
    ).toBe('preserve');
    expect(grandfatherSubscription({ ...legacy, state: 'expired' })).toEqual({
      kind: 'new_checkout_required',
      previousSubscriptionId: legacy.subscriptionId,
    });
  });

  const admission = {
    actorId: 'actor',
    requestedWorkspace: {
      id: 'personal',
      creatorId: 'actor',
      personal: true,
      actorIsMember: true,
    },
    existing: [],
  };

  it('rejects a caller-selected team workspace or missing ownership/membership', () => {
    expect(personalPurchaseAdmission(admission)).toBe('allowed');
    for (const change of [
      { personal: false },
      { creatorId: 'other' },
      { actorIsMember: false },
    ]) {
      expect(
        personalPurchaseAdmission({
          ...admission,
          requestedWorkspace: { ...admission.requestedWorkspace, ...change },
        })
      ).toBe('wrong_personal_workspace');
    }
  });

  it('blocks overlapping paid/pending purchases across providers without automatic migration', () => {
    expect(
      personalPurchaseAdmission({
        ...admission,
        existing: [{ actorId: 'actor', provider: 'apple', state: 'pending' }],
      })
    ).toBe('existing_subscription');
    expect(
      personalPurchaseAdmission({
        ...admission,
        existing: [{ actorId: 'actor', provider: 'polar', state: 'active' }],
      })
    ).toBe('existing_subscription');
    expect(
      personalPurchaseAdmission({
        ...admission,
        existing: [{ actorId: 'actor', provider: 'polar', state: 'expired' }],
      })
    ).toBe('allowed');
  });
});
