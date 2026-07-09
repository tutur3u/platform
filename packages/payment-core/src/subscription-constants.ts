/**
 * Subscription statuses that count as "active" for seat-based enforcement.
 * Must match the status filter in the DB function workspace_has_available_seats().
 */
export const SEAT_ACTIVE_STATUSES = ['active', 'trialing', 'past_due'] as const;

export type SeatActiveStatus = (typeof SEAT_ACTIVE_STATUSES)[number];
