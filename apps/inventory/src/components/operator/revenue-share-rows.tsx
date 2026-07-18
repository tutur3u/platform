'use client';

import { CalendarDays, Percent } from '@tuturuuu/icons';
import type { InventoryRevenueShareEarning } from '@tuturuuu/internal-api/inventory';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { formatDate, StatusBadge } from './commerce-shared';
import { money } from './operator-format';
import { EmptyRow } from './operator-shell';

export function RevenueShareRows({
  query,
  rows,
}: {
  query: string;
  rows: InventoryRevenueShareEarning[];
}) {
  const t = useTranslations('inventory.operator.commerce');
  const locale = useLocale();
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((row) =>
      [
        row.partnerName,
        row.products.join(' '),
        String(row.revenueShareBps),
        String(row.earnedAmount),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [query, rows]);

  if (filteredRows.length === 0) {
    return (
      <EmptyRow
        description={t('emptyDescriptions.revenueShare')}
        label={t('empty')}
      />
    );
  }

  return (
    <div className="grid gap-2">
      {filteredRows.map((row) => {
        const date = formatDate(row.lastSaleAt ?? row.firstSaleAt, locale);
        return (
          <article
            className="grid gap-3 rounded-lg border border-border bg-card p-3 text-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
            key={`${row.partnerId}:${row.revenueShareBps}:${row.currency}`}
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <Percent className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="truncate font-medium">{row.partnerName}</p>
                <StatusBadge
                  value={t('splitLabel', { value: row.splitPercent })}
                />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                <span>{t('unitsLabel', { count: Number(row.unitsSold) })}</span>
                <span>{t('productsLabel', { count: row.productCount })}</span>
                {date ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {date}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-1 text-muted-foreground text-xs">
                {row.products.join(', ')}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[320px]">
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                <p className="text-muted-foreground text-xs">
                  {t('attributedRevenue')}
                </p>
                <p className="font-semibold">
                  {money(row.attributedRevenue, row.currency)}
                </p>
              </div>
              <div className="rounded-md border border-dynamic-green/25 bg-dynamic-green/10 px-3 py-2 text-dynamic-green">
                <p className="text-xs">{t('earnedAmount')}</p>
                <p className="font-semibold">
                  {money(row.earnedAmount, row.currency)}
                </p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
