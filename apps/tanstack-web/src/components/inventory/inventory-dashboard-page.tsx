'use client';

import { useQuery } from '@tanstack/react-query';
import { getInventoryStatistics } from '@tuturuuu/internal-api/inventory';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

type InventoryDashboardPageProps = {
  canViewInventory: boolean;
  wsId: string;
};

type StatisticCardProps = {
  className?: string;
  displayLimit?: ReactNode;
  displayValue?: ReactNode;
  href?: string;
  limit?: number;
  onClick?: () => void;
  progress?: number;
  title?: string;
  value?: number | string | null;
};

function StatisticCard({
  className,
  displayLimit,
  displayValue,
  href,
  limit,
  onClick,
  progress,
  title,
  value,
}: StatisticCardProps) {
  const enableHoverEffect = Boolean(onClick || href);
  const progressValue =
    progress !== undefined
      ? progress
      : typeof value === 'number' && limit
        ? (value / limit) * 100
        : 0;
  const progressColor =
    progressValue >= 100
      ? 'bg-dynamic-red'
      : progressValue >= 90
        ? 'bg-dynamic-yellow'
        : '';

  const cardContent = (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="line-clamp-1 p-1 text-center font-semibold text-lg">
          {title}
        </div>
        <div
          className={cn(
            'm-2 mt-0 line-clamp-1 rounded border border-border/30 bg-foreground/5 p-4 text-center font-bold text-2xl text-foreground',
            enableHoverEffect &&
              'transition-all duration-300 group-hover:rounded-lg'
          )}
        >
          {displayValue ?? (value != null ? value : 'N/A')}
          {(displayLimit || limit) && (
            <span className="font-normal text-base text-muted-foreground">
              {' '}
              / {displayLimit ?? limit}
            </span>
          )}
        </div>
      </div>
      {(limit || displayLimit || progress !== undefined) && (
        <div className="px-4 pb-4">
          <Progress value={progressValue} indicatorClassName={progressColor} />
        </div>
      )}
    </div>
  );

  const classes = cn(
    'group flex flex-col rounded-lg border transition-all duration-300',
    enableHoverEffect
      ? 'border-border hover:rounded-xl hover:bg-foreground/[0.025] dark:hover:bg-foreground/5'
      : 'cursor-default border-border/50',
    className
  );

  if (href) {
    return (
      <a className={classes} href={href} onClick={onClick}>
        {cardContent}
      </a>
    );
  }

  return (
    <button className={classes} onClick={onClick} type="button">
      {cardContent}
    </button>
  );
}

function LoadingStatisticCard({ className }: { className?: string }) {
  return (
    <div className={cn('group animate-pulse rounded-lg border', className)}>
      <div className="p-1 text-center font-semibold text-lg text-transparent">
        ...
      </div>
      <div className="m-2 mt-0 flex items-center justify-center rounded border border-foreground/5 bg-foreground/5 p-4 font-bold text-2xl text-transparent">
        ...
      </div>
    </div>
  );
}

function InventoryAccessDenied() {
  const t = useTranslations();

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="font-semibold text-lg">
          {t('ws-roles.inventory_access_denied')}
        </h2>
        <p className="text-muted-foreground">
          {t('ws-roles.inventory_access_denied_description')}
        </p>
      </div>
    </div>
  );
}

export function InventoryDashboardPage({
  canViewInventory,
  wsId,
}: InventoryDashboardPageProps) {
  const t = useTranslations();
  const statistics = useQuery({
    queryFn: () => getInventoryStatistics(wsId),
    queryKey: ['inventory-statistics', wsId],
    staleTime: 30 * 1000,
  });

  if (!canViewInventory) {
    return <InventoryAccessDenied />;
  }

  if (statistics.isLoading) {
    return (
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <LoadingStatisticCard key={index} />
        ))}
      </div>
    );
  }

  if (statistics.isError) {
    return (
      <div className="rounded-lg border border-dynamic-red/30 bg-dynamic-red/10 p-4 text-dynamic-red text-sm">
        {t('common.error')}
      </div>
    );
  }

  const data = statistics.data;

  return (
    <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatisticCard
        href={`/${wsId}/inventory/products`}
        title={t('workspace-inventory-tabs.products')}
        value={data?.products ?? 0}
      />
      <StatisticCard
        href={`/${wsId}/inventory/products`}
        title={t('inventory-overview.products-with-prices')}
        value={data?.inventoryProducts ?? 0}
      />
      <StatisticCard
        href={`/${wsId}/inventory/categories`}
        title={t('workspace-inventory-tabs.categories')}
        value={data?.categories ?? 0}
      />
      <StatisticCard
        href={`/${wsId}/inventory/batches`}
        title={t('workspace-inventory-tabs.batches')}
        value={data?.batches ?? 0}
      />
      <StatisticCard
        href={`/${wsId}/inventory/warehouses`}
        title={t('workspace-inventory-tabs.warehouses')}
        value={data?.warehouses ?? 0}
      />
      <StatisticCard
        href={`/${wsId}/inventory/units`}
        title={t('workspace-inventory-tabs.units')}
        value={data?.units ?? 0}
      />
      <StatisticCard
        href={`/${wsId}/inventory/suppliers`}
        title={t('workspace-inventory-tabs.suppliers')}
        value={data?.suppliers ?? 0}
      />
      <StatisticCard
        href={`/${wsId}/inventory/promotions`}
        title={t('workspace-inventory-tabs.promotions')}
        value={data?.promotions ?? 0}
      />
    </div>
  );
}
