'use client';

import { Boxes, Package } from '@tuturuuu/icons';
import type { InventoryPolarProductSyncSummary } from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

type SyncItem = InventoryPolarProductSyncSummary['items'][number];

const STATUS_TONE: Record<SyncItem['status'], string> = {
  disabled: 'border-border bg-muted/40 text-muted-foreground',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  pending: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
  synced: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
};

export function PolarSyncItemList({ items }: { items: SyncItem[] }) {
  const t = useTranslations('inventory.operator.polar.sync');

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="border-border border-b px-4 py-3">
        <p className="font-medium text-sm">{t('itemsTitle')}</p>
        <p className="mt-1 text-muted-foreground text-xs leading-5">
          {t('itemsDescription')}
        </p>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-muted-foreground text-sm">
          {t('itemsEmpty')}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item, index) => {
            const Icon = item.kind === 'listing' ? Package : Boxes;
            return (
              <div
                className="grid min-w-0 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                key={`${item.kind}-${item.name}-${index}`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-border bg-muted/30">
                    <Icon className="size-3.5 text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">{item.name}</p>
                    <p className="mt-0.5 truncate font-mono text-muted-foreground text-xs">
                      {item.polarProductId
                        ? t('externalId', { id: item.polarProductId })
                        : t('noExternalId')}
                    </p>
                  </div>
                </div>
                <Badge
                  className={cn('w-fit', STATUS_TONE[item.status])}
                  variant="outline"
                >
                  {t(`status.${item.status}`)}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
