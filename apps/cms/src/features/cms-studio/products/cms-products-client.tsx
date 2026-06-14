'use client';

import { useQuery } from '@tanstack/react-query';
import { Package, Search } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface CmsCommerceProduct {
  category: string | null;
  id: string;
  name: string;
  price: number | null;
  stock: number;
}

const numberFormatter = new Intl.NumberFormat();

export function CmsProductsClient({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('external-projects');
  const [search, setSearch] = useState('');
  const productsQuery = useQuery({
    queryFn: async (): Promise<CmsCommerceProduct[]> => {
      const response = await fetch(
        `/api/v1/commerce/products?wsId=${encodeURIComponent(workspaceId)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        return [];
      }
      return response.json();
    },
    queryKey: ['cms-commerce-products', workspaceId],
    retry: false,
    staleTime: 60_000,
  });

  const products = productsQuery.data ?? [];
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        (product.category?.toLowerCase().includes(query) ?? false)
    );
  }, [products, search]);

  if (productsQuery.isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28 rounded-lg" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className="space-y-5 pb-8">
      <section className="rounded-lg border border-border/70 bg-card/75 p-5">
        <h1 className="font-semibold text-2xl">{t('epm.products_title')}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-6">
          {t('epm.products_description')}
        </p>
        <div className="relative mt-4 w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder={t('epm.products_search_placeholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </section>

      {visible.length === 0 ? (
        <section className="flex flex-col items-center justify-center rounded-lg border border-border/70 border-dashed bg-card/40 px-6 py-16 text-center">
          <Package className="h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">
            {t('epm.products_empty_title')}
          </h2>
          <p className="mt-1 max-w-sm text-muted-foreground text-sm leading-6">
            {t('epm.products_empty_description')}
          </p>
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((product) => (
            <div
              key={product.id}
              className="rounded-lg border border-border/70 bg-card/75 p-4 transition-colors hover:border-foreground/25"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{product.name}</div>
                  {product.category ? (
                    <div className="mt-1 truncate text-muted-foreground text-xs">
                      {product.category}
                    </div>
                  ) : null}
                </div>
                <Badge
                  variant={product.stock > 0 ? 'secondary' : 'outline'}
                  className="shrink-0 rounded-md"
                >
                  {product.stock > 0
                    ? `${numberFormatter.format(product.stock)} ${t('epm.products_stock_label')}`
                    : t('epm.products_out_of_stock')}
                </Badge>
              </div>
              {product.price != null ? (
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-muted-foreground text-xs">
                    {t('epm.products_price_label')}
                  </span>
                  <span className="font-semibold text-lg tabular-nums">
                    {numberFormatter.format(product.price)}
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
