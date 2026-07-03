'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  CreditCard,
  MonitorSmartphone,
  Percent,
  RotateCcw,
  ShieldCheck,
  TicketPercent,
  User,
} from '@tuturuuu/icons';
import type {
  InventoryCheckoutSession,
  InventoryRevenueShareEarning,
  InventorySaleSummary,
} from '@tuturuuu/internal-api/inventory';
import {
  cancelInventorySquareTerminalCheckout,
  createInventorySquareTerminalCheckout,
  releaseInventoryCheckout,
} from '@tuturuuu/internal-api/inventory';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { OperatorMetricCard } from './operator-dashboard-primitives';
import { currency, money } from './operator-format';
import { EmptyRow, LoadingRows } from './operator-shell';
import type { InventoryCommerceTab } from './operator-types';
import { ProfitSummaryPanel } from './profit-summary-panel';
import {
  PromotionEditButton,
  PromotionFormDialog,
} from './promotion-form-dialog';
import { SaleNoteDialog } from './sale-detail-panel';

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border bg-primary/10 px-2 font-medium text-primary text-xs">
      {value.replaceAll('_', ' ')}
    </span>
  );
}

// A reservation that has been released ends up in the `cancelled` state; surface
// that as "Released" with a distinct icon/tone so terminal holds read clearly.
const CHECKOUT_STATUS_META: Record<
  string,
  { Icon: typeof Clock; key: string; tone: string }
> = {
  cancelled: {
    Icon: RotateCcw,
    key: 'released',
    tone: 'border-border bg-muted text-muted-foreground',
  },
  completed: {
    Icon: CheckCircle2,
    key: 'completed',
    tone: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
  },
  expired: {
    Icon: Ban,
    key: 'expired',
    tone: 'border-destructive/20 bg-destructive/10 text-destructive',
  },
  reserved: {
    Icon: Clock,
    key: 'reserved',
    tone: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
  },
};

function CheckoutStatusBadge({ status }: { status: string }) {
  const t = useTranslations('inventory.operator.commerce');
  const meta = CHECKOUT_STATUS_META[status];
  const Icon = meta?.Icon;
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md border px-2 font-medium text-xs',
        meta?.tone ?? 'border-border bg-primary/10 text-primary'
      )}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {meta ? t(`status.${meta.key}`) : status.replaceAll('_', ' ')}
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
    { icon: Percent, label: t('revenueShare'), value: 'revenue-share' },
    { icon: TicketPercent, label: t('promotions'), value: 'promotions' },
  ];

  return (
    <div
      aria-label={t('label')}
      className="inline-grid grid-cols-2 rounded-lg border border-border bg-muted/25 p-1 sm:grid-cols-4"
      role="tablist"
    >
      {tabs.map((item) => {
        const Icon = item.icon;
        const active = item.value === tab;

        return (
          <Button
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
            variant="ghost"
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Button>
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
  const sendToSquare = useMutation({
    mutationFn: (row: InventoryCheckoutSession) =>
      createInventorySquareTerminalCheckout(wsId, { checkoutId: row.id }),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : actionText('saveError')
      ),
    onSuccess: () => {
      toast.success(actionText('saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  const cancelSquare = useMutation({
    mutationFn: (row: InventoryCheckoutSession) =>
      cancelInventorySquareTerminalCheckout(wsId, row.id),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : actionText('saveError')
      ),
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
        const isSquareCheckout =
          row.checkoutProvider === 'square_terminal' ||
          Boolean(row.squareStatus);
        const squareActive = [
          'cancel_requested',
          'checkout_created',
          'pending',
          'in_progress',
        ].includes(row.squareStatus ?? '');

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
              <CheckoutStatusBadge status={row.status} />
              {row.polarStatus ? <StatusBadge value={row.polarStatus} /> : null}
              {row.squareStatus ? (
                <StatusBadge value={row.squareStatus} />
              ) : null}
              <StatusBadge value={money(row.totalAmount, row.currency)} />
              {isSquareCheckout && row.status === 'reserved' ? (
                row.squareTerminalCheckoutId ? (
                  <Button
                    disabled={!squareActive || cancelSquare.isPending}
                    onClick={() => cancelSquare.mutate(row)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t('commerce.cancelSquare')}
                  </Button>
                ) : (
                  <Button
                    disabled={sendToSquare.isPending}
                    onClick={() => sendToSquare.mutate(row)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <MonitorSmartphone className="h-4 w-4" />
                    {t('commerce.sendSquare')}
                  </Button>
                )
              ) : null}
              {(() => {
                const releasable =
                  row.status === 'reserved' &&
                  !squareActive &&
                  !releaseCheckout.isPending;
                return (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {/* span wrapper so the tooltip still shows on a disabled button */}
                        <span tabIndex={releasable ? undefined : 0}>
                          <Button
                            disabled={!releasable}
                            onClick={() => releaseCheckout.mutate(row)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <RotateCcw className="h-4 w-4" />
                            {t('commerce.release')}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {row.status === 'reserved'
                          ? t('commerce.releaseHint')
                          : t('commerce.releaseUnavailable')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })()}
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
  const locale = useLocale();
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
        const isCheckoutSale = row.source === 'checkout_session';

        return (
          <article
            className="grid gap-3 rounded-lg border border-border bg-card p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            key={row.id}
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                {isCheckoutSale ? (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <p className="truncate font-medium">
                  {row.customer_name ?? row.id}
                </p>
                <StatusBadge
                  value={
                    isCheckoutSale
                      ? t('commerce.source.checkout')
                      : t('commerce.source.finance')
                  }
                />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                <span>{t('commerce.items', { count: row.items_count })}</span>
                {date ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {date}
                  </span>
                ) : null}
                {isCheckoutSale && row.public_token ? (
                  <span className="font-mono">{row.public_token}</span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              <StatusBadge
                value={money(row.paid_amount, row.currency ?? 'USD')}
              />
              {isCheckoutSale ? null : (
                <SaleNoteDialog sale={row} wsId={wsId} />
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PromotionRows({
  rows,
  wsId,
}: {
  rows: ProductPromotion[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.promotions');

  return (
    <div className="grid gap-2">
      <div className="flex justify-end">
        <PromotionFormDialog wsId={wsId} />
      </div>
      {rows.length === 0 ? (
        <EmptyRow description={t('emptyDescription')} label={t('empty')} />
      ) : (
        rows.map((row) => {
          const used = row.current_uses ?? 0;
          const isPercentage = row.use_ratio;

          return (
            <article
              className="grid gap-3 rounded-lg border border-border bg-card p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={row.id}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <TicketPercent className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="truncate font-medium">{row.name}</p>
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs">
                    {row.code}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                  <span>
                    {row.max_uses
                      ? t('usesLabel', { max: row.max_uses, used })
                      : t('usesUnlimited', { used })}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                <StatusBadge
                  value={
                    isPercentage ? `${row.value}%` : currency(Number(row.value))
                  }
                />
                <PromotionEditButton promotion={row} wsId={wsId} />
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}

function RevenueShareRows({
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
                <span>
                  {t('unitsLabel', {
                    count: Number(row.unitsSold),
                  })}
                </span>
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

export function CommercePanel({
  checkouts,
  isLoading,
  promotions,
  query,
  revenueShares,
  sales,
  setTab,
  tab,
  wsId,
}: {
  checkouts: InventoryCheckoutSession[];
  isLoading?: boolean;
  promotions: ProductPromotion[];
  query: string;
  revenueShares: InventoryRevenueShareEarning[];
  sales: InventorySaleSummary[];
  setTab: (tab: InventoryCommerceTab) => void;
  tab: InventoryCommerceTab;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce');
  const reserved = checkouts.filter((row) => row.status === 'reserved').length;
  const completed = checkouts.filter(
    (row) => row.status === 'completed'
  ).length;
  const salesTotal = sales.reduce((total, row) => total + row.paid_amount, 0);
  const salesCurrency = sales.find((row) => row.currency)?.currency ?? 'USD';

  return (
    <div className="grid gap-3">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OperatorMetricCard
          description={t('metrics.reservedDescription')}
          icon={CreditCard}
          label={t('metrics.reserved')}
          tone={reserved > 0 ? 'warning' : 'default'}
          value={reserved}
        />
        <OperatorMetricCard
          description={t('metrics.completedDescription')}
          icon={ShieldCheck}
          label={t('metrics.completed')}
          tone={completed > 0 ? 'success' : 'default'}
          value={completed}
        />
        <OperatorMetricCard
          description={t('metrics.salesDescription')}
          icon={User}
          label={t('metrics.sales')}
          value={sales.length}
        />
        <OperatorMetricCard
          description={t('metrics.revenueDescription')}
          icon={CircleDollarSign}
          label={t('metrics.revenue')}
          value={money(salesTotal, salesCurrency)}
        />
      </div>
      <CommerceTabs onChange={setTab} tab={tab} />
      {isLoading ? (
        <LoadingRows />
      ) : tab === 'checkouts' ? (
        <CheckoutRows rows={checkouts} wsId={wsId} />
      ) : tab === 'promotions' ? (
        <PromotionRows rows={promotions} wsId={wsId} />
      ) : tab === 'revenue-share' ? (
        <RevenueShareRows query={query} rows={revenueShares} />
      ) : (
        <div className="grid gap-3">
          <ProfitSummaryPanel sales={sales} wsId={wsId} />
          <SaleRows query={query} rows={sales} wsId={wsId} />
        </div>
      )}
    </div>
  );
}
