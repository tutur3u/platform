'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { History, Loader2, RefreshCw } from '@tuturuuu/icons';
import { getInventoryProductStockHistory } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  groupMovementsByDate,
  MovementCard,
} from './product-stock-history-card';

const PAGE_SIZE = 25;

export function ProductStockHistory({
  productId,
  wsId,
}: {
  productId: string;
  wsId: string;
}) {
  const locale = useLocale();
  const t = useTranslations('inventory.operator.forms.stockHistory');
  const history = useInfiniteQuery({
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getInventoryProductStockHistory(wsId, productId, {
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    queryKey: ['inventory', wsId, 'product-history', productId],
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore
        ? lastPage.pagination.offset + lastPage.pagination.limit
        : undefined,
  });

  if (history.isPending) {
    return (
      <HistoryState icon={<Loader2 className="h-5 w-5 animate-spin" />}>
        {t('loading')}
      </HistoryState>
    );
  }

  if (history.isError) {
    return (
      <HistoryState icon={<History className="h-5 w-5" />}>
        <span>{t('error')}</span>
        <Button onClick={() => history.refetch()} size="sm" type="button">
          <RefreshCw className="h-4 w-4" />
          {t('retry')}
        </Button>
      </HistoryState>
    );
  }

  const movements = history.data.pages.flatMap((page) => page.data);
  if (!movements.length) {
    return (
      <HistoryState icon={<History className="h-5 w-5" />}>
        <span className="font-medium text-foreground">{t('empty')}</span>
        <span>{t('emptyDescription')}</span>
      </HistoryState>
    );
  }

  const groups = groupMovementsByDate(movements, locale);

  return (
    <div className="grid gap-5">
      {groups.map((group) => (
        <section className="grid gap-3" key={group.label}>
          <h3 className="sticky top-0 z-10 border-border border-b bg-background/95 py-2 font-medium text-sm backdrop-blur">
            {group.label}
          </h3>
          <div className="grid gap-3">
            {group.movements.map((movement) => (
              <MovementCard
                key={movement.id}
                locale={locale}
                movement={movement}
              />
            ))}
          </div>
        </section>
      ))}
      {history.hasNextPage ? (
        <Button
          disabled={history.isFetchingNextPage}
          onClick={() => history.fetchNextPage()}
          type="button"
          variant="outline"
        >
          {history.isFetchingNextPage ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          {history.isFetchingNextPage ? t('loadingMore') : t('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}

function HistoryState({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="grid min-h-56 place-items-center rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
      <div className="grid max-w-sm justify-items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-muted">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}
