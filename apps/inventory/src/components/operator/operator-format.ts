export function currency(value: number | null | undefined, code = 'USD') {
  return new Intl.NumberFormat(undefined, {
    currency: code,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number(value ?? 0));
}
