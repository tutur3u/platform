'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCheck,
  CircleDollarSign,
  Package,
  Save,
  Wallet,
  X,
} from '@tuturuuu/icons';
import type {
  InventorySaleSummary,
  InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import {
  getInventorySale,
  setInventorySalesPeriodBulk,
  updateInventorySale,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SelectField } from './operator-form-fields';
import { currency, money } from './operator-format';
import { NO_PERIOD } from './sales-periods-panel';

export function SaleQuickWalletPicker({
  sale,
  wallets,
  wsId,
}: {
  sale: InventorySaleSummary;
  wallets: Array<{ id: string; name: string }>;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.quickWallet');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [walletId, setWalletId] = useState('');
  const detail = useQuery({
    enabled: open,
    queryFn: () => getInventorySale(wsId, sale.id),
    queryKey: ['inventory', wsId, 'sale', sale.id],
  });
  const currentWalletId = walletId || detail.data?.data.wallet_id || '';
  const mutation = useMutation({
    mutationFn: () =>
      updateInventorySale(wsId, sale.id, { wallet_id: currentWalletId }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'sales'] });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'sale', sale.id],
      });
    },
  });

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        if (nextOpen) setWalletId('');
        setOpen(nextOpen);
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <Button
          aria-label={t('trigger', {
            wallet: sale.wallet_name ?? t('unassigned'),
          })}
          className="h-10 w-full min-w-0 touch-manipulation gap-1.5 sm:h-8 sm:w-auto sm:max-w-44"
          size="sm"
          variant="outline"
        >
          <Wallet className="h-3.5 w-3.5" />
          <span className="truncate">
            {sale.wallet_name ?? t('unassigned')}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(20rem,calc(100vw-1rem))] p-3"
      >
        <div>
          <p className="font-semibold text-sm">{t('title')}</p>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {t('description')}
          </p>
        </div>
        <div className="mt-3 grid gap-2">
          <SelectField
            allowEmpty={false}
            disabled={detail.isPending || mutation.isPending}
            label={t('label')}
            onChange={setWalletId}
            options={wallets}
            placeholder={t('placeholder')}
            searchPlaceholder={t('placeholder')}
            value={currentWalletId}
          />
          <Button
            disabled={
              !currentWalletId ||
              currentWalletId === detail.data?.data.wallet_id ||
              mutation.isPending
            }
            onClick={() => mutation.mutate()}
            size="sm"
            type="button"
          >
            <Save className="h-3.5 w-3.5" />
            {mutation.isPending ? t('saving') : t('save')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SaleAmountPopover({
  sale,
  workspaceCurrency,
}: {
  sale: InventorySaleSummary;
  workspaceCurrency: string;
}) {
  const t = useTranslations('inventory.operator.commerce');
  const amount =
    sale.source === 'finance_invoice'
      ? currency(sale.paid_amount, sale.currency ?? workspaceCurrency)
      : money(sale.paid_amount, sale.currency ?? workspaceCurrency);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="h-10 w-full touch-manipulation gap-1.5 sm:h-8 sm:w-auto"
          size="sm"
          variant="outline"
        >
          <CircleDollarSign className="h-3.5 w-3.5" />
          {amount}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(18rem,calc(100vw-1rem))] p-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">{t('amountDetails')}</p>
            <p className="text-muted-foreground text-xs">
              {t('amountDescription')}
            </p>
          </div>
          <Badge variant="secondary">{amount}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <QuickStat
            icon={Package}
            label={t('items', { count: sale.items_count })}
            value={t('quantity', { count: sale.total_quantity })}
          />
          <QuickStat
            icon={CalendarDays}
            label={t('periods.assignmentLabel')}
            value={sale.period?.name ?? t('periods.unassigned')}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5">
      <Icon className="mb-2 h-4 w-4 text-primary" />
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}

export function BulkSalesPeriodToolbar({
  clearSelection,
  periods,
  sales,
  wsId,
}: {
  clearSelection: () => void;
  periods: InventorySalesPeriod[];
  sales: InventorySaleSummary[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.bulk');
  const periodsT = useTranslations('inventory.operator.commerce.periods');
  const queryClient = useQueryClient();
  const [periodId, setPeriodId] = useState(NO_PERIOD);
  const mutation = useMutation({
    mutationFn: () =>
      setInventorySalesPeriodBulk(wsId, {
        period_id: periodId === NO_PERIOD ? null : periodId,
        sales: sales.map((sale) => ({ id: sale.id, source: sale.source })),
      }),
    onError: () => toast.error(t('updateError')),
    onSuccess: () => {
      toast.success(t('updateSuccess', { count: sales.length }));
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'sales'] });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'sales-periods'],
      });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'commerce-summary'],
      });
    },
  });

  return (
    <div className="sticky bottom-2 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-xl border border-primary/25 bg-background/95 p-2 shadow-lg backdrop-blur sm:top-2 sm:bottom-auto sm:flex sm:flex-wrap sm:items-center">
      <Badge
        className="col-span-2 w-fit gap-1.5 pr-10 sm:col-span-1 sm:pr-2"
        variant="secondary"
      >
        <CheckCheck className="h-3.5 w-3.5" />
        {t('selected', { count: sales.length })}
      </Badge>
      <SelectField
        allowEmpty={false}
        className="min-w-0 flex-1 sm:min-w-44 sm:flex-none"
        label={t('targetPeriod')}
        onChange={setPeriodId}
        options={[{ id: NO_PERIOD, name: periodsT('unassigned') }, ...periods]}
        placeholder={t('targetPeriod')}
        searchPlaceholder={t('targetPeriod')}
        value={periodId}
      />
      <Button
        className="h-10 touch-manipulation sm:h-8"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        size="sm"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        {t('apply')}
      </Button>
      <Button
        aria-label={t('clear')}
        className="absolute top-2 right-2 h-8 w-8 touch-manipulation sm:static"
        onClick={clearSelection}
        size="icon"
        variant="ghost"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
