export type BillingProviderId = 'polar' | 'apple' | 'play';

export interface BillingProviderScope<P extends BillingProviderId> {
  provider: P;
  environment: 'sandbox' | 'production';
  application: string;
}

export interface BillingSubscriptionReference<
  P extends BillingProviderId,
> extends BillingProviderScope<P> {
  subscriptionId: string;
}

export interface BillingCatalogItem {
  productId: string;
  priceId: string | null;
  basePlanId: string | null;
  offerId: string | null;
}

export type BillingStatus =
  | 'pending'
  | 'active'
  | 'grace'
  | 'billing_retry'
  | 'hold'
  | 'paused'
  | 'canceled'
  | 'expired'
  | 'refunded'
  | 'revoked';

export interface BillingObservation<P extends BillingProviderId> {
  reference: BillingSubscriptionReference<P>;
  item: BillingCatalogItem;
  nativeAmount: { currency: string; minorAmount: number } | null;
  status: BillingStatus;
  nativeStatus: string;
  ordering: {
    providerUpdatedAt: string | null;
    observedAt: string;
    eventId: string | null;
    transactionId: string | null;
  };
  periodStart: string | null;
  periodEnd: string | null;
  accessUntil: string | null;
  graceUntil: string | null;
  canceledAt: string | null;
  cancelAtPeriodEnd: boolean | null;
  revokedAt: string | null;
  autoRenews: boolean | null;
  pendingReplacement: BillingCatalogItem | null;
  quantity: number | null;
  bindingKey: string | null;
}

export interface BillingNotification<P extends BillingProviderId> {
  scope: BillingProviderScope<P>;
  eventId: string;
  reference: BillingSubscriptionReference<P> | null;
}

export interface BillingEnvelope {
  body: Uint8Array;
  headers: Readonly<Record<string, string>>;
}

export interface BillingPurchase {
  actorId: string;
  workspaceId: string;
  intentId: string;
  proof: unknown;
}

export interface BillingProvider<P extends BillingProviderId> {
  readonly scope: BillingProviderScope<P>;
  verifyNotification(
    envelope: BillingEnvelope
  ): Promise<BillingNotification<P>>;
  getSubscription(
    reference: BillingSubscriptionReference<P>
  ): Promise<BillingObservation<P>>;
  verifyPurchase(submission: BillingPurchase): Promise<BillingObservation<P>>;
  getManagementLink(
    reference: BillingSubscriptionReference<P>
  ): Promise<
    | { kind: 'provider_portal'; url: string }
    | { kind: 'native_store'; url: string }
  >;
  createCheckout?(
    input: Omit<BillingPurchase, 'proof'> & { item: BillingCatalogItem }
  ): Promise<{ url: string }>;
  acknowledge?(observation: BillingObservation<P>): Promise<void>;
  updateSeats?(
    reference: BillingSubscriptionReference<P>,
    quantity: number
  ): Promise<void>;
  repair?(
    reference: BillingSubscriptionReference<P>
  ): Promise<BillingObservation<P>>;
}
