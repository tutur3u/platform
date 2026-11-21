export const PERSONAL_CATALOG_VERSION = 'd301a-personal-v1';
export type PersonalPlan = 'plus' | 'pro' | 'max' | 'ultra' | 'ultimate';
export type BillingPeriod = 'monthly' | 'annual';
export type BillingProvider = 'polar' | 'apple' | 'play';

export type PersonalProfile = Readonly<{
  plan: PersonalPlan;
  nameEn: string;
  nameVi: string;
  monthlyMinor: number;
  annualMinor: number;
  monthlyAiUnits: number;
  storageBytes: number;
}>;

const gib = 1024 ** 3;
const tib = 1024 ** 4;

export const PERSONAL_PROFILES: readonly PersonalProfile[] = [
  {
    plan: 'plus',
    nameEn: 'Plus',
    nameVi: 'Nâng cao',
    monthlyMinor: 999,
    annualMinor: 9999,
    monthlyAiUnits: 50_000,
    storageBytes: 20 * gib,
  },
  {
    plan: 'pro',
    nameEn: 'Pro',
    nameVi: 'Chuyên nghiệp',
    monthlyMinor: 1999,
    annualMinor: 19999,
    monthlyAiUnits: 150_000,
    storageBytes: 100 * gib,
  },
  {
    plan: 'max',
    nameEn: 'Max',
    nameVi: 'Mở rộng',
    monthlyMinor: 4999,
    annualMinor: 49999,
    monthlyAiUnits: 250_000,
    storageBytes: tib,
  },
  {
    plan: 'ultra',
    nameEn: 'Ultra',
    nameVi: 'Chuyên sâu',
    monthlyMinor: 9999,
    annualMinor: 99999,
    monthlyAiUnits: 500_000,
    storageBytes: tib,
  },
  {
    plan: 'ultimate',
    nameEn: 'Ultimate',
    nameVi: 'Toàn diện',
    monthlyMinor: 19999,
    annualMinor: 199999,
    monthlyAiUnits: 1_000_000,
    storageBytes: tib,
  },
];

export type PersonalOffer = Readonly<{
  catalogVersion: typeof PERSONAL_CATALOG_VERSION;
  provider: BillingProvider;
  plan: PersonalPlan;
  period: BillingPeriod;
  currency: 'USD';
  amountMinor: number;
  monthlyAiUnits: number;
  storageBytes: number;
  quantity: 1;
  replenishment: 'monthly';
  scope: 'actor_personal_workspace';
  voice: 'free_metered';
  productIdentity:
    | { kind: 'provider_assigned' }
    | { kind: 'apple'; productId: string }
    | { kind: 'play'; productId: string; basePlanId: BillingPeriod };
}>;

export function personalOffers(provider: BillingProvider): PersonalOffer[] {
  const periods: BillingPeriod[] = ['monthly', 'annual'];
  return PERSONAL_PROFILES.flatMap((profile) =>
    periods.map((period): PersonalOffer => ({
      catalogVersion: PERSONAL_CATALOG_VERSION,
      provider,
      plan: profile.plan,
      period,
      currency: 'USD',
      amountMinor:
        period === 'monthly' ? profile.monthlyMinor : profile.annualMinor,
      monthlyAiUnits: profile.monthlyAiUnits,
      storageBytes: profile.storageBytes,
      quantity: 1,
      replenishment: 'monthly',
      scope: 'actor_personal_workspace',
      voice: 'free_metered',
      productIdentity:
        provider === 'polar'
          ? { kind: 'provider_assigned' }
          : provider === 'apple'
            ? {
                kind: 'apple',
                productId: `com.tuturuuu.app.mobile.${profile.plan}.${period}`,
              }
            : {
                kind: 'play',
                productId: `tuturuuu_${profile.plan}`,
                basePlanId: period,
              },
    }))
  );
}

// Supplied by server-side provider readback adapters, never client checkout data.
export type ObservedOffer = Readonly<{
  provider: BillingProvider;
  accountId: string;
  environment: 'production' | 'sandbox';
  catalogVersion: string;
  plan: PersonalPlan;
  period: BillingPeriod;
  productId: string;
  basePlanId?: string;
  currency: string;
  amountMinor: number;
  status: 'active' | 'inactive';
  pricingModel: 'personal_fixed' | 'seat_based';
  readbackReceipt: string;
}>;

export type Qualification = Readonly<{
  provider: BillingProvider;
  plan: PersonalPlan;
  catalogVersion: string;
  sourceSha: string;
  enforcedMonthlyAiUnits: number;
  enforcedStorageBytes: number;
  allocationReadReceipt: string;
  enforcementTestReceipt: string;
  providerLifecycleTestReceipt: string;
  securityAckReceipt: string;
}>;

export type OfferBlocker =
  | 'missing_product'
  | 'ambiguous_product'
  | 'duplicate_product_identity'
  | 'catalog_version_mismatch'
  | 'invalid_product_identity'
  | 'price_or_currency_mismatch'
  | 'not_active'
  | 'seat_conversion_forbidden'
  | 'missing_readback'
  | 'unqualified_profile';

export type OfferDecision =
  | { kind: 'blocked'; offer: PersonalOffer; blockers: OfferBlocker[] }
  | {
      kind: 'qualified';
      offer: PersonalOffer;
      binding: ObservedOffer;
      proof: Qualification;
    };

function slot(value: { plan: PersonalPlan; period: BillingPeriod }): string {
  return `${value.plan}:${value.period}`;
}

function identity(value: ObservedOffer): string {
  return `${value.provider}:${value.productId}:${value.basePlanId ?? ''}`;
}

function validProof(
  offer: PersonalOffer,
  proof: Qualification,
  sourceSha: string
): boolean {
  return (
    proof.provider === offer.provider &&
    proof.plan === offer.plan &&
    proof.catalogVersion === PERSONAL_CATALOG_VERSION &&
    proof.sourceSha === sourceSha &&
    /^[a-f0-9]{40}$/.test(sourceSha) &&
    proof.enforcedMonthlyAiUnits === offer.monthlyAiUnits &&
    proof.enforcedStorageBytes === offer.storageBytes &&
    [
      proof.allocationReadReceipt,
      proof.enforcementTestReceipt,
      proof.providerLifecycleTestReceipt,
      proof.securityAckReceipt,
    ].every((receipt) => receipt.trim().length > 0)
  );
}

function matchesIdentity(
  offer: PersonalOffer,
  binding: ObservedOffer
): boolean {
  if (!binding.productId.trim()) return false;
  switch (offer.productIdentity.kind) {
    case 'provider_assigned':
      return binding.basePlanId === undefined;
    case 'apple':
      return (
        binding.productId === offer.productIdentity.productId &&
        binding.basePlanId === undefined
      );
    case 'play':
      return (
        binding.productId === offer.productIdentity.productId &&
        binding.basePlanId === offer.productIdentity.basePlanId
      );
  }
}

export function qualifyPersonalCatalog(args: {
  provider: BillingProvider;
  expectedAccountId: string;
  sourceSha: string;
  observed: readonly ObservedOffer[];
  qualifications: readonly Qualification[];
}): Readonly<{ kind: 'blocked' | 'qualified'; decisions: OfferDecision[] }> {
  const observations = args.observed.filter(
    (item) => item.provider === args.provider
  );
  const decisions = personalOffers(args.provider).map(
    (offer): OfferDecision => {
      const candidates = observations.filter(
        (item) => slot(item) === slot(offer)
      );
      const binding = candidates[0];
      if (!binding)
        return { kind: 'blocked', offer, blockers: ['missing_product'] };
      if (candidates.length !== 1)
        return { kind: 'blocked', offer, blockers: ['ambiguous_product'] };
      const blockers: OfferBlocker[] = [];
      if (
        observations.filter((item) => identity(item) === identity(binding))
          .length !== 1
      ) {
        blockers.push('duplicate_product_identity');
      }
      if (binding.catalogVersion !== PERSONAL_CATALOG_VERSION)
        blockers.push('catalog_version_mismatch');
      if (
        !args.expectedAccountId.trim() ||
        binding.accountId !== args.expectedAccountId ||
        binding.environment !== 'production' ||
        !matchesIdentity(offer, binding)
      ) {
        blockers.push('invalid_product_identity');
      }
      if (
        !Number.isSafeInteger(binding.amountMinor) ||
        binding.amountMinor !== offer.amountMinor ||
        binding.currency !== 'USD'
      )
        blockers.push('price_or_currency_mismatch');
      if (binding.status !== 'active') blockers.push('not_active');
      if (binding.pricingModel !== 'personal_fixed')
        blockers.push('seat_conversion_forbidden');
      if (!binding.readbackReceipt.trim()) blockers.push('missing_readback');
      const proofs = args.qualifications.filter((proof) =>
        validProof(offer, proof, args.sourceSha)
      );
      const proof = proofs[0];
      if (proofs.length !== 1 || !proof) blockers.push('unqualified_profile');
      if (blockers.length > 0 || !proof)
        return { kind: 'blocked', offer, blockers };
      return { kind: 'qualified', offer, binding, proof };
    }
  );
  return {
    kind: decisions.every((decision) => decision.kind === 'qualified')
      ? 'qualified'
      : 'blocked',
    decisions,
  };
}

export type CatalogAction =
  | {
      kind: 'create_new_versioned_product';
      offer: PersonalOffer;
      rollback: 'deactivate_created_product';
    }
  | {
      kind: 'create_base_plan';
      offer: PersonalOffer;
      productId: string;
      rollback: 'deactivate_created_base_plan';
    }
  | { kind: 'retain'; offer: PersonalOffer; productId: string }
  | {
      kind: 'hold';
      offer: PersonalOffer;
      reason: 'ambiguous_binding' | 'existing_binding_drift';
    };

// Produces a packet plan only. It never mutates, reprices or deactivates anything.
export function planPersonalCatalog(args: {
  provider: BillingProvider;
  expectedAccountId: string;
  observed: readonly ObservedOffer[];
}): CatalogAction[] {
  if (!args.expectedAccountId.trim())
    throw new Error('Provider account binding required');
  if (
    args.observed.some(
      (item) =>
        item.provider === args.provider &&
        (item.accountId !== args.expectedAccountId ||
          item.environment !== 'production')
    )
  ) {
    throw new Error('Wrong provider account or environment');
  }
  return personalOffers(args.provider).map((offer): CatalogAction => {
    const bindings = args.observed.filter(
      (item) => item.provider === args.provider && slot(item) === slot(offer)
    );
    const binding = bindings[0];
    if (!binding) {
      if (offer.productIdentity.kind === 'play') {
        const productId = offer.productIdentity.productId;
        if (
          args.observed.some(
            (item) =>
              item.provider === 'play' &&
              item.productId === productId &&
              (item.catalogVersion !== PERSONAL_CATALOG_VERSION ||
                item.pricingModel !== 'personal_fixed')
          )
        ) {
          return { kind: 'hold', offer, reason: 'existing_binding_drift' };
        }
        const existingProduct = args.observed.some(
          (item) => item.provider === 'play' && item.productId === productId
        );
        if (existingProduct || offer.period === 'annual') {
          return {
            kind: 'create_base_plan',
            offer,
            productId,
            rollback: 'deactivate_created_base_plan',
          };
        }
      }
      return {
        kind: 'create_new_versioned_product',
        offer,
        rollback: 'deactivate_created_product',
      };
    }
    if (bindings.length !== 1)
      return { kind: 'hold', offer, reason: 'ambiguous_binding' };
    if (
      binding.catalogVersion !== PERSONAL_CATALOG_VERSION ||
      !matchesIdentity(offer, binding) ||
      binding.amountMinor !== offer.amountMinor ||
      binding.currency !== 'USD' ||
      binding.pricingModel !== 'personal_fixed'
    ) {
      return { kind: 'hold', offer, reason: 'existing_binding_drift' };
    }
    return { kind: 'retain', offer, productId: binding.productId };
  });
}

export type LegacySubscription = Readonly<{
  provider: BillingProvider;
  subscriptionId: string;
  productId: string;
  plan: 'plus' | 'pro';
  period: BillingPeriod;
  currency: string;
  unitAmountMinor: number;
  quantity: number;
  monthlyAiUnits: number;
  storageBytes: number;
  discountIds: readonly string[];
  scope: 'personal' | 'workspace';
  state: 'continuing' | 'canceled_paid_term' | 'expired';
}>;

export function grandfatherSubscription(subscription: LegacySubscription):
  | {
      kind: 'preserve';
      subscription: LegacySubscription;
      providerWrites: readonly [];
    }
  | { kind: 'new_checkout_required'; previousSubscriptionId: string } {
  if (
    !subscription.subscriptionId ||
    !subscription.productId ||
    !Number.isSafeInteger(subscription.unitAmountMinor) ||
    subscription.unitAmountMinor < 0 ||
    !Number.isSafeInteger(subscription.quantity) ||
    subscription.quantity < 1 ||
    !Number.isSafeInteger(subscription.monthlyAiUnits) ||
    subscription.monthlyAiUnits < 0 ||
    !Number.isSafeInteger(subscription.storageBytes) ||
    subscription.storageBytes < 0
  ) {
    throw new Error('Invalid legacy subscription snapshot');
  }
  if (subscription.state === 'expired') {
    return {
      kind: 'new_checkout_required',
      previousSubscriptionId: subscription.subscriptionId,
    };
  }
  return { kind: 'preserve', subscription, providerWrites: [] };
}

export function personalPurchaseAdmission(args: {
  actorId: string;
  requestedWorkspace: {
    id: string;
    creatorId: string;
    personal: boolean;
    actorIsMember: boolean;
  };
  existing: readonly {
    actorId: string;
    provider: BillingProvider;
    state: 'active' | 'pending' | 'expired';
  }[];
}): 'allowed' | 'wrong_personal_workspace' | 'existing_subscription' {
  const workspace = args.requestedWorkspace;
  if (
    !args.actorId ||
    !workspace.id ||
    !workspace.personal ||
    workspace.creatorId !== args.actorId ||
    !workspace.actorIsMember
  )
    return 'wrong_personal_workspace';
  if (
    args.existing.some(
      (item) => item.actorId === args.actorId && item.state !== 'expired'
    )
  ) {
    return 'existing_subscription';
  }
  return 'allowed';
}
