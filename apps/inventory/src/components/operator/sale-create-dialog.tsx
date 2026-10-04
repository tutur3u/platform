'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CircleDollarSign,
  PackagePlus,
  Pin,
  ReceiptText,
  Save,
  ShoppingCart,
} from '@tuturuuu/icons';
import type {
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
  InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import {
  createInventorySale,
  listInventoryProducts,
} from '@tuturuuu/internal-api/inventory';
import { defaultSalesPeriod } from '@tuturuuu/inventory-core/effective-prices';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Dialog, DialogTrigger } from '@tuturuuu/ui/dialog';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useInventoryActor } from './inventory-session-scope';
import {
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
  OperatorDialogTabs,
} from './operator-dialog-shell';
import { SelectField } from './operator-form-fields';
import { currency } from './operator-format';
import { SaleCheckout } from './sale-checkout';
import {
  getSaleStockOptions,
  type SaleCartLine,
  type SaleStockOption,
  updateSaleCartQuantity,
} from './sale-create-items';
import {
  SaleProductPicker,
  type SaleProductSort,
  sortSaleStockOptions,
} from './sale-product-picker';
import { useSeasonSalePrices } from './season-sale-prices';
import { useHybridSearchResults } from './use-hybrid-search-results';

const SALE_TABS = ['items', 'checkout'] as const;
const SALE_PRODUCT_SEARCH_SCOPE = {
  category: '',
  owner: '',
  sort: 'created-desc',
  status: 'all',
  warehouse: '',
};

export function SaleCreateDialog({
  options,
  periods,
  products,
  fetchNextProductsPage,
  hasNextProductsPage = false,
  isFetchingNextProductsPage = false,
  isProductsError = false,
  productsPageCount,
  mobileFab = false,
  workspaceCurrency,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
  periods: InventorySalesPeriod[];
  products: InventoryProductSummary[];
  fetchNextProductsPage?: () => unknown;
  hasNextProductsPage?: boolean;
  isFetchingNextProductsPage?: boolean;
  isProductsError?: boolean;
  productsPageCount?: number;
  mobileFab?: boolean;
  workspaceCurrency: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.createSale');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('items');
  const [query, setQuery] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [productSort, setProductSort] = useState<SaleProductSort>('name-asc');
  const [lines, setLines] = useState<SaleCartLine[]>([]);
  const [content, setContent] = useState('');
  const [notes, setNotes] = useState('');
  const [walletId, setWalletId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [periodId, setPeriodId] = useState('choose');
  const [requestId, setRequestId] = useState('');
  const actorId = useInventoryActor();
  const selectedPeriod = periods.find((period) => period.id === periodId);
  const [keepOpenAfterSale, setKeepOpenAfterSale] = useState(false);
  const [serverQuery] = useDebounce(query, 280);
  const hasProductSearch = Boolean(query.trim() || productCategoryFilter);
  const productSearchQuery = useInfiniteQuery({
    enabled: open && Boolean(serverQuery.trim() || productCategoryFilter),
    initialPageParam: 1,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) =>
      listInventoryProducts(wsId, {
        categoryId: productCategoryFilter || undefined,
        page: pageParam,
        pageSize: 100,
        q: serverQuery,
        status: 'all',
      }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.data.length, 0);
      return lastPage.data.length > 0 && loaded < lastPage.count
        ? pages.length + 1
        : undefined;
    },
    queryKey: [
      'inventory',
      wsId,
      'products',
      { ...SALE_PRODUCT_SEARCH_SCOPE, category: productCategoryFilter },
      actorId,
      serverQuery,
    ],
  });
  const productSearch = useHybridSearchResults({
    getId: (product) => product.id,
    isFetching: productSearchQuery.isFetching,
    query,
    queryKey: [
      'inventory',
      wsId,
      'products',
      { ...SALE_PRODUCT_SEARCH_SCOPE, category: productCategoryFilter },
      actorId,
    ],
    serverQuery,
    // Disabled/placeholder search data belongs to an earlier query, never the
    // unfiltered catalog. Keep base rows available during debounce and on clear.
    visibleItems:
      hasProductSearch &&
      query.trim() === serverQuery.trim() &&
      !productSearchQuery.isPlaceholderData
        ? [
            ...products,
            ...(productSearchQuery.data?.pages.flatMap((page) => page.data) ??
              []),
          ]
        : products,
  });
  const seasonPricing = useSeasonSalePrices({
    wsId,
    period: selectedPeriod,
    open,
    options: getSaleStockOptions(productSearch.results),
    currency: workspaceCurrency,
  });
  const stockOptions = periodId === 'choose' ? [] : seasonPricing.options;

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortSaleStockOptions(
      stockOptions.filter(
        (option) =>
          (!productCategoryFilter ||
            option.categoryId === productCategoryFilter) &&
          (!warehouseFilter || option.warehouseId === warehouseFilter) &&
          (!needle ||
            [option.productName, option.unitName, option.warehouseName]
              .join(' ')
              .toLowerCase()
              .includes(needle))
      ),
      productSort
    );
  }, [
    productCategoryFilter,
    productSort,
    query,
    stockOptions,
    warehouseFilter,
  ]);
  const productCategories = useMemo(
    () =>
      [
        ...new Map([
          ...(options?.categories ?? []).flatMap<[string, string]>(
            (category) =>
              category.id ? [[category.id, category.name ?? category.id]] : []
          ),
          ...stockOptions.flatMap<[string, string]>((option) =>
            option.categoryId
              ? [
                  [
                    option.categoryId,
                    option.categoryName ??
                      options?.categories.find(
                        (category) => category.id === option.categoryId
                      )?.name ??
                      option.categoryId,
                  ],
                ]
              : []
          ),
        ]),
      ].map(([id, name]) => ({ id, name })),
    [options?.categories, stockOptions]
  );
  const warehouses = useMemo(
    () =>
      [
        ...new Map([
          ...(options?.warehouses ?? []).flatMap<[string, string]>(
            (warehouse) =>
              warehouse.id
                ? [[warehouse.id, warehouse.name ?? warehouse.id]]
                : []
          ),
          ...stockOptions.map<[string, string]>((option) => [
            option.warehouseId,
            option.warehouseName,
          ]),
        ]),
      ].map(([id, name]) => ({ id, name })),
    [options?.warehouses, stockOptions]
  );
  const showUnitOnMobile =
    hasNextProductsPage ||
    new Set(stockOptions.map((option) => option.unitId)).size > 1;
  const showWarehouseOnMobile =
    hasNextProductsPage ||
    new Set(stockOptions.map((option) => option.warehouseId)).size > 1;
  const total = lines.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0
  );
  const canSubmit = Boolean(
    lines.length > 0 &&
      content.trim() &&
      walletId &&
      categoryId &&
      periodId !== 'choose' &&
      seasonPricing.cartIsCurrent(lines)
  );
  const tabIndex = SALE_TABS.indexOf(tab as (typeof SALE_TABS)[number]);
  const canGoNext = lines.length > 0;

  const reset = () => {
    const wallets = options?.wallets ?? [];
    const categories = options?.financeCategories ?? [];
    setTab('items');
    setQuery('');
    setProductCategoryFilter('');
    setWarehouseFilter('');
    setProductSort('name-asc');
    setLines([]);
    setContent(t('defaultTitle'));
    setNotes('');
    setWalletId(
      options?.defaultRevenueWalletId ||
        options?.defaultWalletId ||
        (wallets.length === 1 ? wallets[0]!.id : '')
    );
    setCategoryId(
      options?.defaultFinanceCategoryId ||
        (categories.length === 1 ? (categories[0]!.id ?? '') : '')
    );
    setRequestId(crypto.randomUUID());
    setPeriodId(defaultSalesPeriod(periods, options?.defaultSalesPeriodId));
  };

  const mutation = useMutation({
    mutationFn: () =>
      createInventorySale(wsId, {
        category_id: categoryId,
        content: content.trim(),
        notes: notes.trim() || undefined,
        period_id: periodId === 'none' ? null : periodId,
        request_id: requestId,
        products: lines.map((line) => ({
          category_id: categoryId,
          price: line.price,
          price_id: line.priceId,
          product_id: line.productId,
          quantity: line.quantity,
          unit_id: line.unitId,
          warehouse_id: line.warehouseId,
        })),
        wallet_id: walletId,
      }),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('createError'));
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'period-prices'],
      });
    },
    onSuccess: (result) => {
      toast.success(t('createSuccess'));
      if (result.period_assignment_warning) {
        toast.warning(result.period_assignment_warning);
      }
      if (keepOpenAfterSale) {
        reset();
      } else {
        setOpen(false);
      }
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'sales'] });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'commerce-summary'],
      });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'sales-periods'],
      });
    },
  });

  const submitSale = () => {
    if (!canSubmit || mutation.isPending) return;
    mutation.mutate();
  };

  const changePeriod = (id: string) => {
    if (id === periodId) return;
    setPeriodId(id);
    setLines([]);
    setRequestId(crypto.randomUUID());
  };

  const setLineQuantity = (option: SaleStockOption, quantity: number) => {
    setLines((current) => updateSaleCartQuantity(current, option, quantity));
    if (!categoryId && option.financeCategoryId) {
      setCategoryId(option.financeCategoryId);
    }
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) reset();
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button
          aria-label={t('trigger')}
          className={cn(
            'w-full touch-manipulation sm:w-auto',
            mobileFab &&
              'fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 h-14 w-14 rounded-full shadow-xl sm:static sm:h-8 sm:w-auto sm:rounded-md sm:shadow-none'
          )}
          size="sm"
          type="button"
        >
          <ReceiptText className="h-4 w-4" />
          <span className={cn(mobileFab && 'sr-only sm:not-sr-only')}>
            {t('trigger')}
          </span>
        </Button>
      </DialogTrigger>
      <OperatorDialogContent mobileFullscreen size="lg">
        <OperatorDialogHeader
          description={t('description')}
          mobileCollapsibleDescription
          title={t('title')}
        />
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid gap-2 p-3">
            <SelectField
              allowEmpty={false}
              label={t('period')}
              onChange={changePeriod}
              options={[
                { id: 'choose', name: t('choosePeriod') },
                { id: 'none', name: t('noPeriod') },
                ...periods.filter((period) => period.status === 'active'),
              ]}
              value={periodId}
              placeholder={t('choosePeriod')}
              searchPlaceholder={t('period')}
            />
            {seasonPricing.scheduled ? (
              <p className="text-muted-foreground text-sm">
                {t('seasonPricing')}
              </p>
            ) : null}
            {seasonPricing.scheduled &&
            (seasonPricing.prices.isError || !stockOptions.length) ? (
              <p role="status" className="text-muted-foreground text-sm">
                {t('missingSeasonPrice')}
              </p>
            ) : null}
            {!seasonPricing.cartIsCurrent(lines) ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLines([]);
                  setRequestId(crypto.randomUUID());
                  void seasonPricing.prices.refetch();
                }}
              >
                {t('refreshCart')}
              </Button>
            ) : null}
          </div>
          <OperatorDialogTabs
            compactMobile
            onValueChange={setTab}
            tabs={[
              {
                badge: lines.length,
                content: (
                  <SaleProductPicker
                    categories={productCategories}
                    categoryFilter={productCategoryFilter}
                    fetchNextPage={
                      hasProductSearch
                        ? () => productSearchQuery.fetchNextPage()
                        : fetchNextProductsPage
                    }
                    hasNextPage={
                      hasProductSearch
                        ? productSearchQuery.hasNextPage
                        : hasNextProductsPage
                    }
                    isFetchingNextPage={
                      hasProductSearch
                        ? productSearchQuery.isFetchingNextPage
                        : isFetchingNextProductsPage
                    }
                    isRefreshing={productSearch.status.isRefreshing}
                    isPaginationError={
                      hasProductSearch
                        ? productSearchQuery.isError ||
                          productSearchQuery.isFetchNextPageError
                        : isProductsError
                    }
                    paginationVersion={
                      hasProductSearch
                        ? (productSearchQuery.data?.pages.length ?? 0)
                        : (productsPageCount ?? products.length)
                    }
                    lines={lines}
                    onCategoryFilterChange={setProductCategoryFilter}
                    onQueryChange={setQuery}
                    onQuantityChange={setLineQuantity}
                    onSortChange={setProductSort}
                    onWarehouseFilterChange={setWarehouseFilter}
                    options={filteredOptions}
                    query={query}
                    searchState={
                      productSearch.status.hasCompleteCache
                        ? 'allCached'
                        : productSearch.status.isLocalFirst
                          ? 'localFirst'
                          : productSearch.status.isRefreshing
                            ? 'refreshing'
                            : 'verified'
                    }
                    serverResultCount={productSearch.results.length}
                    sort={productSort}
                    showUnitOnMobile={showUnitOnMobile}
                    showWarehouseOnMobile={showWarehouseOnMobile}
                    warehouseFilter={warehouseFilter}
                    warehouses={warehouses}
                    workspaceCurrency={workspaceCurrency}
                  />
                ),
                icon: <PackagePlus className="h-4 w-4" />,
                label: t('itemsTab'),
                value: 'items',
                contentClassName: 'flex flex-col overflow-hidden',
              },
              {
                badge: lines.length,
                content: (
                  <SaleCheckout
                    lines={lines}
                    onLinesChange={setLines}
                    currencyCode={workspaceCurrency}
                    showUnitOnMobile={showUnitOnMobile}
                    showWarehouseOnMobile={showWarehouseOnMobile}
                    content={content}
                    onContentChange={setContent}
                    notes={notes}
                    onNotesChange={setNotes}
                    walletId={walletId}
                    onWalletChange={setWalletId}
                    categoryId={categoryId}
                    onCategoryChange={setCategoryId}
                    options={options}
                    canSubmit={canSubmit}
                  />
                ),
                icon: <ShoppingCart className="h-4 w-4" />,
                label: t('checkoutTab'),
                value: 'checkout',
              },
            ]}
            value={tab}
          />
          <OperatorDialogFooter className="flex-row flex-wrap items-center gap-1.5 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-2 sm:px-6 sm:py-4">
            <p className="mr-auto flex min-w-0 items-center gap-1.5 font-semibold text-sm tabular-nums">
              <span className="sr-only">
                {t('total', {
                  amount: currency(total, workspaceCurrency),
                })}
              </span>
              <CircleDollarSign className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span aria-hidden="true" className="truncate">
                {currency(total, workspaceCurrency)}
              </span>
            </p>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border bg-background/70 px-2 py-1 text-muted-foreground text-xs transition-colors hover:text-foreground">
              <Checkbox
                aria-label={t('keepOpen')}
                checked={keepOpenAfterSale}
                className="h-4 w-4"
                disabled={mutation.isPending}
                onCheckedChange={(checked) =>
                  setKeepOpenAfterSale(checked === true)
                }
              />
              <Pin className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('keepOpen')}</span>
            </label>
            {tabIndex > 0 ? (
              <Button
                aria-label={t('back')}
                className="h-9 w-9 shrink-0 touch-manipulation"
                onClick={() => setTab(SALE_TABS[tabIndex - 1] ?? 'items')}
                size="icon"
                title={t('back')}
                type="button"
                variant="outline"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : null}
            {tab !== 'checkout' ? (
              <Button
                aria-label={t('next')}
                className="h-9 w-9 shrink-0 touch-manipulation"
                disabled={!canGoNext}
                onClick={() => setTab(SALE_TABS[tabIndex + 1] ?? 'checkout')}
                size="icon"
                title={t('next')}
                type="button"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                aria-label={mutation.isPending ? t('creating') : t('create')}
                className="h-9 shrink-0 touch-manipulation gap-2 px-3"
                disabled={!canSubmit || mutation.isPending}
                onClick={submitSale}
                size="sm"
                title={mutation.isPending ? t('creating') : t('create')}
                type="button"
              >
                <Save className="h-4 w-4" />
                <span>{mutation.isPending ? t('creating') : t('create')}</span>
              </Button>
            )}
          </OperatorDialogFooter>
        </div>
      </OperatorDialogContent>
    </Dialog>
  );
}
