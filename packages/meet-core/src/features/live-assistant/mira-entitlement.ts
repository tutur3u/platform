import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

/**
 * Who funds a Mira request. Verified @tuturuuu.com staff are funded by the
 * Tuturuuu root workspace; every other eligible account pays with its own
 * workspace credits. This never widens who is eligible.
 */
export type MiraPayer = 'tuturuuu' | 'account';

/** Same paid personal tiers that may host Meet (`canVerifiedAccountHostMeeting`). */
export const MIRA_PAID_TIERS = ['PLUS', 'PRO', 'ENTERPRISE'] as const;

/** Exact-value opt-in shared with Meet hosting; anything else keeps paid tiers off. */
export function isMiraPaidTierEnabled(value: unknown) {
  return value === 'true';
}

export function isMiraPaidTier(tier: unknown) {
  return (
    typeof tier === 'string' &&
    (MIRA_PAID_TIERS as readonly string[]).includes(tier)
  );
}

type Subscription = {
  created_at: string;
  status: string | null;
  product_id: string | null;
};

/**
 * The newest active subscription's product tier, matching
 * `extractTierFromSubscriptions`. A referenced product without a tier is an
 * integrity failure, never FREE, so callers fail closed.
 */
export function newestActiveSubscriptionTier(
  subscriptions: readonly Subscription[],
  tiers: ReadonlyMap<string, string | null | undefined>
): string {
  const active = subscriptions
    .filter((subscription) => subscription.status === 'active')
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  for (const subscription of active)
    if (subscription.product_id && !tiers.get(subscription.product_id))
      throw new Error('Mira entitlement product unavailable');
  const newest = active[0]?.product_id;
  return (newest && tiers.get(newest)) || 'FREE';
}

/**
 * Billing workspace for a Mira request. Staff requests always drain the root
 * workspace; account requests use the workspace the caller resolved for that
 * surface (the requester's Personal workspace for Private Mira, the meeting
 * workspace for room Mira).
 */
export function miraBillingWorkspaceId(
  payer: MiraPayer,
  accountWorkspaceId: string
) {
  return payer === 'tuturuuu' ? ROOT_WORKSPACE_ID : accountWorkspaceId;
}

/** A signed or saved grant must keep the payer it was admitted with. */
export function miraPayerMatchesBilling(
  payer: MiraPayer,
  billingWorkspaceId: string | null | undefined
) {
  return payer === 'tuturuuu'
    ? billingWorkspaceId === ROOT_WORKSPACE_ID
    : !!billingWorkspaceId && billingWorkspaceId !== ROOT_WORKSPACE_ID;
}
