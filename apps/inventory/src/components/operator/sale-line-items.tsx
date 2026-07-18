'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Package } from '@tuturuuu/icons';
import type {
  InventoryProductSummary,
  InventorySaleLine,
  InventorySaleSummary,
} from '@tuturuuu/internal-api/inventory';
import {
  getInventorySale,
  listInventoryCheckouts,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { currency } from './operator-format';

export type AggregatedSaleLine = {
  imageUrl: string | null;
  key: string;
  locations: string[];
  productName: string;
  quantity: number;
  total: number;
};

export function aggregateSaleLines(
  lines: InventorySaleLine[],
  products: InventoryProductSummary[]
): AggregatedSaleLine[] {
  const productsById = new Map(
    products.map((product) => [product.id, product])
  );
  const grouped = new Map<
    string,
    AggregatedSaleLine & { locationSet: Set<string> }
  >();

  for (const line of lines) {
    const key = line.product_id || line.product_name;
    const product = productsById.get(line.product_id);
    const stock = (product?.inventory ?? []).find(
      (item) =>
        item.unit_id === line.unit_id && item.warehouse_id === line.warehouse_id
    );
    const location = [
      line.unit_name ||
        (typeof stock?.unit_name === 'string' ? stock.unit_name : ''),
      line.warehouse_name ||
        (typeof stock?.warehouse_name === 'string' ? stock.warehouse_name : ''),
    ]
      .filter(Boolean)
      .join(' · ');
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += line.quantity;
      existing.total += line.price * line.quantity;
      if (location) existing.locationSet.add(location);
      continue;
    }

    grouped.set(key, {
      imageUrl: line.product_image_url ?? product?.avatar_url ?? null,
      key,
      locations: [],
      locationSet: new Set(location ? [location] : []),
      productName: line.product_name,
      quantity: line.quantity,
      total: line.price * line.quantity,
    });
  }

  return [...grouped.values()].map(({ locationSet, ...line }) => ({
    ...line,
    locations: [...locationSet],
  }));
}

export async function loadInventorySaleLines(
  wsId: string,
  sale: InventorySaleSummary
): Promise<InventorySaleLine[]> {
  if (sale.source === 'finance_invoice') {
    return (await getInventorySale(wsId, sale.id)).data.lines;
  }

  const response = await listInventoryCheckouts(wsId, {
    pageSize: 100,
    q: sale.public_token || sale.id,
    status: 'all',
  });
  const checkout = response.data.find((item) => item.id === sale.id);
  return (checkout?.lines ?? []).map((line) => ({
    owner_id: null,
    owner_name: '',
    price: line.unitPrice,
    product_id: line.productId,
    product_name: line.title,
    quantity: line.quantity,
    unit_id: line.unitId,
    unit_name: '',
    warehouse_id: line.warehouseId,
    warehouse_name: '',
  }));
}

export function SaleLineItems({
  products,
  sale,
  workspaceCurrency,
  wsId,
}: {
  products: InventoryProductSummary[];
  sale: InventorySaleSummary;
  workspaceCurrency: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce');
  const detail = useQuery({
    queryFn: () => loadInventorySaleLines(wsId, sale),
    queryKey: ['inventory', wsId, 'sale-lines', sale.source, sale.id],
    staleTime: 60_000,
  });
  const lines = useMemo(
    () => aggregateSaleLines(detail.data ?? [], products),
    [detail.data, products]
  );

  if (detail.isPending) {
    return (
      <div className="flex min-h-20 items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('loadingLineItems')}
      </div>
    );
  }

  if (detail.isError) {
    return (
      <div className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-center text-muted-foreground text-sm sm:flex-row">
        <span>{t('lineItemsError')}</span>
        <Button
          onClick={() => detail.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          {t('retryLineItems')}
        </Button>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
        {t('emptyLineItems')}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {lines.map((line) => (
        <div
          className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-background p-2.5"
          key={line.key}
        >
          <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-md border bg-muted/40">
            {line.imageUrl ? (
              // biome-ignore lint/performance/noImgElement: workspace media can be a signed first-party URL.
              <img
                alt=""
                className="h-full w-full object-cover"
                src={line.imageUrl}
              />
            ) : (
              <Package className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{line.productName}</p>
            {line.locations.length > 0 ? (
              <p className="mt-0.5 truncate text-muted-foreground text-xs">
                {line.locations.join(' · ')}
              </p>
            ) : null}
          </div>
          <div className="grid justify-items-end gap-1.5">
            <p className="font-semibold text-sm tabular-nums">
              {currency(line.total, sale.currency ?? workspaceCurrency)}
            </p>
            <Badge className="h-5 px-1.5 tabular-nums" variant="secondary">
              {t('quantity', { count: line.quantity })}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
