'use client';

import {
  ArrowUpDown,
  Check,
  Database,
  ListFilter,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { SelectField } from './operator-form-fields';
import { currency } from './operator-format';
import type { SaleCartLine, SaleStockOption } from './sale-create-items';
import { SaleProductImageDialog } from './sale-product-image-dialog';

export type SaleProductSort =
  | 'name-asc'
  | 'name-desc'
  | 'price-asc'
  | 'price-desc';

export function sortSaleStockOptions(
  options: SaleStockOption[],
  sort: SaleProductSort
) {
  return [...options].sort((left, right) => {
    if (sort === 'price-asc' || sort === 'price-desc') {
      const difference = left.price - right.price;
      return sort === 'price-asc' ? difference : -difference;
    }

    const difference = left.productName.localeCompare(right.productName);
    return sort === 'name-asc' ? difference : -difference;
  });
}

type PickerOption = { id: string; name: string };

export function SaleProductPicker({
  categoryFilter,
  categories,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isRefreshing,
  lines,
  onCategoryFilterChange,
  onQueryChange,
  onQuantityChange,
  onSortChange,
  onWarehouseFilterChange,
  options,
  query,
  searchState,
  serverResultCount,
  showUnitOnMobile,
  showWarehouseOnMobile,
  sort,
  warehouseFilter,
  warehouses,
  workspaceCurrency,
}: {
  categoryFilter: string;
  categories: PickerOption[];
  fetchNextPage?: () => unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isRefreshing: boolean;
  lines: SaleCartLine[];
  onCategoryFilterChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onQuantityChange: (option: SaleStockOption, quantity: number) => void;
  onSortChange: (value: SaleProductSort) => void;
  onWarehouseFilterChange: (value: string) => void;
  options: SaleStockOption[];
  query: string;
  searchState?: 'allCached' | 'localFirst' | 'refreshing' | 'verified';
  serverResultCount: number;
  showUnitOnMobile: boolean;
  showWarehouseOnMobile: boolean;
  sort: SaleProductSort;
  warehouseFilter: string;
  warehouses: PickerOption[];
  workspaceCurrency: string;
}) {
  const t = useTranslations('inventory.operator.commerce.createSale');
  const filtersT = useTranslations('inventory.operator.filters');
  const hybridT = useTranslations('inventory.operator.hybridSearch');
  const paginationT = useTranslations('inventory.operator.pagination');
  const activeFilterCount =
    Number(Boolean(categoryFilter)) + Number(Boolean(warehouseFilter));
  const sortOptions: Array<{ label: string; value: SaleProductSort }> = [
    { label: filtersT('nameAsc'), value: 'name-asc' },
    { label: filtersT('nameDesc'), value: 'name-desc' },
    { label: t('priceLow'), value: 'price-asc' },
    { label: t('priceHigh'), value: 'price-desc' },
  ];

  return (
    <section className="grid min-w-0 content-start gap-2 sm:gap-3">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label={t('search')}
            autoComplete="off"
            className="h-9 pr-10 pl-9 text-sm sm:h-10"
            name="product-search"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('search')}
            value={query}
          />
          {query && isRefreshing ? (
            <Loader2 className="pointer-events-none absolute right-3 h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              aria-label={filtersT('title')}
              className={cn(
                'relative h-9 w-9 shrink-0 sm:h-10 sm:w-10',
                activeFilterCount &&
                  'border-primary/50 bg-primary/5 text-primary'
              )}
              size="icon"
              title={filtersT('title')}
              type="button"
              variant="outline"
            >
              <ListFilter className="h-4 w-4" />
              {activeFilterCount ? (
                <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[min(21rem,calc(100vw-1rem))] p-3"
          >
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm">{filtersT('title')}</p>
                <Button
                  disabled={!activeFilterCount}
                  onClick={() => {
                    onCategoryFilterChange('');
                    onWarehouseFilterChange('');
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {filtersT('clear')}
                </Button>
              </div>
              <SelectField
                label={filtersT('category')}
                onChange={onCategoryFilterChange}
                options={categories}
                placeholder={filtersT('allCategories')}
                value={categoryFilter}
              />
              <SelectField
                label={filtersT('warehouse')}
                onChange={onWarehouseFilterChange}
                options={warehouses}
                placeholder={filtersT('allWarehouses')}
                value={warehouseFilter}
              />
            </div>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              aria-label={filtersT('sort')}
              className="h-9 w-9 shrink-0 sm:h-10 sm:w-10"
              size="icon"
              title={filtersT('sort')}
              type="button"
              variant="outline"
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            <p className="px-2 pt-1 pb-2 font-semibold text-sm">
              {filtersT('sort')}
            </p>
            <div className="grid gap-1">
              {sortOptions.map((option) => (
                <Button
                  className="justify-between"
                  key={option.value}
                  onClick={() => onSortChange(option.value)}
                  size="sm"
                  type="button"
                  variant={sort === option.value ? 'secondary' : 'ghost'}
                >
                  {option.label}
                  {sort === option.value ? <Check className="h-4 w-4" /> : null}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {query && searchState ? (
        <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
          <Badge className="gap-1" variant="outline">
            <Database className="h-3 w-3" />
            {hybridT(searchState)}
          </Badge>
          <span>{hybridT('results', { count: serverResultCount })}</span>
        </div>
      ) : null}

      <div className="grid gap-1.5 sm:max-h-[24rem] sm:gap-2 sm:overflow-y-auto sm:pr-1">
        {options.map((option) => {
          const quantity =
            lines.find((line) => line.key === option.key)?.quantity ?? 0;
          const soldOut = option.amount !== null && option.amount <= 0;
          const atMaximum = option.amount !== null && quantity >= option.amount;

          return (
            <div
              className={cn(
                'grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-2 transition-colors sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:gap-3 sm:p-3',
                quantity > 0 && 'border-primary/30 bg-primary/[0.03]'
              )}
              key={option.key}
            >
              <SaleProductImageDialog
                imageUrl={option.imageUrl}
                name={option.productName}
              />
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">
                  {option.productName}
                </p>
                <p className="truncate text-muted-foreground text-xs sm:hidden">
                  {showUnitOnMobile ? (
                    <>
                      {option.unitName} <span aria-hidden="true">·</span>{' '}
                    </>
                  ) : null}
                  {showWarehouseOnMobile ? (
                    <>
                      {option.warehouseName} <span aria-hidden="true">
                        ·
                      </span>{' '}
                    </>
                  ) : null}
                  {option.amount === null ? (
                    <span title={t('unlimited')}>
                      <span aria-hidden="true">∞</span>
                      <span className="sr-only">{t('unlimited')}</span>
                    </span>
                  ) : (
                    t('available', { count: option.amount })
                  )}
                </p>
                <p className="hidden truncate text-muted-foreground text-xs sm:block">
                  {option.unitName} · {option.warehouseName} ·{' '}
                  {option.amount === null
                    ? '∞'
                    : t('available', { count: option.amount })}
                </p>
                <p className="mt-0.5 font-semibold text-sm sm:mt-1">
                  {currency(option.price, workspaceCurrency)}
                </p>
              </div>
              {quantity > 0 ? (
                <div className="flex h-9 shrink-0 items-center overflow-hidden rounded-lg border bg-background shadow-xs sm:h-10">
                  <Button
                    aria-label={t('decreaseItem', { name: option.productName })}
                    className="h-9 w-8 rounded-none sm:h-10 sm:w-9"
                    onClick={() => onQuantityChange(option, quantity - 1)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span
                    className="flex min-w-8 items-center justify-center gap-1 border-x px-1 font-semibold text-xs tabular-nums"
                    title={t('cartQuantity', { count: quantity })}
                  >
                    <ShoppingCart className="h-3 w-3 text-muted-foreground" />
                    {quantity}
                  </span>
                  <Button
                    aria-label={t('increaseItem', { name: option.productName })}
                    className="h-9 w-8 rounded-none sm:h-10 sm:w-9"
                    disabled={atMaximum}
                    onClick={() => onQuantityChange(option, quantity + 1)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  aria-label={t('addItem', { name: option.productName })}
                  className="h-9 w-9 touch-manipulation sm:h-10 sm:w-10"
                  disabled={soldOut}
                  onClick={() => onQuantityChange(option, 1)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
        {options.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
            {t('emptyProducts')}
          </p>
        ) : null}
        {hasNextPage ? (
          <Button
            className="w-full"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage?.()}
            type="button"
            variant="outline"
          >
            {isFetchingNextPage
              ? paginationT('loadingMore')
              : paginationT('loadMore')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
