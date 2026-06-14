'use client';

import {
  Calculator,
  CheckCircle2,
  ImageOff,
  Tags,
  TriangleAlert,
  User,
} from '@tuturuuu/icons';
import type {
  InventoryCostProfile,
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { EmptyRow } from './operator-shell';
import {
  getInventoryStockState,
  stockAmountFromRecords,
} from './operator-stock';
import { ProductRowActions } from './product-management';

export function ProductsTable({
  costingProfiles = [],
  formOptions,
  rows,
  view,
  wsId,
}: {
  costingProfiles?: InventoryCostProfile[];
  formOptions?: InventoryProductFormOptionsResponse;
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
            const amount = stockAmountFromRecords(inventory, row.stock?.[0]);
            const stockState = getInventoryStockState({
              amount,
              minAmount: inventory.min_amount ?? row.min_amount,
            });
            const low = view === 'stock' && stockState.isLowStock;
            const hasCosting = hasCostingCoverage(row, costingProfiles);
            const badges = [
              {
                icon: row.avatar_url ? CheckCircle2 : ImageOff,
                label: row.avatar_url
                  ? t('badges.imageReady')
                  : t('badges.imageMissing'),
                tone: row.avatar_url ? 'ready' : 'missing',
              },
              {
                icon: low ? TriangleAlert : CheckCircle2,
                label: stockState.isUnlimited
                  ? t('badges.stockUnlimited')
                  : low
                    ? t('badges.lowStock')
                    : t('badges.stockReady'),
                tone: low ? 'danger' : 'ready',
              },
              {
                icon: Tags,
                label: row.category
                  ? t('badges.categoryReady')
                  : t('badges.categoryMissing'),
                tone: row.category ? 'ready' : 'missing',
              },
              {
                icon: User,
                label: row.owner?.name
                  ? t('badges.ownerReady')
                  : t('badges.ownerMissing'),
                tone: row.owner?.name ? 'ready' : 'missing',
              },
              {
                icon: Calculator,
                label: hasCosting
                  ? t('badges.costingReady')
                  : t('badges.costingMissing'),
                tone: hasCosting ? 'ready' : 'missing',
              },
            ];

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
                    <div className="min-w-0">
                      <span className="block truncate font-medium">
                        {row.name}
                      </span>
                      <span className="mt-1 flex min-w-0 flex-wrap gap-1">
                        {badges.map((badge) => {
                          const Icon = badge.icon;

                          return (
                            <span
                              className={cn(
                                'inline-flex h-5 min-w-0 items-center gap-1 rounded border px-1.5 text-[11px]',
                                badge.tone === 'ready' &&
                                  'border-primary/25 bg-primary/10 text-primary',
                                badge.tone === 'missing' &&
                                  'border-border bg-muted text-muted-foreground',
                                badge.tone === 'danger' &&
                                  'border-destructive/25 bg-destructive/10 text-destructive'
                              )}
                              key={badge.label}
                            >
                              <Icon className="h-3 w-3 shrink-0" />
                              <span className="max-w-24 truncate">
                                {badge.label}
                              </span>
                            </span>
                          );
                        })}
                      </span>
                    </div>
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
                  <span className={stockState.isUnlimited ? 'font-bold' : ''}>
                    {stockState.displayAmount}
                  </span>
                </td>
                <td className="p-3 text-muted-foreground">
                  {String(inventory.warehouse_name ?? row.warehouse ?? '-')}
                </td>
                <td className="p-3">
                  <ProductRowActions
                    costingProfiles={costingProfiles}
                    options={formOptions}
                    row={row}
                    wsId={wsId}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function hasCostingCoverage(
  product: InventoryProductSummary,
  profiles: InventoryCostProfile[]
) {
  if (!profiles.length) return false;

  const productName = normalizeMatch(product.name);
  const categoryName = normalizeMatch(product.category ?? '');

  return profiles.some((profile) => {
    if (profile.productId && profile.productId === product.id) return true;
    if (profile.categoryId && profile.categoryId === product.category_id) {
      return true;
    }

    const profileProductName = normalizeMatch(profile.productName ?? '');
    const profileName = normalizeMatch(profile.name);
    const profileCategoryName = normalizeMatch(profile.categoryName ?? '');

    return (
      Boolean(productName) &&
      (profileProductName === productName ||
        profileName === productName ||
        (Boolean(categoryName) && profileCategoryName === categoryName))
    );
  });
}

function normalizeMatch(value: string) {
  return value.trim().toLocaleLowerCase();
}
