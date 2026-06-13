'use client';

import { PackageOpen, RefreshCw, Search } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
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
    <div className="grid min-h-32 place-items-center rounded-lg border border-border border-dashed bg-muted/20 p-5 text-center">
      <div className="max-w-sm">
        <PackageOpen className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-medium">{label}</p>
        {description ? (
          <p className="mt-1 text-muted-foreground text-sm leading-6">
            {description}
          </p>
        ) : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
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
    <div
      className={cn(
        'rounded-lg border p-5',
        tone === 'danger'
          ? 'border-destructive/25 bg-destructive/10 text-destructive'
          : 'border-border bg-card text-foreground'
      )}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6 opacity-80">{description}</p>
      {actionLabel && onAction ? (
        <Button
          className="mt-4 border-current/25"
          onClick={onAction}
          type="button"
          variant="outline"
        >
          <RefreshCw className="h-4 w-4" />
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingRows() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          className="h-16 animate-pulse rounded-lg border border-border bg-muted/45"
          key={index.toString()}
        />
      ))}
    </div>
  );
}

export function Toolbar({
  filters,
  setFilters,
  statusOptions,
}: {
  filters: InventoryFilters;
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
    <div className="sticky top-0 z-20 grid min-w-0 grid-cols-1 gap-2 bg-transparent py-2 lg:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)] lg:items-center">
      <label className="relative flex min-w-0 flex-1 items-center">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 pl-9"
          onChange={(event) => setFilters({ q: event.target.value })}
          placeholder={t('search')}
          value={filters.q}
        />
      </label>
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
    </div>
  );
}

export function SectionShell({
  children,
  description,
  icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-border border-b pb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-2xl tracking-normal">{title}</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm leading-6">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}
