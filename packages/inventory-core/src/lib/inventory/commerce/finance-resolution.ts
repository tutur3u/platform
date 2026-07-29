export type InventoryFinanceProvider =
  | 'polar'
  | 'square_pos'
  | 'square_terminal';

export type InventoryFinanceEntryKind =
  | 'sale'
  | 'refund'
  | 'chargeback_hold'
  | 'chargeback_release'
  | 'manual_provider_adjustment';

export type SaleBookingSession = {
  checkout_provider?: string | null;
  finance_transaction_id: string | null;
  polar_order_id?: string | null;
  square_payment_id?: string | null;
  status: string;
  total_amount: number;
};

export type SaleBookingDecision =
  | { book: false; reason: string }
  | { book: true };

type WalletCandidate = {
  currency: string;
  id: string;
};

export function resolveCheckoutProvider(
  session: Pick<
    SaleBookingSession,
    'checkout_provider' | 'polar_order_id' | 'square_payment_id'
  >
): InventoryFinanceProvider | null {
  if (
    session.checkout_provider === 'polar' ||
    session.checkout_provider === 'square_pos' ||
    session.checkout_provider === 'square_terminal'
  ) {
    return session.checkout_provider;
  }
  if (session.checkout_provider) return null;
  if (session.polar_order_id) return 'polar';
  if (session.square_payment_id) return 'square_terminal';
  return null;
}

export function decideSaleBooking(
  session: SaleBookingSession
): SaleBookingDecision {
  if (session.status !== 'completed') {
    return { book: false, reason: 'not-completed' };
  }
  if (!session.total_amount || session.total_amount <= 0) {
    return { book: false, reason: 'zero-amount' };
  }
  if (!resolveCheckoutProvider(session)) {
    return { book: false, reason: 'unsupported-provider' };
  }
  return { book: true };
}

/**
 * A product category is unanimous only when every product supplies the same
 * non-null category. Missing or mixed product categories fall through to the
 * provider and Inventory defaults.
 */
export function resolveSharedFinanceCategoryId(
  categoryIds: Array<string | null | undefined>
): string | null {
  if (categoryIds.length === 0 || categoryIds.some((id) => !id)) return null;
  const first = categoryIds[0];
  return first && categoryIds.every((id) => id === first) ? first : null;
}

export function resolveCompatibleWalletId({
  candidates,
  currency,
  preferenceIds,
}: {
  candidates: WalletCandidate[];
  currency: string;
  preferenceIds: Array<string | null | undefined>;
}) {
  const normalizedCurrency = currency.toUpperCase();
  const compatible = new Set(
    candidates
      .filter((wallet) => wallet.currency.toUpperCase() === normalizedCurrency)
      .map((wallet) => wallet.id)
  );
  return (
    preferenceIds.find((id): id is string => !!id && compatible.has(id)) ?? null
  );
}

export function resolveCategoryPreference({
  availableCategoryIds,
  inventoryDefaultCategoryId,
  productCategoryId,
  providerCategoryId,
}: {
  availableCategoryIds: string[];
  inventoryDefaultCategoryId?: string | null;
  productCategoryId?: string | null;
  providerCategoryId?: string | null;
}) {
  const available = new Set(availableCategoryIds);
  return (
    [productCategoryId, providerCategoryId, inventoryDefaultCategoryId].find(
      (id): id is string => !!id && available.has(id)
    ) ?? null
  );
}

export function normalizeInventoryFinanceAmount(
  kind: InventoryFinanceEntryKind,
  amountMinor: number
) {
  const magnitude = Math.abs(Math.trunc(amountMinor));
  if (kind === 'sale' || kind === 'chargeback_release') return magnitude;
  if (kind === 'refund' || kind === 'chargeback_hold') return -magnitude;
  return Math.trunc(amountMinor);
}
