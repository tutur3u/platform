/**
 * Subscription statuses that count as "active" for seat-based enforcement.
 * Must match the status filter in the DB function workspace_has_available_seats().
 */
export const SEAT_ACTIVE_STATUSES = ['active', 'trialing', 'past_due'] as const;

export type SeatActiveStatus = (typeof SEAT_ACTIVE_STATUSES)[number];

/** Commercially approved target; display activation follows provider reconciliation. */
export const PROPOSED_WORKSPACE_CATALOG = {
  version: '2026-09-approved',
  status: 'approved',
  currency: 'usd',
  prices: {
    plus: { monthly: 900, annual: 9000 },
    pro: { monthly: 1900, annual: 19000 },
  },
} as const;

/**
 * Cancellation comment set when workspace deletion revokes a subscription. The
 * revocation webhook skips free-plan re-provisioning for it, because the
 * workspace is being deleted. The comment is not a trust boundary: a customer
 * who sets it on their own subscription only skips this webhook step, and a
 * surviving workspace still gets a free plan on its next dashboard visit.
 */
export const WORKSPACE_DELETION_REVOKE_COMMENT = 'tuturuuu:workspace-deleted';

export function isWorkspaceDeletionRevocation(subscription: {
  customerCancellationComment?: string | null;
}) {
  return (
    subscription.customerCancellationComment ===
    WORKSPACE_DELETION_REVOKE_COMMENT
  );
}
