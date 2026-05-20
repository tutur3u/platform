'use client';

import { RefreshCw, Search } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { InventoryFilters, InventoryStatusOption } from './operator-types';

export function EmptyRow({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
      {label}
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
        'm-4 rounded-lg border p-5',
        tone === 'danger'
          ? 'border-dynamic-red/25 bg-dynamic-red/10 text-dynamic-red'
          : 'border-border bg-background text-foreground'
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
    <div className="grid gap-3 p-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          className="h-16 animate-pulse rounded-lg border border-border bg-background"
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
    <div className="flex flex-col gap-2 border-border border-b bg-dynamic-surface/70 p-3 lg:flex-row lg:items-center lg:justify-between">
      <label className="relative flex min-w-0 flex-1 items-center">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-9 text-sm outline-none transition focus:border-dynamic-blue"
          onChange={(event) => setFilters({ q: event.target.value })}
          placeholder={t('search')}
          value={filters.q}
        />
      </label>
      <select
        className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-dynamic-blue"
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
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-start gap-3 border-border border-b p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue">
          {icon}
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-xl tracking-normal">{title}</h1>
          <p className="mt-1 text-muted-foreground text-sm leading-6">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}
