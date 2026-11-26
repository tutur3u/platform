import type { Subscription } from '@tuturuuu/payment/polar';
import type {
  BillingObservation,
  BillingProviderScope,
  BillingStatus,
} from './billing-provider';
import {
  isAiCreditPackProduct,
  isCustomDomainAddonProduct,
  parseWorkspaceProductTier,
} from './polar-product-metadata';

const statuses: Readonly<Partial<Record<string, BillingStatus>>> = {
  incomplete: 'pending',
  incomplete_expired: 'expired',
  trialing: 'active',
  active: 'active',
  past_due: 'billing_retry',
  canceled: 'canceled',
  unpaid: 'hold',
};

type PolarShadowObservation = BillingObservation<'polar'> & {
  bindingKey: string;
  cancelAtPeriodEnd: boolean;
  pricingModel: string | null;
};

type PolarShadowResult =
  | { kind: 'excluded' }
  | {
      kind: 'exception';
      reason:
        | 'unknown_status'
        | 'ambiguous_price'
        | 'invalid_scope'
        | 'missing_workspace'
        | 'unknown_workspace_product'
        | 'invalid_seats'
        | 'invalid_timestamp'
        | 'unsupported_price';
    }
  | { kind: 'observed'; observation: PolarShadowObservation };

type PolarShadowSubscription = Pick<
  Subscription,
  'id' | 'prices' | 'metadata' | 'status' | 'cancelAtPeriodEnd' | 'seats'
> & {
  product: Pick<Subscription['product'], 'id' | 'metadata' | 'organizationId'>;
  modifiedAt?: Date | string | null;
  createdAt: Date | string;
  currentPeriodStart: Date | string;
  currentPeriodEnd?: Date | string | null;
  canceledAt?: Date | string | null;
};

export function observePolarSubscription({
  subscription,
  scope,
  observedAt,
  eventId = null,
}: {
  subscription: PolarShadowSubscription;
  scope: BillingProviderScope<'polar'>;
  observedAt: string;
  eventId?: string | null;
}): PolarShadowResult {
  if (
    scope.provider !== 'polar' ||
    (scope.environment !== 'sandbox' && scope.environment !== 'production') ||
    !scope.application.trim() ||
    subscription.product.organizationId !== scope.application ||
    !subscription.id.trim() ||
    !subscription.product.id.trim()
  ) {
    return { kind: 'exception', reason: 'invalid_scope' };
  }
  const { metadata } = subscription.product;
  if (isAiCreditPackProduct(metadata) || isCustomDomainAddonProduct(metadata)) {
    return { kind: 'excluded' };
  }
  const workspaceId = subscription.metadata?.wsId;
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
    return { kind: 'exception', reason: 'missing_workspace' };
  }
  if (!parseWorkspaceProductTier(metadata)) {
    return { kind: 'exception', reason: 'unknown_workspace_product' };
  }

  const status = Object.hasOwn(statuses, subscription.status)
    ? statuses[subscription.status]
    : undefined;
  if (!status) return { kind: 'exception', reason: 'unknown_status' };
  if (subscription.prices.length > 1) {
    return { kind: 'exception', reason: 'ambiguous_price' };
  }

  const price = subscription.prices[0];
  if (price && !['seat_based', 'fixed', 'free'].includes(price.amountType)) {
    return { kind: 'exception', reason: 'unsupported_price' };
  }
  const seats = subscription.seats ?? null;
  if (
    (seats !== null || price?.amountType === 'seat_based') &&
    !isValidSeatCount(seats)
  ) {
    return { kind: 'exception', reason: 'invalid_seats' };
  }
  const providerUpdatedAt = toIsoTimestamp(
    subscription.modifiedAt ?? subscription.createdAt
  );
  const observed = toIsoTimestamp(observedAt);
  const periodStart = toIsoTimestamp(subscription.currentPeriodStart);
  const periodEnd = toIsoTimestamp(subscription.currentPeriodEnd);
  const canceledAt = toIsoTimestamp(subscription.canceledAt);
  if (
    !providerUpdatedAt ||
    !observed ||
    !periodStart ||
    (subscription.currentPeriodEnd != null && !periodEnd) ||
    (subscription.canceledAt != null && !canceledAt)
  ) {
    return { kind: 'exception', reason: 'invalid_timestamp' };
  }

  return {
    kind: 'observed',
    observation: {
      reference: { ...scope, subscriptionId: subscription.id },
      item: {
        productId: subscription.product.id,
        priceId: price?.id ?? null,
        basePlanId: null,
        offerId: null,
      },
      status,
      nativeStatus: subscription.status,
      ordering: {
        providerUpdatedAt,
        observedAt: observed,
        eventId,
        transactionId: null,
      },
      periodStart,
      periodEnd,
      accessUntil: null,
      graceUntil: null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt,
      revokedAt: null,
      autoRenews: subscription.cancelAtPeriodEnd ? false : null,
      pendingReplacement: null,
      quantity: price && price.amountType !== 'seat_based' ? null : seats,
      bindingKey: workspaceId,
      pricingModel: price?.amountType ?? null,
    },
  };
}

function toIsoTimestamp(value: Date | string | null | undefined) {
  if (value == null) return null;
  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function isValidSeatCount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

interface PolarLegacySnapshot {
  ws_id: string;
  updated_at: string | null;
  polar_subscription_id: string | null;
  product_id: string | null;
  status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  seat_count: number | null;
  cancel_at_period_end: boolean | null;
}

export function comparePolarLegacySnapshot({
  legacy,
  legacyScope,
  observation,
  seatBased,
}: {
  legacy: PolarLegacySnapshot;
  legacyScope: BillingProviderScope<'polar'>;
  observation: PolarShadowObservation;
  seatBased: boolean;
}) {
  const mismatches: Array<
    keyof PolarLegacySnapshot | 'environment' | 'application' | 'pricing_model'
  > = [];
  if (legacyScope.environment !== observation.reference.environment)
    mismatches.push('environment');
  if (legacyScope.application !== observation.reference.application)
    mismatches.push('application');
  if (
    observation.pricingModel &&
    (observation.pricingModel === 'seat_based') !== seatBased
  ) {
    mismatches.push('pricing_model');
  }

  const expected = {
    ws_id: observation.bindingKey,
    updated_at: observation.ordering.providerUpdatedAt,
    polar_subscription_id: observation.reference.subscriptionId,
    product_id: observation.item.productId,
    status: observation.nativeStatus,
    current_period_start: observation.periodStart,
    current_period_end: observation.periodEnd,
    cancel_at_period_end: observation.cancelAtPeriodEnd,
    seat_count: seatBased ? observation.quantity : null,
  } satisfies PolarLegacySnapshot;

  mismatches.push(
    ...(Object.keys(expected) as (keyof PolarLegacySnapshot)[]).filter(
      (field) => {
        const actual = legacy[field];
        const value = expected[field];
        if (
          field === 'seat_count' &&
          seatBased &&
          !isValidSeatCount(observation.quantity)
        )
          return true;
        if (
          (field === 'updated_at' ||
            field === 'current_period_start' ||
            field === 'current_period_end') &&
          typeof actual === 'string' &&
          typeof value === 'string'
        ) {
          return Date.parse(actual) !== Date.parse(value);
        }
        return actual !== value;
      }
    )
  );
  return mismatches;
}
