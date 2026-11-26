import type { Subscription } from '@tuturuuu/payment/polar';
import type {
  BillingObservation,
  BillingProviderScope,
  BillingStatus,
} from './billing-provider';
import {
  isAiCreditPackProduct,
  isCustomDomainAddonProduct,
} from './polar-product-metadata';

const statuses: Readonly<Partial<Record<string, BillingStatus>>> = {
  incomplete: 'pending',
  incomplete_expired: 'expired',
  trialing: 'active',
  active: 'active',
  past_due: 'billing_retry',
  canceled: 'canceled',
  unpaid: 'hold',
  paused: 'paused',
};

type PolarShadowObservation = BillingObservation<'polar'> & {
  cancelAtPeriodEnd: boolean;
};

type PolarShadowResult =
  | { kind: 'excluded' }
  | { kind: 'exception'; reason: 'unknown_status' | 'ambiguous_price' }
  | { kind: 'observed'; observation: PolarShadowObservation };

type PolarShadowSubscription = Pick<
  Subscription,
  | 'id'
  | 'prices'
  | 'status'
  | 'modifiedAt'
  | 'createdAt'
  | 'currentPeriodStart'
  | 'currentPeriodEnd'
  | 'cancelAtPeriodEnd'
  | 'canceledAt'
  | 'seats'
> & { product: Pick<Subscription['product'], 'id' | 'metadata'> };

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
  const { metadata } = subscription.product;
  if (isAiCreditPackProduct(metadata) || isCustomDomainAddonProduct(metadata)) {
    return { kind: 'excluded' };
  }

  const status = Object.hasOwn(statuses, subscription.status)
    ? statuses[subscription.status]
    : undefined;
  if (!status) return { kind: 'exception', reason: 'unknown_status' };
  if (subscription.prices.length > 1) {
    return { kind: 'exception', reason: 'ambiguous_price' };
  }

  return {
    kind: 'observed',
    observation: {
      reference: { ...scope, subscriptionId: subscription.id },
      item: {
        productId: subscription.product.id,
        priceId: subscription.prices[0]?.id ?? null,
        basePlanId: null,
        offerId: null,
      },
      status,
      nativeStatus: subscription.status,
      ordering: {
        providerUpdatedAt: (
          subscription.modifiedAt ?? subscription.createdAt
        ).toISOString(),
        observedAt,
        eventId,
        transactionId: null,
      },
      periodStart: subscription.currentPeriodStart.toISOString(),
      periodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      accessUntil: null,
      graceUntil: null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt?.toISOString() ?? null,
      revokedAt: null,
      autoRenews:
        !subscription.cancelAtPeriodEnd &&
        (status === 'active' || status === 'billing_retry'),
      pendingReplacement: null,
      quantity: subscription.seats ?? null,
      bindingKey: null,
    },
  };
}

interface PolarLegacySnapshot {
  polar_subscription_id: string | null;
  product_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  seat_count: number | null;
  cancel_at_period_end: boolean;
}

export function comparePolarLegacySnapshot({
  legacy,
  observation,
  seatBased,
}: {
  legacy: PolarLegacySnapshot;
  observation: PolarShadowObservation;
  seatBased: boolean;
}) {
  const expected = {
    polar_subscription_id: observation.reference.subscriptionId,
    product_id: observation.item.productId,
    status: observation.nativeStatus,
    current_period_start: observation.periodStart,
    current_period_end: observation.periodEnd,
    cancel_at_period_end: observation.cancelAtPeriodEnd,
    seat_count: seatBased ? observation.quantity : null,
  } satisfies PolarLegacySnapshot;

  return (Object.keys(expected) as (keyof PolarLegacySnapshot)[]).filter(
    (field) => {
      const actual = legacy[field];
      const value = expected[field];
      if (
        (field === 'current_period_start' || field === 'current_period_end') &&
        typeof actual === 'string' &&
        typeof value === 'string'
      ) {
        return Date.parse(actual) !== Date.parse(value);
      }
      return actual !== value;
    }
  );
}
