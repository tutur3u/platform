'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  CreditCard,
  PackagePlus,
  Plus,
  ReceiptText,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
  OperatorDialogTabs,
} from './operator-dialog-shell';
import { currency } from './operator-format';
import {
  CartEditor,
  getSaleStockOptions,
  type SaleCartLine,
  type SaleStockOption,
} from './sale-create-items';

export function SaleCreateDialog({
  options,
  periods,
  products,
  workspaceCurrency,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
  periods: InventorySalesPeriod[];
  products: InventoryProductSummary[];
  workspaceCurrency: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.createSale');
  const queryClient = useQueryClient();
  const stockOptions = useMemo(() => getSaleStockOptions(products), [products]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('items');
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<SaleCartLine[]>([]);
  const [content, setContent] = useState('');
  const [notes, setNotes] = useState('');
  const [walletId, setWalletId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [periodId, setPeriodId] = useState('none');

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? stockOptions.filter((option) =>
          [option.productName, option.unitName, option.warehouseName]
            .join(' ')
            .toLowerCase()
            .includes(needle)
        )
      : stockOptions;
  }, [query, stockOptions]);
  const total = lines.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0
  );
  const canSubmit = Boolean(
    lines.length > 0 && content.trim() && walletId && categoryId
  );

  const reset = () => {
    const wallets = options?.wallets ?? [];
    const categories = options?.financeCategories ?? [];
    setTab('items');
    setQuery('');
    setLines([]);
    setContent(t('defaultTitle'));
    setNotes('');
    setWalletId(
      options?.defaultWalletId || (wallets.length === 1 ? wallets[0]!.id : '')
    );
    setCategoryId(categories.length === 1 ? (categories[0]!.id ?? '') : '');
    setPeriodId('none');
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
        <Button size="sm" type="button">
          <ReceiptText className="h-4 w-4" />
          {t('trigger')}
        </Button>
      </DialogTrigger>
      <OperatorDialogContent size="lg">
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
                    <section className="grid min-w-0 gap-3">
                      <Input
                        aria-label={t('search')}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('search')}
                        value={query}
                      />
                      <div className="grid max-h-[24rem] gap-2 overflow-y-auto pr-1">
                        {filteredOptions.map((option) => {
                          const soldOut =
                            option.amount !== null && option.amount <= 0;
                          return (
                            <div
                              className="flex min-w-0 items-center gap-3 rounded-lg border p-3"
                              key={option.key}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-sm">
                                  {option.productName}
                                </p>
                                <p className="truncate text-muted-foreground text-xs">
                                  {option.unitName} · {option.warehouseName} ·{' '}
                                  {option.amount === null
                                    ? t('unlimited')
                                    : t('available', { count: option.amount })}
                                </p>
                              </div>
                              <span className="shrink-0 font-semibold text-sm">
                                {currency(option.price, workspaceCurrency)}
                              </span>
                              <Button
                                aria-label={t('addItem', {
                                  name: option.productName,
                                })}
                                disabled={soldOut}
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
                    <label className="grid gap-1.5 text-sm sm:col-span-2">
                      <span className="font-medium">{t('saleName')}</span>
                      <Input
                        maxLength={500}
                        onChange={(event) => setContent(event.target.value)}
                        value={content}
                      />
                    </label>
                    <Select onValueChange={setWalletId} value={walletId}>
                      <SelectTrigger aria-label={t('wallet')}>
                        <SelectValue placeholder={t('chooseWallet')} />
                      </SelectTrigger>
                      <SelectContent>
                        {(options?.wallets ?? []).map((wallet) => (
                          <SelectItem key={wallet.id} value={wallet.id}>
                            {wallet.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select onValueChange={setCategoryId} value={categoryId}>
                      <SelectTrigger aria-label={t('category')}>
                        <SelectValue placeholder={t('chooseCategory')} />
                      </SelectTrigger>
                      <SelectContent>
                        {(options?.financeCategories ?? []).flatMap(
                          (category) =>
                            category.id ? (
                              <SelectItem key={category.id} value={category.id}>
                                {category.name}
                              </SelectItem>
                            ) : (
                              []
                            )
                        )}
                      </SelectContent>
                    </Select>
                    <Select onValueChange={setPeriodId} value={periodId}>
                      <SelectTrigger aria-label={t('period')}>
                        <SelectValue placeholder={t('noPeriod')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('noPeriod')}</SelectItem>
                        {periods
                          .filter((period) => period.status === 'active')
                          .map((period) => (
                            <SelectItem key={period.id} value={period.id}>
                              {period.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <label className="grid gap-1.5 text-sm sm:col-span-2">
                      <span className="font-medium">{t('notes')}</span>
                      <Textarea
                        maxLength={2000}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder={t('notesPlaceholder')}
                        value={notes}
                      />
                    </label>
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
                      <div className="flex items-start justify-between gap-4">
                        <div>
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
                        <p className="font-bold text-xl">
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
          <OperatorDialogFooter>
            <p className="mr-auto text-muted-foreground text-sm">
              {t('total', { amount: currency(total, workspaceCurrency) })}
            </p>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button disabled={!canSubmit || mutation.isPending} type="submit">
              <ReceiptText className="h-4 w-4" />
              {mutation.isPending ? t('creating') : t('create')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}
