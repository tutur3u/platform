'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCheck,
  CircleDollarSign,
  Package,
  X,
} from '@tuturuuu/icons';
import type {
  InventorySaleSummary,
  InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import { setInventorySalesPeriodBulk } from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { currency, money } from './operator-format';
import { NO_PERIOD } from './sales-periods-panel';

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
        <Button className="h-8 gap-1.5" size="sm" variant="outline">
          <CircleDollarSign className="h-3.5 w-3.5" />
          {amount}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
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
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-background/95 p-2 shadow-lg backdrop-blur">
      <Badge className="gap-1.5" variant="secondary">
        <CheckCheck className="h-3.5 w-3.5" />
        {t('selected', { count: sales.length })}
      </Badge>
      <Select onValueChange={setPeriodId} value={periodId}>
        <SelectTrigger className="h-8 min-w-44 flex-1 sm:flex-none">
          <SelectValue placeholder={t('targetPeriod')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PERIOD}>{periodsT('unassigned')}</SelectItem>
          {periods.map((period) => (
            <SelectItem key={period.id} value={period.id}>
              {period.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        className="h-8"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        size="sm"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        {t('apply')}
      </Button>
      <Button
        aria-label={t('clear')}
        className="h-8 w-8"
        onClick={clearSelection}
        size="icon"
        variant="ghost"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
