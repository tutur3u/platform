'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Package,
  PackagePlus,
  Plus,
  ReceiptText,
  Search,
} from '@tuturuuu/icons';
import type {
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
  InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import { createInventorySale } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
  OperatorDialogTabs,
} from './operator-dialog-shell';
import { SelectField, TextAreaField, TextField } from './operator-form-fields';
import { currency } from './operator-format';
import {
  CartEditor,
  getSaleStockOptions,
  type SaleCartLine,
  type SaleStockOption,
} from './sale-create-items';

const SALE_TABS = ['items', 'payment', 'review'] as const;

export function SaleCreateDialog({
  options,
  periods,
  products,
  fetchNextProductsPage,
  hasNextProductsPage = false,
  isFetchingNextProductsPage = false,
  workspaceCurrency,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
  periods: InventorySalesPeriod[];
  products: InventoryProductSummary[];
  fetchNextProductsPage?: () => unknown;
  hasNextProductsPage?: boolean;
  isFetchingNextProductsPage?: boolean;
  workspaceCurrency: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.createSale');
  const paginationT = useTranslations('inventory.operator.pagination');
  const filtersT = useTranslations('inventory.operator.filters');
  const queryClient = useQueryClient();
  const stockOptions = useMemo(() => getSaleStockOptions(products), [products]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('items');
  const [query, setQuery] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [lines, setLines] = useState<SaleCartLine[]>([]);
  const [content, setContent] = useState('');
  const [notes, setNotes] = useState('');
  const [walletId, setWalletId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [periodId, setPeriodId] = useState('none');

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return stockOptions.filter(
      (option) =>
        (!productCategoryFilter ||
          option.categoryId === productCategoryFilter) &&
        (!warehouseFilter || option.warehouseId === warehouseFilter) &&
        (!needle ||
          [option.productName, option.unitName, option.warehouseName]
            .join(' ')
            .toLowerCase()
            .includes(needle))
    );
  }, [productCategoryFilter, query, stockOptions, warehouseFilter]);
  const productCategories = useMemo(
    () =>
      [
        ...new Map(
          stockOptions.flatMap((option) =>
            option.categoryId
              ? [[option.categoryId, option.categoryName ?? option.categoryId]]
              : []
          )
        ),
      ].map(([id, name]) => ({ id, name })),
    [stockOptions]
  );
  const warehouses = useMemo(
    () =>
      [
        ...new Map(
          stockOptions.map((option) => [
            option.warehouseId,
            option.warehouseName,
          ])
        ),
      ].map(([id, name]) => ({ id, name })),
    [stockOptions]
  );
  const total = lines.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0
  );
  const canSubmit = Boolean(
    lines.length > 0 && content.trim() && walletId && categoryId
  );
  const tabIndex = SALE_TABS.indexOf(tab as (typeof SALE_TABS)[number]);
  const canGoNext =
    tab === 'items' ? lines.length > 0 : tab === 'payment' ? canSubmit : false;

  const reset = () => {
    const wallets = options?.wallets ?? [];
    const categories = options?.financeCategories ?? [];
    setTab('items');
    setQuery('');
    setProductCategoryFilter('');
    setWarehouseFilter('');
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
    setPeriodId(
      options?.defaultSalesPeriodId &&
        periods.some(
          (period) =>
            period.id === options.defaultSalesPeriodId &&
            period.status === 'active'
        )
        ? options.defaultSalesPeriodId
        : 'none'
    );
  };

  const mutation = useMutation({
    mutationFn: () =>
      createInventorySale(wsId, {
        category_id: categoryId,
        content: content.trim(),
        notes: notes.trim() || undefined,
        period_id: periodId === 'none' ? null : periodId,
        products: lines.map((line) => ({
          category_id: categoryId,
          price: line.price,
          product_id: line.productId,
          quantity: line.quantity,
          unit_id: line.unitId,
          warehouse_id: line.warehouseId,
        })),
        wallet_id: walletId,
      }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('createError')),
    onSuccess: (result) => {
      toast.success(t('createSuccess'));
      if (result.period_assignment_warning) {
        toast.warning(result.period_assignment_warning);
      }
      setOpen(false);
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

  const addLine = (option: SaleStockOption) => {
    setLines((current) => {
      const existing = current.find((line) => line.key === option.key);
      if (existing) {
        return current.map((line) =>
          line.key === option.key
            ? {
                ...line,
                quantity: Math.min(
                  line.quantity + 1,
                  option.amount ?? Number.MAX_SAFE_INTEGER
                ),
              }
            : line
        );
      }
      return [...current, { ...option, quantity: 1 }];
    });
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
          className="w-full touch-manipulation sm:w-auto"
          size="sm"
          type="button"
        >
          <ReceiptText className="h-4 w-4" />
          {t('trigger')}
        </Button>
      </DialogTrigger>
      <OperatorDialogContent mobileFullscreen size="lg">
        <OperatorDialogHeader
          description={t('description')}
          title={t('title')}
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) mutation.mutate();
          }}
        >
          <OperatorDialogTabs
            onValueChange={setTab}
            tabs={[
              {
                badge: lines.length,
                content: (
                  <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                    <section className="grid min-w-0 content-start gap-3">
                      <label className="relative flex items-center">
                        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          aria-label={t('search')}
                          autoComplete="off"
                          className="pl-9"
                          name="product-search"
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder={t('search')}
                          value={query}
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <SelectField
                          label={filtersT('category')}
                          onChange={setProductCategoryFilter}
                          options={productCategories}
                          placeholder={filtersT('allCategories')}
                          value={productCategoryFilter}
                        />
                        <SelectField
                          label={filtersT('warehouse')}
                          onChange={setWarehouseFilter}
                          options={warehouses}
                          placeholder={filtersT('allWarehouses')}
                          value={warehouseFilter}
                        />
                      </div>
                      <div className="grid gap-2 sm:max-h-[24rem] sm:overflow-y-auto sm:pr-1">
                        {filteredOptions.map((option) => {
                          const soldOut =
                            option.amount !== null && option.amount <= 0;
                          return (
                            <div
                              className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-3"
                              key={option.key}
                            >
                              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted/40">
                                {option.imageUrl ? (
                                  // biome-ignore lint/performance/noImgElement: workspace media can be a signed first-party URL.
                                  <img
                                    alt=""
                                    className="h-full w-full object-cover"
                                    src={option.imageUrl}
                                  />
                                ) : (
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-sm">
                                  {option.productName}
                                </p>
                                <p className="line-clamp-2 text-muted-foreground text-xs sm:truncate">
                                  {option.unitName} · {option.warehouseName} ·{' '}
                                  {option.amount === null
                                    ? t('unlimited')
                                    : t('available', { count: option.amount })}
                                </p>
                                <p className="mt-1 font-semibold text-sm sm:hidden">
                                  {currency(option.price, workspaceCurrency)}
                                </p>
                              </div>
                              <span className="hidden shrink-0 font-semibold text-sm sm:block">
                                {currency(option.price, workspaceCurrency)}
                              </span>
                              <Button
                                aria-label={t('addItem', {
                                  name: option.productName,
                                })}
                                disabled={soldOut}
                                className="h-10 w-10 touch-manipulation sm:h-9 sm:w-9"
                                onClick={() => addLine(option)}
                                size="icon"
                                type="button"
                                variant="outline"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                        {filteredOptions.length === 0 ? (
                          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
                            {t('emptyProducts')}
                          </p>
                        ) : null}
                        {hasNextProductsPage ? (
                          <Button
                            className="w-full"
                            disabled={isFetchingNextProductsPage}
                            onClick={() => fetchNextProductsPage?.()}
                            type="button"
                            variant="outline"
                          >
                            {isFetchingNextProductsPage
                              ? paginationT('loadingMore')
                              : paginationT('loadMore')}
                          </Button>
                        ) : null}
                      </div>
                    </section>
                    <CartEditor
                      currencyCode={workspaceCurrency}
                      lines={lines}
                      onChange={setLines}
                    />
                  </div>
                ),
                icon: <PackagePlus className="h-4 w-4" />,
                label: t('itemsTab'),
                value: 'items',
              },
              {
                content: (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      className="sm:col-span-2"
                      label={t('saleName')}
                      maxLength={500}
                      onChange={setContent}
                      placeholder={t('defaultTitle')}
                      value={content}
                    />
                    <SelectField
                      allowEmpty={false}
                      label={t('wallet')}
                      onChange={setWalletId}
                      options={options?.wallets}
                      placeholder={t('chooseWallet')}
                      searchPlaceholder={t('chooseWallet')}
                      value={walletId}
                    />
                    <SelectField
                      allowEmpty={false}
                      label={t('category')}
                      onChange={setCategoryId}
                      options={(options?.financeCategories ?? []).flatMap(
                        (category) =>
                          category.id
                            ? [{ id: category.id, name: category.name }]
                            : []
                      )}
                      placeholder={t('chooseCategory')}
                      searchPlaceholder={t('chooseCategory')}
                      value={categoryId}
                    />
                    <SelectField
                      allowEmpty={false}
                      label={t('period')}
                      onChange={setPeriodId}
                      options={[
                        { id: 'none', name: t('noPeriod') },
                        ...periods.filter(
                          (period) => period.status === 'active'
                        ),
                      ]}
                      placeholder={t('noPeriod')}
                      searchPlaceholder={t('period')}
                      value={periodId}
                    />
                    <TextAreaField
                      className="sm:col-span-2"
                      label={t('notes')}
                      maxLength={2000}
                      onChange={setNotes}
                      placeholder={t('notesPlaceholder')}
                      value={notes}
                    />
                    {!(options?.wallets?.length ?? 0) ||
                    !(options?.financeCategories?.length ?? 0) ? (
                      <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm sm:col-span-2">
                        {t('missingSetup')}
                      </p>
                    ) : null}
                  </div>
                ),
                icon: <CreditCard className="h-4 w-4" />,
                label: t('paymentTab'),
                value: 'payment',
              },
              {
                content: (
                  <div className="grid gap-4">
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {content || t('untitled')}
                          </p>
                          <p className="mt-1 text-muted-foreground text-sm">
                            {t('reviewSummary', {
                              items: lines.length,
                              units: lines.reduce(
                                (sum, line) => sum + line.quantity,
                                0
                              ),
                            })}
                          </p>
                        </div>
                        <p className="font-bold text-xl tabular-nums sm:text-right">
                          {currency(total, workspaceCurrency)}
                        </p>
                      </div>
                    </div>
                    <p className="flex items-start gap-2 text-muted-foreground text-sm leading-6">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" />
                      {t('stockNotice')}
                    </p>
                  </div>
                ),
                icon: <CheckCircle2 className="h-4 w-4" />,
                label: t('reviewTab'),
                value: 'review',
              },
            ]}
            value={tab}
          />
          <OperatorDialogFooter className="grid grid-cols-2 sm:flex">
            <p className="col-span-2 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-muted-foreground text-sm sm:mr-auto sm:block sm:bg-transparent sm:p-0">
              {t('total', { amount: currency(total, workspaceCurrency) })}
            </p>
            <DialogClose asChild>
              <Button
                className="hidden sm:inline-flex"
                type="button"
                variant="ghost"
              >
                {t('cancel')}
              </Button>
            </DialogClose>
            {tabIndex > 0 ? (
              <Button
                className="w-full touch-manipulation"
                onClick={() => setTab(SALE_TABS[tabIndex - 1] ?? 'items')}
                type="button"
                variant="outline"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('back')}
              </Button>
            ) : (
              <DialogClose asChild>
                <Button
                  className="w-full touch-manipulation sm:hidden"
                  type="button"
                  variant="ghost"
                >
                  {t('cancel')}
                </Button>
              </DialogClose>
            )}
            {tab !== 'review' ? (
              <Button
                className="w-full touch-manipulation"
                disabled={!canGoNext}
                onClick={() => setTab(SALE_TABS[tabIndex + 1] ?? 'review')}
                type="button"
              >
                {t('next')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                className="w-full touch-manipulation"
                disabled={!canSubmit || mutation.isPending}
                type="submit"
              >
                <ReceiptText className="h-4 w-4" />
                {mutation.isPending ? t('creating') : t('create')}
              </Button>
            )}
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}
