'use client';

import { PackageOpen, RefreshCw, Search } from '@tuturuuu/icons';
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
    <div className="grid min-h-44 place-items-center rounded-lg border border-border border-dashed bg-muted/25 p-6 text-center">
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
        <button
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-current/25 px-3 font-medium text-sm"
          onClick={onAction}
          type="button"
        >
          <RefreshCw className="h-4 w-4" />
          {actionLabel}
        </button>
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

  return (
    <div className="sticky top-0 z-20 flex flex-col gap-2 border-border border-b bg-background/95 py-3 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
      <label className="relative flex min-w-0 flex-1 items-center">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="h-9 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
          onChange={(event) => setFilters({ q: event.target.value })}
          placeholder={t('search')}
          value={filters.q}
        />
      </label>
      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
        onChange={(event) => setFilters({ status: event.target.value })}
        value={filters.status}
      >
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
