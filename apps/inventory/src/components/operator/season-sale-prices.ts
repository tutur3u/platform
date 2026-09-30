'use client';
import { useQuery } from '@tanstack/react-query';
import {
  type InventorySalesPeriod,
  listInventoryPrices,
} from '@tuturuuu/internal-api/inventory';
import {
  isCurrentSalesPeriod,
  periodAllowsProduct,
  resolvePeriodPrices,
} from '@tuturuuu/inventory-core/effective-prices';
import { useSyncExternalStore } from 'react';
import { useInventoryActor } from './inventory-session-scope';
import type { SaleCartLine, SaleStockOption } from './sale-create-items';

export function useSeasonSalePrices({
  wsId,
  period,
  open,
  options,
  currency,
}: {
  wsId: string;
  period?: InventorySalesPeriod;
  open: boolean;
  options: SaleStockOption[];
  currency: string;
}) {
  const actorId = useInventoryActor();
  const scheduled = period?.pricing_mode === 'scheduled';
  const prices = useQuery({
    queryKey: ['inventory', wsId, 'period-prices', actorId, period?.id],
    queryFn: () => listInventoryPrices(wsId, period!.id),
    enabled: open && scheduled && Boolean(actorId),
    staleTime: 0,
    refetchInterval: 10_000,
    refetchOnWindowFocus: 'always',
  });
  const asOf = prices.data?.as_of ?? '';
  const current = resolvePeriodPrices(
    prices.data?.data ?? [],
    period?.id ?? '',
    currency,
    asOf
  );
  const eligibleOptions = options.flatMap((option) => {
    if (period && !periodAllowsProduct(period, option.productId)) return [];
    if (!scheduled) return [option];
    if (!period || !asOf || !isCurrentSalesPeriod(period, new Date(asOf)))
      return [];
    const price = current.get(option.key);
    return price
      ? [{ ...option, price: Number(price.price), priceId: price.id }]
      : [];
  });
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
  const cartIsCurrent = (lines: SaleCartLine[]) =>
    online &&
    lines.every(
      (line) => !period || periodAllowsProduct(period, line.productId)
    ) &&
    (!scheduled ||
      (prices.isSuccess &&
        Date.now() - Date.parse(asOf) < 15_000 &&
        lines.every((line) => {
          const price = current.get(line.key);
          return (
            price?.id === line.priceId && Number(price?.price) === line.price
          );
        })));
  return { options: eligibleOptions, scheduled, prices, cartIsCurrent };
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
