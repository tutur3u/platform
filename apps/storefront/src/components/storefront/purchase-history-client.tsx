'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Package, ReceiptText, RefreshCw } from '@tuturuuu/icons';
import {
  type InventoryOrderHistoryItem,
  listInventoryOrderHistory,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { formatMoneyFromMinor } from '@tuturuuu/utils/money';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

function formatOrderDate(value: string | null, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function OrderHistoryCard({ order }: { order: InventoryOrderHistoryItem }) {
  const t = useTranslations('storefront.history');
  const locale = useLocale();
  const date = formatOrderDate(order.completedAt ?? order.createdAt, locale);
  const lineSummary =
    order.lines.length > 0
      ? order.lines
          .slice(0, 2)
          .map((line) => `${line.quantity}x ${line.title}`)
          .join(', ')
      : t('noItems');
  const extraCount = Math.max(0, order.lines.length - 2);

  return (
    <article className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/35 text-muted-foreground">
            <ReceiptText className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-sm">
              {order.storefrontName}
            </h2>
            <p className="truncate text-muted-foreground text-xs">
              {date ?? order.publicToken}
            </p>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 text-muted-foreground text-sm">
          {lineSummary}
          {extraCount > 0 ? ` ${t('andMore', { count: extraCount })}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="rounded-md border border-border bg-muted/30 px-3 py-1 font-semibold text-sm tabular-nums">
          {formatMoneyFromMinor(order.totalAmount, order.currency)}
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href={`/${order.storefrontSlug}/orders/${order.publicToken}`}>
            {t('viewOrder')}
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function PurchaseHistoryClient({ storeSlug }: { storeSlug?: string }) {
  const t = useTranslations('storefront.history');
  const query = useQuery({
    queryFn: () => listInventoryOrderHistory({ storeSlug }),
    queryKey: ['storefront-order-history', storeSlug ?? 'all'],
  });
  const orders = query.data?.data ?? [];
  const backHref = storeSlug ? `/${storeSlug}` : '/';

  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-5 py-8 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link href={backHref} prefetch>
            <ArrowLeft aria-hidden className="size-4" />
            {storeSlug ? t('backToStore') : t('backToStorefronts')}
          </Link>
        </Button>
        <Button
          disabled={query.isFetching}
          onClick={() => query.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw
            aria-hidden
            className={query.isFetching ? 'size-4 animate-spin' : 'size-4'}
          />
          <span className="hidden sm:inline">
            {query.isFetching ? t('refreshing') : t('refresh')}
          </span>
          <span className="sr-only sm:hidden">
            {query.isFetching ? t('refreshing') : t('refresh')}
          </span>
        </Button>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-muted/35 text-muted-foreground">
            <ReceiptText aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-semibold text-2xl tracking-tight">
              {t('title')}
            </h1>
            <p className="mt-1 text-pretty text-muted-foreground text-sm leading-6">
              {storeSlug ? t('storeSubtitle') : t('allStoresSubtitle')}
            </p>
          </div>
        </div>
        {query.isSuccess && orders.length > 0 ? (
          <span className="shrink-0 rounded-full border border-border bg-muted/30 px-3 py-1 font-medium text-muted-foreground text-xs tabular-nums">
            {orders.length}
          </span>
        ) : null}
      </div>

      {query.isPending ? (
        <div className="grid gap-3">
          {['a', 'b', 'c'].map((key) => (
            <div
              className="h-28 animate-pulse rounded-xl border border-border bg-muted/35"
              key={key}
            />
          ))}
        </div>
      ) : query.isError ? (
        <section className="rounded-xl border border-destructive/25 bg-destructive/10 p-5 text-destructive">
          <p className="font-semibold">{t('errorTitle')}</p>
          <p className="mt-1 text-sm opacity-80">{t('errorDescription')}</p>
        </section>
      ) : orders.length === 0 ? (
        <section className="grid min-h-72 place-items-center rounded-xl border border-border border-dashed bg-card p-6 text-center">
          <div className="max-w-sm">
            <Package className="mx-auto size-10 text-muted-foreground" />
            <h2 className="mt-4 font-semibold">{t('emptyTitle')}</h2>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              {storeSlug ? t('emptyStoreDescription') : t('emptyDescription')}
            </p>
          </div>
        </section>
      ) : (
        <div className="grid gap-3">
          {orders.map((order) => (
            <OrderHistoryCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </section>
  );
}
