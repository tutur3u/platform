import type { InventoryPrice } from '@tuturuuu/internal-api/inventory';
import type { InventorySalesPeriod } from '@tuturuuu/internal-api/inventory';

export function periodAllowsProduct(
  period: Pick<InventorySalesPeriod, 'product_scope' | 'product_ids'>,
  productId: string
) {
  const listed = period.product_ids.includes(productId);
  return period.product_scope === 'allowlist'
    ? listed
    : period.product_scope === 'blocklist'
      ? !listed
      : true;
}

export function isCurrentSalesPeriod(
  period: InventorySalesPeriod,
  now = new Date(),
  fallbackTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
) {
  if (period.status !== 'active' || !period.starts_at || !period.ends_at) {
    return false;
  }
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: period.time_zone || fallbackTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((value) => value.type === type)?.value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  return period.starts_at <= date && date <= period.ends_at;
}

export function defaultSalesPeriod(
  periods: InventorySalesPeriod[],
  configuredId?: string | null,
  now = new Date(),
  timeZone?: string
) {
  const current = periods.filter((period) =>
    isCurrentSalesPeriod(period, now, timeZone)
  );
  const configured = current.find((period) => period.id === configuredId);
  return configured?.id ?? (current.length === 1 ? current[0]!.id : 'choose');
}

export function resolvePeriodPrices(
  prices: InventoryPrice[],
  periodId: string,
  currency: string,
  asOf: string
) {
  const instant = Date.parse(asOf);
  const current = new Map<string, InventoryPrice>();
  if (!Number.isFinite(instant)) return current;
  for (const row of prices) {
    if (
      row.period_id !== periodId ||
      row.currency !== currency.toUpperCase() ||
      Date.parse(row.valid_from) > instant ||
      (row.valid_to && instant >= Date.parse(row.valid_to))
    )
      continue;
    const key = `${row.product_id}:${row.unit_id}:${row.warehouse_id}`;
    if (current.has(key)) throw new Error('Overlapping effective prices');
    current.set(key, row);
  }
  return current;
}
