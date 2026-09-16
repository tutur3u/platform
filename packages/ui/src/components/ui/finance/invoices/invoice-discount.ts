/** The saved net price excludes rounding, which is stored in total_diff. */
export function getSavedInvoiceDiscount(
  products: ReadonlyArray<{ price: number; amount: number }>,
  netPrice: number
) {
  const subtotal = products.reduce(
    (sum, item) => sum + item.price * item.amount,
    0
  );
  if (!Number.isFinite(subtotal) || !Number.isFinite(netPrice)) return 0;
  return Math.max(0, subtotal - netPrice);
}
