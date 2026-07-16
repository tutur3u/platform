'use client';

import { Loader2, PackageSearch } from '@tuturuuu/icons';
import type {
  InventoryProductSummary,
  InventorySalesPeriodProductScope,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

export function SalesPeriodProductRules({
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  onProductIdsChange,
  onScopeChange,
  productIds,
  products,
  scope,
}: {
  fetchNextPage: () => unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onProductIdsChange: (productIds: string[]) => void;
  onScopeChange: (scope: InventorySalesPeriodProductScope) => void;
  productIds: string[];
  products: InventoryProductSummary[];
  scope: InventorySalesPeriodProductScope;
}) {
  const t = useTranslations('inventory.operator.commerce.periods');
  const [query, setQuery] = useState('');
  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return products;
    return products.filter((product) =>
      [product.name, product.category, product.owner?.name]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(needle))
    );
  }, [products, query]);

  return (
    <fieldset className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-start gap-2">
        <PackageSearch className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <legend className="font-medium text-sm">{t('productRules')}</legend>
          <p className="text-muted-foreground text-xs leading-5">
            {t('productRulesDescription')}
          </p>
        </div>
      </div>
      <Select
        onValueChange={(value) =>
          onScopeChange(value as InventorySalesPeriodProductScope)
        }
        value={scope}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('scopeAll')}</SelectItem>
          <SelectItem value="allowlist">{t('scopeAllowlist')}</SelectItem>
          <SelectItem value="blocklist">{t('scopeBlocklist')}</SelectItem>
        </SelectContent>
      </Select>
      {scope === 'all' ? null : (
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Input
              aria-label={t('searchProducts')}
              className="h-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchProducts')}
              value={query}
            />
            <span className="shrink-0 text-muted-foreground text-xs">
              {t('productsSelected', { count: productIds.length })}
            </span>
          </div>
          <div
            className="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-border bg-background p-1"
            onScroll={(event) => {
              const viewport = event.currentTarget;
              const isNearEnd =
                viewport.scrollHeight -
                  viewport.scrollTop -
                  viewport.clientHeight <
                64;
              if (isNearEnd && hasNextPage && !isFetchingNextPage) {
                void fetchNextPage();
              }
            }}
          >
            {filteredProducts.map((product) => {
              const checked = productIds.includes(product.id);
              return (
                <label
                  className="flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                  key={product.id}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(nextChecked) =>
                      onProductIdsChange(
                        nextChecked === true
                          ? [...new Set([...productIds, product.id])]
                          : productIds.filter((id) => id !== product.id)
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {product.name}
                  </span>
                  {product.category ? (
                    <span className="max-w-28 truncate text-muted-foreground text-xs">
                      {product.category}
                    </span>
                  ) : null}
                </label>
              );
            })}
            {filteredProducts.length === 0 && !hasNextPage ? (
              <p className="px-3 py-6 text-center text-muted-foreground text-xs">
                {t('noProducts')}
              </p>
            ) : null}
            {hasNextPage || isFetchingNextPage ? (
              <Button
                className="mt-1 w-full"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
                size="sm"
                type="button"
                variant="ghost"
              >
                {isFetchingNextPage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {t(isFetchingNextPage ? 'loadingProducts' : 'loadMoreProducts')}
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">
            {scope === 'allowlist'
              ? t('scopeAllowlistDescription')
              : t('scopeBlocklistDescription')}
          </p>
        </div>
      )}
    </fieldset>
  );
}
