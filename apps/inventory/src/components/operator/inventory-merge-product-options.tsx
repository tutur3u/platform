'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  getInventoryProduct,
  listInventoryProducts,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';

export function InventoryMergeProductSelect({
  disabled,
  excludeId,
  label,
  onChange,
  value,
  wsId,
}: {
  disabled: boolean;
  excludeId: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.merge');
  const [search, setSearch] = useState('');
  const [knownSelection, setKnownSelection] = useState<{
    id: string;
    wsId: string;
    name: string | null;
  } | null>(null);
  const [query] = useDebounce(search.trim(), 280);
  const products = useInfiniteQuery({
    queryKey: ['inventory', wsId, 'merge-product-options', query],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listInventoryProducts(wsId, {
        page: pageParam,
        pageSize: 50,
        q: query || undefined,
        status: 'active',
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((total, page) => total + page.data.length, 0);
      return lastPage.data.length && loaded < lastPage.count
        ? pages.length + 1
        : undefined;
    },
    retry: false,
  });
  const selected = useQuery({
    queryKey: ['inventory', wsId, 'merge-product-label', value],
    queryFn: () => getInventoryProduct(wsId, value),
    enabled: Boolean(value),
    retry: false,
  });
  const rows = products.data?.pages.flatMap((page) => page.data) ?? [];
  const selectedName =
    rows.find((row) => row.id === value)?.name ??
    selected.data?.name ??
    (knownSelection?.id === value && knownSelection.wsId === wsId
      ? knownSelection.name
      : null);
  return (
    <div className="grid min-w-0 gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <Combobox
        ariaLabel={label}
        className="min-w-0 [&_button[role=combobox]]:min-h-11 [&_button[role=combobox]]:touch-manipulation"
        contentClassName="max-w-[calc(100vw-2rem)] [&_[cmdk-item]]:min-h-11 [&_[cmdk-item]]:break-words"
        disabled={disabled}
        emptyText={products.isFetching ? t('loading') : t('noOptions')}
        hasMore={products.hasNextPage}
        label={
          value
            ? selectedName || t(selected.isError ? 'labelsError' : 'loading')
            : undefined
        }
        loadMoreText={t('loadMore')}
        loadingMore={products.isFetchingNextPage}
        loadingMoreText={t('loading')}
        onChange={(next) => {
          const id = typeof next === 'string' ? next : '';
          setKnownSelection({
            id,
            wsId,
            name: rows.find((row) => row.id === id)?.name ?? null,
          });
          onChange(id);
        }}
        onLoadMore={() => {
          if (!products.isFetching) void products.fetchNextPage();
        }}
        onSearchChange={setSearch}
        options={rows
          .filter((row) => row.id !== excludeId)
          .map((row) => ({
            value: row.id,
            label: row.name || row.id,
          }))}
        placeholder={t('choose')}
        searchPlaceholder={t('searchProducts')}
        selected={value}
        shouldFilter={false}
      />
      {products.isFetching ? <p role="status">{t('loading')}</p> : null}
      {value && !selectedName && selected.isError ? (
        <div role="alert" className="grid gap-1">
          <p className="text-destructive">{t('labelsError')}</p>
          <Button
            className="min-h-11"
            variant="outline"
            onClick={() => void selected.refetch()}
          >
            {t('refresh')}
          </Button>
        </div>
      ) : null}
      {products.isError ? (
        <div role="alert" className="grid gap-1">
          <p className="text-destructive">{t('optionsError')}</p>
          <Button
            className="min-h-11"
            variant="outline"
            onClick={() => void products.refetch()}
          >
            {t('refresh')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function useInventoryMergeProductLabels(
  wsId: string,
  productIds: string[],
  known: Array<{ id: string; name?: string | null }> = []
) {
  const missingIds = [...new Set(productIds)]
    .filter((id) => !known.some((row) => row.id === id && row.name))
    .sort();
  return useQuery({
    queryKey: ['inventory', wsId, 'merge-stock-product-labels', missingIds],
    enabled: missingIds.length > 0,
    retry: false,
    queryFn: async () => {
      const labels: Array<{ id: string; name: string }> = [];
      // Keep large warehouse reviews bounded; no catalog download or table paging required.
      for (let offset = 0; offset < missingIds.length; offset += 4) {
        const batch = await Promise.all(
          missingIds.slice(offset, offset + 4).map(async (id) => {
            const product = await getInventoryProduct(wsId, id);
            if (!product.name) throw new Error('Product label unavailable');
            return { id, name: product.name };
          })
        );
        labels.push(...batch);
      }
      return labels;
    },
  });
}
