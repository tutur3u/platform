'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CreditCard,
  RotateCcw,
  ShieldCheck,
  Trash2,
  User,
} from '@tuturuuu/icons';
import type {
  InventoryCheckoutSession,
  InventorySaleSummary,
} from '@tuturuuu/internal-api/inventory';
import {
  deleteInventorySale,
  releaseInventoryCheckout,
} from '@tuturuuu/internal-api/inventory';
import { toast } from '@tuturuuu/ui/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { currency } from './operator-format';
import { EmptyRow } from './operator-shell';
import type { InventoryCommerceTab } from './operator-types';
import { SaleDetailPanel } from './sale-detail-panel';

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border bg-primary/10 px-2 font-medium text-primary text-xs">
      {value.replaceAll('_', ' ')}
    </span>
  );
}

function formatDate(value: string | null, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function CommerceTabs({
  onChange,
  tab,
}: {
  onChange: (tab: InventoryCommerceTab) => void;
  tab: InventoryCommerceTab;
}) {
  const t = useTranslations('inventory.operator.commerce.tabs');
  const tabs: Array<{
    icon: typeof CreditCard;
    label: string;
    value: InventoryCommerceTab;
  }> = [
    { icon: CreditCard, label: t('checkouts'), value: 'checkouts' },
    { icon: ShieldCheck, label: t('sales'), value: 'sales' },
  ];

  return (
    <div
      aria-label={t('label')}
      className="inline-grid grid-cols-2 rounded-lg border border-border bg-muted/25 p-1"
      role="tablist"
    >
      {tabs.map((item) => {
        const Icon = item.icon;
        const active = item.value === tab;

        return (
          <button
            aria-selected={active}
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 font-medium text-sm transition ${
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            key={item.value}
            onClick={() => onChange(item.value)}
            role="tab"
            type="button"
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckoutRows({
  rows,
  wsId,
}: {
  rows: InventoryCheckoutSession[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator');
  const actionText = useTranslations('inventory.operator.forms');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const releaseCheckout = useMutation({
    mutationFn: (row: InventoryCheckoutSession) =>
      releaseInventoryCheckout(wsId, row.id),
    onError: () => toast.error(actionText('saveError')),
    onSuccess: () => {
      toast.success(actionText('saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });

  if (rows.length === 0) {
    return (
      <EmptyRow
        description={t('emptyDescriptions.checkouts')}
        label={t('empty')}
      />
    );
  }

  return (
    <div className="grid gap-2">
      {rows.map((row) => {
        const date = formatDate(row.completedAt ?? row.expiresAt, locale);

        return (
          <article
            className="grid gap-3 rounded-lg border border-border bg-card p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            key={row.id}
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="truncate font-medium">
                  {row.customerName || row.publicToken}
                </p>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                <span>{row.customerEmail}</span>
                {date ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {date}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              <StatusBadge value={row.status} />
              {row.polarStatus ? <StatusBadge value={row.polarStatus} /> : null}
              <StatusBadge value={currency(row.totalAmount, row.currency)} />
              <button
                className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 font-medium text-xs disabled:opacity-50"
                disabled={
                  row.status === 'completed' || releaseCheckout.isPending
                }
                onClick={() => releaseCheckout.mutate(row)}
                type="button"
              >
                <RotateCcw className="h-4 w-4" />
                {t('commerce.release')}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SaleRows({
  query,
  rows,
  wsId,
}: {
  query: string;
  rows: InventorySaleSummary[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator');
  const actionText = useTranslations('inventory.operator.forms');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const deleteSale = useMutation({
    mutationFn: (row: InventorySaleSummary) =>
      deleteInventorySale(wsId, row.id),
    onError: () => toast.error(actionText('deleteError')),
    onSuccess: () => {
      toast.success(actionText('deleteSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((row) =>
      [
        row.customer_name,
        row.id,
        row.completed_at,
        row.created_at,
        String(row.paid_amount),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [query, rows]);

  if (filteredRows.length === 0) {
    return (
      <EmptyRow description={t('emptyDescriptions.sales')} label={t('empty')} />
    );
  }

  return (
    <div className="grid gap-2">
      {filteredRows.map((row) => {
        const date = formatDate(row.completed_at ?? row.created_at, locale);

        return (
          <article
            className="grid gap-3 rounded-lg border border-border bg-card p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            key={row.id}
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="truncate font-medium">
                  {row.customer_name ?? row.id}
                </p>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                <span>{t('commerce.items', { count: row.items_count })}</span>
                {date ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {date}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              <StatusBadge value={currency(row.paid_amount)} />
              <button
                className="inline-flex h-8 items-center gap-2 rounded-md border border-destructive/30 px-2 font-medium text-destructive text-xs disabled:opacity-50"
                disabled={deleteSale.isPending}
                onClick={() => deleteSale.mutate(row)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                {actionText('delete')}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function CommercePanel({
  checkouts,
  query,
  sales,
  setTab,
  tab,
  wsId,
}: {
  checkouts: InventoryCheckoutSession[];
  query: string;
  sales: InventorySaleSummary[];
  setTab: (tab: InventoryCommerceTab) => void;
  tab: InventoryCommerceTab;
  wsId: string;
}) {
  return (
    <div className="grid gap-3">
      <CommerceTabs onChange={setTab} tab={tab} />
      {tab === 'checkouts' ? (
        <CheckoutRows rows={checkouts} wsId={wsId} />
      ) : (
        <>
          <SaleRows query={query} rows={sales} wsId={wsId} />
          <SaleDetailPanel sales={sales} wsId={wsId} />
        </>
      )}
    </div>
  );
}
