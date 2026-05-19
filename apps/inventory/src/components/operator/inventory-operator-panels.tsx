'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, TriangleAlert } from '@tuturuuu/icons';
import {
  createInventoryBundle,
  createInventoryStorefront,
  type InventoryAuditLogSummary,
  type InventoryBundle,
  type InventoryCheckoutSession,
  type InventoryProductSummary,
  type InventorySaleSummary,
  type InventoryStorefront,
} from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState } from 'react';

function currency(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined, {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number(value ?? 0));
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-dynamic-blue/25 bg-dynamic-blue/10 px-2 font-medium text-dynamic-blue text-xs">
      {value}
    </span>
  );
}

export function EmptyRow({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
      {label}
    </div>
  );
}

export function Toolbar({
  filters,
  setFilters,
}: {
  filters: { q: string; status: string };
  setFilters: (value: { q?: string; status?: string }) => unknown;
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
        <option value="all">{t('statuses.all')}</option>
        <option value="active">{t('statuses.active')}</option>
        <option value="published">{t('statuses.published')}</option>
        <option value="reserved">{t('statuses.reserved')}</option>
        <option value="completed">{t('statuses.completed')}</option>
        <option value="draft">{t('statuses.draft')}</option>
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

export function OverviewPanel({
  bundles,
  lowStock,
  products,
  storefronts,
}: {
  bundles: InventoryBundle[];
  lowStock: Array<Record<string, unknown>>;
  products: InventoryProductSummary[];
  storefronts: InventoryStorefront[];
}) {
  const t = useTranslations('inventory.operator');
  const metrics = [
    { label: t('metrics.products'), value: products.length },
    { label: t('metrics.lowStock'), value: lowStock.length },
    { label: t('metrics.storefronts'), value: storefronts.length },
    { label: t('metrics.bundles'), value: bundles.length },
  ];

  return (
    <div className="grid gap-3 p-4 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div
          className="rounded-lg border border-border bg-background p-4"
          key={metric.label}
        >
          <p className="text-muted-foreground text-xs">{metric.label}</p>
          <p className="mt-2 font-semibold text-2xl">{metric.value}</p>
        </div>
      ))}
    </div>
  );
}

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

export function StorefrontForm({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      createInventoryStorefront(wsId, { name, slug, status: 'draft' }),
    onSuccess: () => {
      setName('');
      setSlug('');
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });

  return (
    <form
      className="grid gap-2 border-border border-t p-3 lg:grid-cols-[1fr_1fr_auto]"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) => setName(event.target.value)}
        placeholder={t('forms.storeName')}
        value={name}
      />
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) => setSlug(event.target.value)}
        placeholder={t('forms.slug')}
        value={slug}
      />
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-dynamic-blue px-3 font-medium text-dynamic-blue-foreground text-sm disabled:opacity-50"
        disabled={!name || !slug || mutation.isPending}
        type="submit"
      >
        <Plus className="h-4 w-4" />
        {t('forms.create')}
      </button>
    </form>
  );
}

export function BundleForm({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [price, setPrice] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      createInventoryBundle(wsId, {
        name,
        price: Number(price || 0),
        slug,
        status: 'draft',
      }),
    onSuccess: () => {
      setName('');
      setSlug('');
      setPrice('');
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });

  return (
    <form
      className="grid gap-2 border-border border-t p-3 lg:grid-cols-[1fr_1fr_120px_auto]"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) => setName(event.target.value)}
        placeholder={t('forms.bundleName')}
        value={name}
      />
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) => setSlug(event.target.value)}
        placeholder={t('forms.slug')}
        value={slug}
      />
      <input
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        inputMode="numeric"
        onChange={(event) => setPrice(event.target.value)}
        placeholder={t('forms.price')}
        value={price}
      />
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-dynamic-blue px-3 font-medium text-dynamic-blue-foreground text-sm disabled:opacity-50"
        disabled={!name || !slug || mutation.isPending}
        type="submit"
      >
        <Plus className="h-4 w-4" />
        {t('forms.create')}
      </button>
    </form>
  );
}

export function SimpleRows({
  rows,
  type,
}: {
  rows: Array<
    | InventoryAuditLogSummary
    | InventoryBundle
    | InventoryCheckoutSession
    | InventorySaleSummary
    | InventoryStorefront
  >;
  type: 'audits' | 'bundles' | 'checkouts' | 'sales' | 'storefronts';
}) {
  const t = useTranslations('inventory.operator');
  if (rows.length === 0) return <EmptyRow label={t('empty')} />;

  return (
    <div className="divide-y divide-border">
      {rows.map((row) => {
        const anyRow = row as Record<string, unknown>;
        const title = String(
          anyRow.name ??
            anyRow.customerName ??
            anyRow.customer_name ??
            anyRow.summary ??
            anyRow.id
        );
        const value =
          type === 'sales'
            ? currency(Number(anyRow.paid_amount ?? 0))
            : String(anyRow.status ?? anyRow.event_kind ?? '');

        return (
          <div
            className="grid gap-2 p-3 text-sm lg:grid-cols-[1fr_auto_auto] lg:items-center"
            key={String(anyRow.id)}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{title}</p>
              <p className="truncate text-muted-foreground text-xs">
                {String(
                  anyRow.slug ??
                    anyRow.publicToken ??
                    anyRow.created_at ??
                    anyRow.id
                )}
              </p>
            </div>
            {value ? <StatusBadge value={value} /> : <span />}
            {type === 'storefronts' && 'slug' in anyRow ? (
              <a
                className="text-dynamic-blue text-xs"
                href={`/store/${String(anyRow.slug)}`}
              >
                {t('openStore')}
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
