export function currency(
  value: number | null | undefined,
  code = 'USD',
  maximumFractionDigits = 0
) {
  return new Intl.NumberFormat(undefined, {
    currency: code,
    maximumFractionDigits,
    style: 'currency',
  }).format(Number(value ?? 0));
}
