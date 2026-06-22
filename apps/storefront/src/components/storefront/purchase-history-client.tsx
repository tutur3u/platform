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
import type { ReactNode } from 'react';
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
    <article className="grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-foreground/5 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
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
        <span className="rounded-full border border-border bg-muted/40 px-3 py-1 font-semibold text-sm tabular-nums">
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

export function PurchaseHistoryClient({
  headerActions,
  storeSlug,
}: {
  headerActions?: ReactNode;
  storeSlug?: string;
}) {
  const t = useTranslations('storefront.history');
  const query = useQuery({
    queryFn: () => listInventoryOrderHistory({ storeSlug }),
    queryKey: ['storefront-order-history', storeSlug ?? 'all'],
  });
  const orders = query.data?.data ?? [];
  const backHref = storeSlug ? `/${storeSlug}` : '/';

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-border border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-xl">{t('title')}</h1>
            <p className="mt-0.5 text-muted-foreground text-sm">
              {storeSlug ? t('storeSubtitle') : t('allStoresSubtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">{headerActions}</div>
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild size="sm" variant="ghost">
            <Link href={backHref}>
              <ArrowLeft className="size-4" />
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
            <RefreshCw className="size-4" />
            {query.isFetching ? t('refreshing') : t('refresh')}
          </Button>
        </div>

        {query.isPending ? (
          <div className="grid gap-3">
            {['a', 'b', 'c'].map((key) => (
              <div
                className="h-28 animate-pulse rounded-2xl border border-border bg-muted/35"
                key={key}
              />
            ))}
          </div>
        ) : query.isError ? (
          <section className="rounded-2xl border border-destructive/25 bg-destructive/10 p-5 text-destructive">
            <p className="font-semibold">{t('errorTitle')}</p>
            <p className="mt-1 text-sm opacity-80">{t('errorDescription')}</p>
          </section>
        ) : orders.length === 0 ? (
          <section className="grid min-h-72 place-items-center rounded-2xl border border-border border-dashed bg-card p-6 text-center">
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
    </main>
  );
}
