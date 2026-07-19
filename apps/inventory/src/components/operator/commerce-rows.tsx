'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Loader2,
  MonitorSmartphone,
  Package,
  RotateCcw,
  ShieldCheck,
  User,
  UserCheck,
  Wallet,
} from '@tuturuuu/icons';
import type {
  InventoryCheckoutSession,
  InventoryProductSummary,
  InventorySaleSummary,
  InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import {
  cancelInventorySquareTerminalCheckout,
  createInventorySquareTerminalCheckout,
  releaseInventoryCheckout,
} from '@tuturuuu/internal-api/inventory';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
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
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import {
  CheckoutStatusBadge,
  formatDate,
  StatusBadge,
} from './commerce-shared';
import { currency, money } from './operator-format';
import { EmptyRow } from './operator-shell';
import { groupInventorySalesByDate, localDateKey } from './sale-date-groups';
import { SaleNoteDialog } from './sale-detail-panel';
import { filterAndSortInventorySales } from './sale-filters';
import { loadInventorySaleLines, SaleLineItems } from './sale-line-items';
import {
  BulkSalesPeriodToolbar,
  SaleAmountPopover,
  SaleQuickWalletPicker,
} from './sale-row-actions';
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
        const isTerminalCheckout = row.checkoutProvider === 'square_terminal';
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
              {isTerminalCheckout && row.status === 'reserved' ? (
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
  products,
  query,
  rows,
  financeCategories,
  saleCategory,
  saleCreator,
  saleSort,
  saleWarehouse,
  wallets,
  workspaceCurrency,
  wsId,
}: {
  fetchNextPage: () => unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  periods: InventorySalesPeriod[];
  products: InventoryProductSummary[];
  query: string;
  rows: InventorySaleSummary[];
  financeCategories: Array<{ id?: string | null; name?: string }>;
  saleCategory: string;
  saleCreator: string;
  saleSort: string;
  saleWarehouse: string;
  wallets: Array<{ id: string; name: string }>;
  workspaceCurrency: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator');
  const locale = useLocale();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const warehouseMatches = useQuery({
    enabled: Boolean(saleWarehouse),
    queryFn: async () => {
      const matches = new Set<string>();
      let cursor = 0;
      const workers = Array.from(
        { length: Math.min(3, rows.length) },
        async () => {
          while (cursor < rows.length) {
            const sale = rows[cursor];
            cursor += 1;
            if (!sale) continue;
            const lines = await loadInventorySaleLines(wsId, sale);
            if (lines.some((line) => line.warehouse_id === saleWarehouse)) {
              matches.add(`${sale.source}:${sale.id}`);
            }
          }
        }
      );
      await Promise.all(workers);
      return matches;
    },
    queryKey: [
      'inventory',
      wsId,
      'sale-warehouse-filter',
      saleWarehouse,
      rows.map((sale) => `${sale.source}:${sale.id}`).join(','),
    ],
    staleTime: 60_000,
  });
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
    const categoryName = financeCategories.find(
      (category) => category.id === saleCategory
    )?.name;
    return filterAndSortInventorySales({
      categoryName,
      creator: saleCreator,
      query,
      rows,
      sort: saleSort,
      warehouseId: saleWarehouse,
      warehouseMatches: warehouseMatches.data,
    });
  }, [
    financeCategories,
    query,
    rows,
    saleCategory,
    saleCreator,
    saleSort,
    saleWarehouse,
    warehouseMatches.data,
  ]);
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
  const dateGroups = useMemo(
    () => groupInventorySalesByDate(filteredRows),
    [filteredRows]
  );
  const todayKey = localDateKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday);

  if (filteredRows.length === 0) {
    return (
      <div className="grid gap-3">
        <EmptyRow
          description={t('emptyDescriptions.sales')}
          label={t('empty')}
        />
        {hasNextPage ? (
          <Button
            className="w-full sm:mx-auto sm:w-auto"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
            type="button"
            variant="outline"
          >
            {isFetchingNextPage
              ? t('pagination.loadingMore')
              : t('pagination.loadMore')}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-2">
      <div className="hidden min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2 sm:flex">
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
        <div className="hidden sm:block">
          <BulkSalesPeriodToolbar
            clearSelection={() => setSelectedKeys(new Set())}
            periods={periods}
            sales={selectedRows}
            wsId={wsId}
          />
        </div>
      ) : null}
      {dateGroups.map((group) => (
        <section className="grid gap-2" key={group.key}>
          <div className="flex min-w-0 items-center gap-2 px-1 pt-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <h3 className="min-w-0 truncate font-semibold text-sm">
              {group.key === todayKey
                ? t('commerce.dateGroups.today')
                : group.key === yesterdayKey
                  ? t('commerce.dateGroups.yesterday')
                  : group.date
                    ? new Intl.DateTimeFormat(locale, {
                        dateStyle: 'full',
                      }).format(group.date)
                    : t('commerce.dateGroups.undated')}
            </h3>
            <Badge variant="secondary">
              {t('commerce.dateGroups.count', { count: group.rows.length })}
            </Badge>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Accordion className="grid gap-2" type="multiple">
            {group.rows.map((row) => {
              const date = formatDate(
                row.completed_at ?? row.created_at,
                locale
              );
              const isCheckoutSale = row.source === 'checkout_session';
              const selectionKey = `${row.source}:${row.id}`;
              const amount = isCheckoutSale
                ? money(row.paid_amount, row.currency ?? workspaceCurrency)
                : currency(row.paid_amount, row.currency ?? workspaceCurrency);

              return (
                <AccordionItem
                  className="overflow-hidden rounded-lg border border-border bg-card"
                  key={selectionKey}
                  value={selectionKey}
                >
                  <div className="grid gap-2 p-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:p-3">
                    <div className="flex min-w-0 items-start gap-0 sm:gap-3">
                      <Checkbox
                        aria-label={t('commerce.bulk.selectSale')}
                        checked={selectedKeys.has(selectionKey)}
                        className="mt-1 hidden sm:flex"
                        onCheckedChange={(checked) => {
                          setSelectedKeys((current) => {
                            const next = new Set(current);
                            if (checked) next.add(selectionKey);
                            else next.delete(selectionKey);
                            return next;
                          });
                        }}
                      />
                      <AccordionTrigger className="min-w-0 flex-1 gap-2 p-0 hover:no-underline sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            {isCheckoutSale ? (
                              <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <p className="min-w-0 flex-1 truncate font-medium">
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
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
                            <span className="inline-flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              {t('commerce.items', { count: row.items_count })}
                            </span>
                            {date ? (
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {date}
                              </span>
                            ) : null}
                            {isCheckoutSale && row.public_token ? (
                              <span className="font-mono">
                                {row.public_token}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <SaleMetaBadge
                              icon={<CircleDollarSign className="h-3 w-3" />}
                              label={amount}
                              title={t('commerce.amountDetails')}
                            />
                            {isCheckoutSale ? null : (
                              <SaleMetaBadge
                                icon={<Wallet className="h-3 w-3" />}
                                label={
                                  row.wallet_name ??
                                  t('commerce.quickWallet.unassigned')
                                }
                                title={t('commerce.walletLabel')}
                              />
                            )}
                            {row.creator_name?.trim() ? (
                              <SaleMetaBadge
                                icon={<User className="h-3 w-3" />}
                                label={row.creator_name.trim()}
                                title={t('commerce.creatorLabel')}
                              />
                            ) : null}
                            {(row.owners ?? [])
                              .filter((owner) => owner.trim())
                              .map((owner) => (
                                <SaleMetaBadge
                                  icon={<UserCheck className="h-3 w-3" />}
                                  key={owner}
                                  label={owner.trim()}
                                  title={t('commerce.ownersLabel')}
                                />
                              ))}
                            {row.customer_name?.trim() && row.notice?.trim() ? (
                              <SaleMetaBadge
                                icon={<User className="h-3 w-3" />}
                                label={row.customer_name.trim()}
                                title={t('commerce.customerLabel')}
                              />
                            ) : null}
                          </div>
                        </div>
                      </AccordionTrigger>
                    </div>
                    <div className="hidden min-w-0 items-center gap-2 sm:flex sm:flex-wrap sm:justify-end">
                      <SalePeriodPicker
                        periods={periods}
                        sale={row}
                        wsId={wsId}
                      />
                      {isCheckoutSale || wallets.length === 0 ? null : (
                        <SaleQuickWalletPicker
                          sale={row}
                          wallets={wallets}
                          wsId={wsId}
                        />
                      )}
                      <SaleAmountPopover
                        sale={row}
                        workspaceCurrency={workspaceCurrency}
                      />
                      {isCheckoutSale ? null : (
                        <SaleNoteDialog sale={row} wsId={wsId} />
                      )}
                    </div>
                  </div>
                  <AccordionContent className="border-t px-2 pt-2 pb-2 sm:px-3 sm:pt-3 sm:pb-3 sm:pl-12">
                    <div className="mb-2 grid min-w-0 grid-cols-2 items-center gap-1.5 sm:hidden">
                      <SalePeriodPicker
                        periods={periods}
                        sale={row}
                        wsId={wsId}
                      />
                      {isCheckoutSale || wallets.length === 0 ? null : (
                        <SaleQuickWalletPicker
                          sale={row}
                          wallets={wallets}
                          wsId={wsId}
                        />
                      )}
                      <SaleAmountPopover
                        sale={row}
                        workspaceCurrency={workspaceCurrency}
                      />
                      {isCheckoutSale ? null : (
                        <SaleNoteDialog sale={row} wsId={wsId} />
                      )}
                    </div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="font-semibold text-sm">
                        {t('commerce.lineItems')}
                      </p>
                      <span className="text-muted-foreground text-xs">
                        {t('commerce.expandHint')}
                      </span>
                    </div>
                    <SaleLineItems
                      products={products}
                      sale={row}
                      workspaceCurrency={workspaceCurrency}
                      wsId={wsId}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </section>
      ))}
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

function SaleMetaBadge({
  icon,
  label,
  title,
}: {
  icon: ReactNode;
  label: string;
  title: string;
}) {
  return (
    <span
      className="inline-flex h-6 min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 font-medium text-[11px] text-foreground"
      title={`${title}: ${label}`}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="max-w-36 truncate">{label}</span>
    </span>
  );
}
