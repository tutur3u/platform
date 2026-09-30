'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createInventoryPrice,
  listInventoryPrices,
  type InventoryProductSummary,
  type InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import { periodAllowsProduct } from '@tuturuuu/inventory-core/effective-prices';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { getAmountStep } from '@tuturuuu/utils/money';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useInventoryActor } from './inventory-session-scope';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import { SelectField } from './operator-form-fields';
import { currency } from './operator-format';
import { getSaleStockOptions } from './sale-create-items';
import { useWorkspaceCurrency } from './workspace-currency';

export function SeasonPricesDialog({
  wsId,
  period,
  products,
}: {
  wsId: string;
  period: InventorySalesPeriod;
  products: InventoryProductSummary[];
}) {
  const t = useTranslations('inventory.operator.commerce.periods');
  const currencyCode = useWorkspaceCurrency();
  const actorId = useInventoryActor();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [stockKey, setStockKey] = useState('');
  const [price, setPrice] = useState('');
  const [startsOn, setStartsOn] = useState(period.starts_at ?? '');
  const [endsOn, setEndsOn] = useState(period.ends_at ?? '');
  const stocks = getSaleStockOptions(products).filter((stock) =>
    periodAllowsProduct(period, stock.productId)
  );
  const selected = stocks.find((stock) => stock.key === stockKey);
  const prices = useQuery({
    queryKey: ['inventory', wsId, 'period-prices', actorId, period.id],
    queryFn: () => listInventoryPrices(wsId, period.id),
    enabled: open,
    staleTime: 0,
  });
  const mutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error(t('choosePriceProduct'));
      return createInventoryPrice(wsId, period.id, {
        product_id: selected.productId,
        unit_id: selected.unitId,
        warehouse_id: selected.warehouseId,
        price: Number(price),
        starts_on: startsOn,
        ends_on: endsOn || null,
      });
    },
    onSuccess: () => {
      toast.success(t('priceSaved'));
      setPrice('');
      void queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'period-prices'],
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('saveError'));
      void queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'period-prices'],
      });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t('prices')}
        </Button>
      </DialogTrigger>
      <OperatorDialogContent size="sm">
        <OperatorDialogHeader
          title={t('prices')}
          description={`${period.name} · ${period.time_zone} · ${currencyCode}`}
        />
        <OperatorDialogBody className="grid gap-3">
          <p className="text-muted-foreground text-sm">
            {t('priceHistoryDescription')}
          </p>
          <SelectField
            label={t('choosePriceProduct')}
            value={stockKey}
            onChange={setStockKey}
            placeholder={t('choosePriceProduct')}
            searchPlaceholder={t('choosePriceProduct')}
            options={stocks.map((stock) => ({
              id: stock.key,
              name: `${stock.productName} · ${stock.unitName} · ${stock.warehouseName}`,
            }))}
          />
          <label className="grid gap-1 text-sm">
            {t('priceAmount', { currency: currencyCode })}
            <Input
              type="number"
              min={0}
              step={getAmountStep(currencyCode)}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            {t('startsAt')}
            <Input
              type="date"
              min={period.starts_at ?? undefined}
              max={period.ends_at ?? undefined}
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            {t('endsAt')}
            <Input
              type="date"
              min={startsOn}
              max={period.ends_at ?? undefined}
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
            />
          </label>
          <Button
            disabled={
              !selected ||
              !price.trim() ||
              !startsOn ||
              mutation.isPending ||
              prices.isError
            }
            onClick={() => mutation.mutate()}
          >
            {t('save')}
          </Button>
          {prices.isError ? (
            <p role="status">{t('pricingUnavailable')}</p>
          ) : null}
          <div className="grid gap-2">
            {(prices.data?.data ?? [])
              .filter(
                (row) =>
                  !selected ||
                  (row.product_id === selected.productId &&
                    row.unit_id === selected.unitId &&
                    row.warehouse_id === selected.warehouseId)
              )
              .map((row) => (
                <div className="rounded-md border p-2 text-sm" key={row.id}>
                  <p>
                    {stocks.find(
                      (stock) =>
                        stock.productId === row.product_id &&
                        stock.unitId === row.unit_id &&
                        stock.warehouseId === row.warehouse_id
                    )?.productName ?? row.product_id}
                  </p>
                  <p>{currency(Number(row.price), row.currency)}</p>
                  <p>
                    {new Date(row.valid_from).toLocaleString(undefined, {
                      timeZone: period.time_zone ?? undefined,
                    })}{' '}
                    —{' '}
                    {row.valid_to
                      ? new Date(row.valid_to).toLocaleString(undefined, {
                          timeZone: period.time_zone ?? undefined,
                        })
                      : '—'}
                  </p>
                </div>
              ))}
          </div>
        </OperatorDialogBody>
      </OperatorDialogContent>
    </Dialog>
  );
}
