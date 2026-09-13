/** Fixed legacy subscriptions remain valid, but new paid purchases use seats. */
export function isSelfServeWorkspaceProduct(product: {
  tier: string | null;
  pricing_model: string | null;
  archived: boolean | null;
  price?: number | null;
}) {
  if (product.archived !== false) return false;
  if (product.tier === 'FREE')
    return (
      product.pricing_model === 'free' ||
      (product.pricing_model === 'fixed' && product.price === 0)
    );
  return (
    (product.tier === 'PLUS' || product.tier === 'PRO') &&
    product.pricing_model === 'seat_based'
  );
}

export function validCheckoutSeats(count: number | null): count is number {
  return (
    Number.isSafeInteger(count) && (count ?? 0) >= 1 && (count ?? 0) <= 1000
  );
}

/** Plan changes cannot silently cancel the remaining paid term. */
export function getSelfServePlanChangeError(
  currentTier: string | null,
  targetTier: string | null
) {
  return currentTier !== 'FREE' && targetTier === 'FREE'
    ? 'Cancel at period end to move to Free without forfeiting paid access'
    : null;
}

/** Preserve purchased capacity, cover members, and honor the target bounds. */
export function resolveSelfServeSeatCount({
  currentSeats,
  memberCount,
  minSeats,
  maxSeats,
}: {
  currentSeats: number | null;
  memberCount: number | null;
  minSeats: number | null;
  maxSeats: number | null;
}): number | null {
  if (currentSeats !== 0 && !validCheckoutSeats(currentSeats)) return null;
  if (!validCheckoutSeats(memberCount)) return null;
  const minimum = minSeats ?? 1;
  if (!validCheckoutSeats(minimum)) return null;
  if (
    maxSeats !== null &&
    (!validCheckoutSeats(maxSeats) || maxSeats < minimum)
  )
    return null;
  const seats = Math.max(currentSeats ?? 0, memberCount, minimum);
  return validCheckoutSeats(seats) && (maxSeats === null || seats <= maxSeats)
    ? seats
    : null;
}
