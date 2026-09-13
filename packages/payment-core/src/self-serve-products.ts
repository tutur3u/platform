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
