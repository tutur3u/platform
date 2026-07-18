'use client';

import {
  Loader2,
  PackageOpen,
  RefreshCw,
  Search,
  TriangleAlert,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { EmptyCard } from '@tuturuuu/ui/custom/empty-card';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { InventoryFilters, InventoryStatusOption } from './operator-types';

export function EmptyRow({
  action,
  description,
  label,
}: {
  action?: ReactNode;
  description?: string;
  label: string;
}) {
  return (
    <EmptyCard
      action={action}
      className="min-h-32 space-y-3 border-dashed bg-muted/20 p-5"
      description={description}
      icon={PackageOpen}
      title={label}
    />
  );
}

export function StatePanel({
  actionLabel,
  description,
  onAction,
  title,
  tone = 'neutral',
}: {
  actionLabel?: string;
  description: string;
  onAction?: () => void;
  title: string;
  tone?: 'danger' | 'neutral';
}) {
  return (
    <EmptyCard
      action={
        actionLabel && onAction ? (
          <Button
            className="border-current/25"
            onClick={onAction}
            type="button"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4" />
            {actionLabel}
          </Button>
        ) : undefined
      }
      className={cn(
        'min-h-36 items-start space-y-3 p-5 text-left',
        tone === 'danger'
          ? 'border-dynamic-red/30 bg-dynamic-red/5 text-dynamic-red'
          : 'border-border bg-card text-foreground'
      )}
      description={description}
      icon={tone === 'danger' ? TriangleAlert : PackageOpen}
      title={title}
    />
  );
}

export function LoadingRows() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          className="grid min-h-16 gap-3 rounded-lg border border-border bg-card p-4"
          key={index.toString()}
        >
          <div className="flex min-w-0 items-center justify-between gap-4">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Toolbar({
  filters,
  hideStatus = false,
  setFilters,
  statusOptions,
}: {
  filters: InventoryFilters;
  hideStatus?: boolean;
  setFilters: (value: { q?: string; status?: string }) => unknown;
  statusOptions: InventoryStatusOption[];
}) {
  const t = useTranslations('inventory.operator');
  const selectedStatus = statusOptions.some(
    (option) => option.value === filters.status
  )
    ? filters.status
    : (statusOptions[0]?.value ?? 'all');

  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-1 gap-2',
        !hideStatus &&
          'lg:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)] lg:items-center'
      )}
    >
      <label className="relative flex min-w-0 flex-1 items-center">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoComplete="off"
          className="h-10 bg-background pl-9 sm:h-9"
          onChange={(event) => setFilters({ q: event.target.value })}
          placeholder={t('search')}
          value={filters.q}
        />
      </label>
      {!hideStatus ? (
        <Combobox
          className="min-w-0"
          emptyText={t('statusEmpty')}
          onChange={(status) =>
            setFilters({ status: typeof status === 'string' ? status : 'all' })
          }
          options={statusOptions.map((option) => ({
            label: option.label,
            value: option.value,
          }))}
          placeholder={t('statuses.all')}
          searchPlaceholder={t('statusSearch')}
          selected={selectedStatus}
        />
      ) : null}
    </div>
  );
}

export function InfiniteListFooter({
  hasNextPage,
  isFetchingNextPage,
  loadedCount,
  onLoadMore,
  totalCount,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  loadedCount: number;
  onLoadMore: () => void;
  totalCount: number;
}) {
  const t = useTranslations('inventory.operator.pagination');

  if (totalCount <= 50 && !hasNextPage) return null;

  return (
    <div className="grid min-w-0 gap-2 rounded-lg border border-border border-dashed bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {t('showing', { loaded: loadedCount, total: totalCount })}
      </p>
      {hasNextPage ? (
        <Button
          className="min-h-10 w-full touch-manipulation sm:min-h-9 sm:w-auto"
          disabled={isFetchingNextPage}
          onClick={onLoadMore}
          type="button"
          variant="outline"
        >
          {isFetchingNextPage ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          {isFetchingNextPage ? t('loadingMore') : t('loadMore')}
        </Button>
      ) : (
        <span className="text-muted-foreground text-xs sm:text-right">
          {t('allLoaded')}
        </span>
      )}
    </div>
  );
}

export function SectionShell({
  actions,
  children,
  description,
  icon,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="grid gap-4">
      <FeatureSummary
        action={
          actions ? (
            <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:items-center min-[420px]:flex-row">
              {actions}
            </div>
          ) : undefined
        }
        description={description}
        icon={
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-primary/10 text-primary">
            {icon}
          </span>
        }
        pluralTitle={title}
      />
      {children}
    </section>
  );
}
