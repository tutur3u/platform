'use client';

import { TriangleAlert } from '@tuturuuu/icons';
import type { InventoryProductSummary } from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { EmptyRow } from './operator-shell';

export function ProductsTable({
  rows,
  view,
}: {
  rows: InventoryProductSummary[];
  view: string;
}) {
  const t = useTranslations('inventory.operator');

  if (rows.length === 0) return <EmptyRow label={t('empty')} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-dynamic-surface text-muted-foreground text-xs">
          <tr>
            <th className="p-3">{t('columns.item')}</th>
            <th className="p-3">{t('columns.manufacturer')}</th>
            <th className="p-3">{t('columns.category')}</th>
            <th className="p-3">{t('columns.owner')}</th>
            <th className="p-3">{t('columns.stock')}</th>
            <th className="p-3">{t('columns.location')}</th>
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
                <td className="p-3 font-medium">{row.name}</td>
                <td className="p-3 text-muted-foreground">
                  {row.manufacturer ?? '-'}
                </td>
                <td className="p-3 text-muted-foreground">
                  {row.category ?? '-'}
                </td>
                <td className="p-3 text-muted-foreground">
                  {row.owner?.name ?? '-'}
                </td>
                <td className={cn('p-3', low && 'text-dynamic-red')}>
                  {low ? (
                    <TriangleAlert className="mr-1 inline h-4 w-4" />
                  ) : null}
                  {amount}
                </td>
                <td className="p-3 text-muted-foreground">
                  {String(inventory.warehouse_name ?? row.warehouse ?? '-')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
