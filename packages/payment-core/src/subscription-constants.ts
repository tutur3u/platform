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
