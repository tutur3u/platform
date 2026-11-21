/** Formats integer micro-USD as dollars with cent precision. */
export function formatMicroUsd(value: number, locale?: string) {
  return new Intl.NumberFormat(locale, {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value / 1_000_000);
}

export function formatDateTime(value: string | null, locale?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}
