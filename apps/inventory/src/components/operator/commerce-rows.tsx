'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Loader2,
  MonitorSmartphone,
  Percent,
  RotateCcw,
  ShieldCheck,
  User,
} from '@tuturuuu/icons';
import type {
  InventoryCheckoutSession,
  InventoryRevenueShareEarning,
  InventorySaleSummary,
  InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import {
  cancelInventorySquareTerminalCheckout,
  createInventorySquareTerminalCheckout,
  releaseInventoryCheckout,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  CheckoutStatusBadge,
  formatDate,
  StatusBadge,
} from './commerce-shared';
import { money } from './operator-format';
import { EmptyRow } from './operator-shell';
import { SaleNoteDialog } from './sale-detail-panel';
import { BulkSalesPeriodToolbar, SaleAmountPopover } from './sale-row-actions';
import { SalePeriodPicker } from './sales-periods-panel';

export function CheckoutRows({
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

export function SaleRows({
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  periods,
  query,
  rows,
  workspaceCurrency,
  wsId,
}: {
  fetchNextPage: () => unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  periods: InventorySalesPeriod[];
  query: string;
  rows: InventorySaleSummary[];
  workspaceCurrency: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator');
  const locale = useLocale();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      if (!node || !hasNextPage) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && !isFetchingNextPage) {
            void fetchNextPage();
          }
        },
        { rootMargin: '320px' }
      );
      observerRef.current.observe(node);
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((row) =>
      [
        row.creator_name,
        row.customer_name,
        row.id,
        row.notice,
        row.owners?.join(' '),
        row.completed_at,
        row.created_at,
        String(row.paid_amount),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [query, rows]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedKeys.has(`${row.source}:${row.id}`)),
    [rows, selectedKeys]
  );
  const allVisibleSelected = filteredRows.every((row) =>
    selectedKeys.has(`${row.source}:${row.id}`)
  );
  const selectedVisibleCount = filteredRows.filter((row) =>
    selectedKeys.has(`${row.source}:${row.id}`)
  ).length;

  if (filteredRows.length === 0) {
    return (
      <EmptyRow description={t('emptyDescriptions.sales')} label={t('empty')} />
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={
              allVisibleSelected
                ? true
                : selectedVisibleCount > 0
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(checked) => {
              setSelectedKeys((current) => {
                const next = new Set(current);
                for (const row of filteredRows) {
                  const key = `${row.source}:${row.id}`;
                  if (checked) next.add(key);
                  else next.delete(key);
                }
                return next;
              });
            }}
          />
          {t('commerce.bulk.selectAll', { count: filteredRows.length })}
        </label>
        {selectedRows.length > 0 ? (
          <Badge variant="outline">
            {t('commerce.bulk.selected', { count: selectedRows.length })}
          </Badge>
        ) : null}
      </div>
      {selectedRows.length > 0 ? (
        <BulkSalesPeriodToolbar
          clearSelection={() => setSelectedKeys(new Set())}
          periods={periods}
          sales={selectedRows}
          wsId={wsId}
        />
      ) : null}
      {filteredRows.map((row) => {
        const date = formatDate(row.completed_at ?? row.created_at, locale);
        const isCheckoutSale = row.source === 'checkout_session';
        const selectionKey = `${row.source}:${row.id}`;

        return (
          <article
            className="grid gap-3 rounded-lg border border-border bg-card p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            key={selectionKey}
          >
            <div className="flex min-w-0 items-start gap-3">
              <Checkbox
                aria-label={t('commerce.bulk.selectSale')}
                checked={selectedKeys.has(selectionKey)}
                className="mt-0.5"
                onCheckedChange={(checked) => {
                  setSelectedKeys((current) => {
                    const next = new Set(current);
                    if (checked) next.add(selectionKey);
                    else next.delete(selectionKey);
                    return next;
                  });
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  {isCheckoutSale ? (
                    <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <p className="truncate font-medium">
                    {row.notice?.trim() ||
                      row.customer_name?.trim() ||
                      t('commerce.saleFallback', {
                        id: row.id.slice(0, 8),
                      })}
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
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.creator_name?.trim() ? (
                    <StatusBadge
                      value={t('commerce.creator', {
                        name: row.creator_name.trim(),
                      })}
                    />
                  ) : null}
                  {(row.owners ?? [])
                    .filter((owner) => owner.trim())
                    .map((owner) => (
                      <StatusBadge
                        key={owner}
                        value={t('commerce.owner', { name: owner.trim() })}
                      />
                    ))}
                  {row.customer_name?.trim() && row.notice?.trim() ? (
                    <StatusBadge
                      value={t('commerce.customer', {
                        name: row.customer_name.trim(),
                      })}
                    />
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              <SalePeriodPicker periods={periods} sale={row} wsId={wsId} />
              <SaleAmountPopover
                sale={row}
                workspaceCurrency={workspaceCurrency}
              />
              {isCheckoutSale ? null : (
                <SaleNoteDialog sale={row} wsId={wsId} />
              )}
            </div>
          </article>
        );
      })}
      {hasNextPage ? (
        <div
          className="flex min-h-10 items-center justify-center"
          ref={loadMoreRef}
        >
          {isFetchingNextPage ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 py-2 text-muted-foreground text-xs">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t('commerce.endOfSales')}
        </div>
      )}
    </div>
  );
}

export function RevenueShareRows({
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
