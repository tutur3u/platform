/**
 * Finance invoice amounts are stored in major currency units with up to six
 * decimals. Trim JavaScript floating-point noise while preserving cents and
 * legitimate sub-cent currencies.
 */
export function normalizeInvoiceStoredAmount(value: number) {
  return Number(value.toFixed(6));
}

export function calculateCustomInvoiceSubtotal(
  products: Array<{ price: number; quantity: number }>
) {
  return normalizeInvoiceStoredAmount(
    products.reduce((subtotal, product) => {
      if (
        !Number.isFinite(product.price) ||
        product.price < 0 ||
        !Number.isFinite(product.quantity) ||
        product.quantity <= 0
      ) {
        throw new RangeError(
          'Custom invoice prices and quantities are invalid'
        );
      }

      return subtotal + product.price * product.quantity;
    }, 0)
  );
}

export function resolveCustomInvoicePricing({
  priceMode,
  products,
  promotionId,
}: {
  priceMode?: 'catalog' | 'custom';
  products: Array<{ price: number; quantity: number }>;
  promotionId?: string;
}) {
  if (priceMode !== 'custom') {
    return { ok: true as const, values: null };
  }

  if (promotionId && promotionId !== 'none') {
    return {
      message: 'Custom invoice prices cannot be combined with promotions',
      ok: false as const,
    };
  }

  try {
    const subtotal = calculateCustomInvoiceSubtotal(products);
    return {
      ok: true as const,
      values: {
        allowPromotions: false,
        discount_amount: 0,
        rounding_applied: 0,
        subtotal,
        total: subtotal,
        values_recalculated: false,
      },
    };
  } catch {
    return {
      message: 'Custom invoice prices and quantities are invalid',
      ok: false as const,
    };
  }
}
