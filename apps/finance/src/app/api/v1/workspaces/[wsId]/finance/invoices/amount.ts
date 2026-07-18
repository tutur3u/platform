/**
 * Finance invoice amounts are stored in major currency units with up to six
 * decimals. Trim JavaScript floating-point noise while preserving cents and
 * legitimate sub-cent currencies.
 */
export function normalizeInvoiceStoredAmount(value: number) {
  return Number(value.toFixed(6));
}
