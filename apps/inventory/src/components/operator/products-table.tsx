'use client';

import { TriangleAlert } from '@tuturuuu/icons';
import type { InventoryProductSummary } from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { EmptyRow } from './operator-shell';
import { ProductRowActions } from './product-management';

export function ProductsTable({
  rows,
  view,
  wsId,
}: {
  rows: InventoryProductSummary[];
  view: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator');

  if (rows.length === 0) return <EmptyRow label={t('empty')} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-muted/45 text-muted-foreground text-xs">
          <tr>
            <th className="p-3">{t('columns.item')}</th>
            <th className="p-3">{t('columns.manufacturer')}</th>
            <th className="p-3">{t('columns.category')}</th>
            <th className="p-3">{t('columns.owner')}</th>
            <th className="p-3">{t('columns.stock')}</th>
            <th className="p-3">{t('columns.location')}</th>
            <th className="p-3">{t('columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const inventory = row.inventory?.[0] ?? {};
            const amount = Number(
              inventory.amount ?? row.stock?.[0]?.amount ?? 0
            );
            const minAmount = Number(
              inventory.min_amount ?? row.min_amount ?? 0
            );
            const low = view === 'stock' && amount <= minAmount;

            return (
              <tr className="border-border border-t" key={row.id}>
                <td className="p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted/40">
                      {row.avatar_url ? (
                        // biome-ignore lint/performance/noImgElement: thumbnails use arbitrary signed workspace media URLs.
                        <img
                          alt={row.name}
                          className="h-full w-full object-cover"
                          src={row.avatar_url}
                        />
                      ) : (
                        <span className="font-semibold text-muted-foreground text-xs">
                          {row.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="truncate font-medium">{row.name}</span>
                  </div>
                </td>
                <td className="p-3 text-muted-foreground">
                  {row.manufacturer ?? '-'}
                </td>
                <td className="p-3 text-muted-foreground">
                  {row.category ?? '-'}
                </td>
                <td className="p-3 text-muted-foreground">
                  {row.owner?.name ?? '-'}
                </td>
                <td className={cn('p-3', low && 'text-destructive')}>
                  {low ? (
                    <TriangleAlert className="mr-1 inline h-4 w-4" />
                  ) : null}
                  {amount}
                </td>
                <td className="p-3 text-muted-foreground">
                  {String(inventory.warehouse_name ?? row.warehouse ?? '-')}
                </td>
                <td className="p-3">
                  <ProductRowActions row={row} wsId={wsId} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
