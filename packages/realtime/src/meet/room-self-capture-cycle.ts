/**
 * Delivery cycle of the per-speaker legal outbox. Every enqueued entry and
 * every acknowledgement that removes one restarts the cycle: up to six fast
 * deliveries with doubling backoff, then one per hour until 24 hours after
 * the cycle started. Each delivery is idempotent in the database (exact
 * room sequence numbers), so a retry never records anything twice.
 */
export type SelfOutboxDelivery = {
  attempts: number;
  nextAt: number;
  startedAt: number;
  /** Deliveries in which the account's oldest entry was not acknowledged. */
  failures?: Record<string, number>;
};

export const SELF_OUTBOX_FIRST_DELIVERY_MS = 10_000;
export const SELF_OUTBOX_FAST_DELIVERIES = 6;
export const SELF_OUTBOX_SLOW_RETRY_MS = 3_600_000;
export const SELF_OUTBOX_RETRY_WINDOW_MS = 24 * 3_600_000;

export function restartDelivery(
  delivery: SelfOutboxDelivery | undefined,
  now: number
): SelfOutboxDelivery {
  const soon = now + SELF_OUTBOX_FIRST_DELIVERY_MS;
  return {
    attempts: 0,
    startedAt: now,
    // A burst of endings never postpones a delivery that is already due.
    nextAt:
      delivery?.attempts === 0 && delivery.nextAt < soon
        ? delivery.nextAt
        : soon,
    ...(delivery?.failures ? { failures: delivery.failures } : {}),
  };
}

/** The attempt after this one, or undefined once the window is spent. */
export function scheduleNextDelivery(
  delivery: SelfOutboxDelivery,
  now: number
): SelfOutboxDelivery {
  const attempts = delivery.attempts + 1;
  return {
    ...delivery,
    attempts,
    nextAt:
      attempts < SELF_OUTBOX_FAST_DELIVERIES
        ? now + SELF_OUTBOX_FIRST_DELIVERY_MS * 2 ** attempts
        : now + SELF_OUTBOX_SLOW_RETRY_MS,
  };
}

export function deliveryDue(delivery: SelfOutboxDelivery | undefined) {
  if (!delivery) return undefined;
  return delivery.nextAt <=
    (delivery.startedAt ?? delivery.nextAt) + SELF_OUTBOX_RETRY_WINDOW_MS
    ? delivery.nextAt
    : undefined;
}
